import {
  getMessageTextContent,
  isDalle3,
  safeLocalStorage,
  trimTopic,
} from "../utils";

import { indexedDBStorage } from "@/app/utils/indexedDB-storage";
import { nanoid } from "nanoid";
import type {
  ClientApi,
  MultimodalContent,
  RequestMessage,
} from "../client/api";
import { getClientApi } from "../client/api";
import { ChatControllerPool } from "../client/controller";
import { CompareRequestPool } from "../client/compare-manager";
import type {
  CompareMeta,
  CompareResponse,
  CompareStatus,
} from "../typing";
import { showToast } from "../components/ui-lib";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_MODELS,
  DEFAULT_SYSTEM_TEMPLATE,
  GEMINI_SUMMARIZE_MODEL,
  DEEPSEEK_SUMMARIZE_MODEL,
  KnowledgeCutOffDate,
  MCP_SYSTEM_TEMPLATE,
  MCP_TOOLS_TEMPLATE,
  ServiceProvider,
  StoreKey,
  SUMMARIZE_MODEL,
} from "../constant";
import Locale, { getLang } from "../locales";
import { prettyObject } from "../utils/format";
import { createPersistStore } from "../utils/store";
import { estimateTokenLength } from "../utils/token";
import { ModelConfig, ModelType, useAppConfig } from "./config";
import { useAccessStore } from "./access";
import { collectModelsWithDefaultModel, getModelProvider } from "../utils/model";
import { createEmptyMask, Mask } from "./mask";
import { executeMcpAction, getAllTools, isMcpEnabled } from "../mcp/actions";
import { extractMcpJson, isMcpJson } from "../mcp/utils";

const localStorage = safeLocalStorage();

// ========== 对比模式节流机制（Fix #1: 状态更新风暴） ==========
// 使用 requestAnimationFrame 节流，避免多个模型同时输出时频繁触发 setState
class CompareUpdateThrottle {
  private pendingUpdates = new Map<string, { content: string }>();
  private rafId: number | null = null;

  schedule(requestId: string, modelKey: string, content: string, updateFn: () => void): void {
    const key = `${requestId}:${modelKey}`;
    this.pendingUpdates.set(key, { content });

    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.flush(updateFn);
      });
    }
  }

  private flush(updateFn: () => void): void {
    this.pendingUpdates.clear();
    this.rafId = null;
    updateFn();
  }

  cancel(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingUpdates.clear();
  }
}

const compareUpdateThrottle = new CompareUpdateThrottle();
// ========== 节流机制结束 ==========

export type ChatMessageTool = {
  id: string;
  index?: number;
  type?: string;
  function?: {
    name: string;
    arguments?: string;
  };
  content?: string;
  isError?: boolean;
  errorMsg?: string;
};

// 扩展 ChatMessage 类型，支持多模型对比
export type ChatMessage = RequestMessage & {
  date: string;
  streaming?: boolean;
  isError?: boolean;
  id: string;
  model?: ModelType;
  tools?: ChatMessageTool[];
  audio_url?: string;
  isMcpResponse?: boolean;
  // 对比模式相关字段
  compareMeta?: CompareMeta;
  compareResponses?: CompareResponse[];
};

export function createMessage(override: Partial<ChatMessage>): ChatMessage {
  return {
    id: nanoid(),
    date: new Date().toLocaleString(),
    role: "user",
    content: "",
    ...override,
  };
}

export interface ChatStat {
  tokenCount: number;
  wordCount: number;
  charCount: number;
}

export interface ChatSession {
  id: string;
  topic: string;

  memoryPrompt: string;
  messages: ChatMessage[];
  stat: ChatStat;
  lastUpdate: number;
  lastSummarizeIndex: number;
  clearContextIndexes?: number[];

  mask: Mask;

  // 可选：会话级对比配置
  compareConfig?: {
    enabled: boolean;
    selectedModels: string[];
    layout: 'grid' | 'list';
  };
}

export const DEFAULT_TOPIC = Locale.Store.DefaultTopic;
export const BOT_HELLO: ChatMessage = createMessage({
  role: "assistant",
  content: Locale.Store.BotHello,
});

// 数据迁移函数：将旧的 clearContextIndex 迁移到 clearContextIndexes
function migrateClearContextIndex(session: ChatSession): void {
  if ((session as any).clearContextIndex !== undefined && session.clearContextIndexes === undefined) {
    session.clearContextIndexes = [(session as any).clearContextIndex];
    delete (session as any).clearContextIndex;
  }
}

function createEmptySession(): ChatSession {
  return {
    id: nanoid(),
    topic: DEFAULT_TOPIC,
    memoryPrompt: "",
    messages: [],
    stat: {
      tokenCount: 0,
      wordCount: 0,
      charCount: 0,
    },
    lastUpdate: Date.now(),
    lastSummarizeIndex: 0,

    mask: createEmptyMask(),

    // 初始化对比配置
    compareConfig: {
      enabled: false,
      selectedModels: [],
      layout: 'grid',
    },
  };
}

function getSummarizeModel(
  currentModel: string,
  providerName: string,
): string[] {
  // if it is using gpt-* models, force to use 4o-mini to summarize
  if (currentModel.startsWith("gpt") || currentModel.startsWith("chatgpt")) {
    const configStore = useAppConfig.getState();
    const accessStore = useAccessStore.getState();
    const allModel = collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
    const summarizeModel = allModel.find(
      (m) => m.name === SUMMARIZE_MODEL && m.available,
    );
    if (summarizeModel) {
      return [
        summarizeModel.name,
        summarizeModel.provider?.providerName as string,
      ];
    }
  }
  if (currentModel.startsWith("gemini")) {
    return [GEMINI_SUMMARIZE_MODEL, ServiceProvider.Google];
  } else if (currentModel.startsWith("deepseek-")) {
    return [DEEPSEEK_SUMMARIZE_MODEL, ServiceProvider.DeepSeek];
  }

  return [currentModel, providerName];
}

function countMessages(msgs: ChatMessage[]) {
  return msgs.reduce(
    (pre, cur) => pre + estimateTokenLength(getMessageTextContent(cur)),
    0,
  );
}

function fillTemplateWith(input: string, modelConfig: ModelConfig) {
  const cutoff =
    KnowledgeCutOffDate[modelConfig.model] ?? KnowledgeCutOffDate.default;
  // Find the model in the DEFAULT_MODELS array that matches the modelConfig.model
  const modelInfo = DEFAULT_MODELS.find((m) => m.name === modelConfig.model);

  var serviceProvider = "OpenAI";
  if (modelInfo) {
    // TODO: auto detect the providerName from the modelConfig.model

    // Directly use the providerName from the modelInfo
    serviceProvider = modelInfo.provider.providerName;
  }

  const vars = {
    ServiceProvider: serviceProvider,
    cutoff,
    model: modelConfig.model,
    time: new Date().toString(),
    lang: getLang(),
    input: input,
  };

  let output = modelConfig.template ?? DEFAULT_INPUT_TEMPLATE;

  // remove duplicate
  if (input.startsWith(output)) {
    output = "";
  }

  // must contains {{input}}
  const inputVar = "{{input}}";
  if (!output.includes(inputVar)) {
    output += "\n" + inputVar;
  }

  Object.entries(vars).forEach(([name, value]) => {
    const regex = new RegExp(`{{${name}}}`, "g");
    output = output.replace(regex, value.toString()); // Ensure value is a string
  });

  return output;
}

async function getMcpSystemPrompt(): Promise<string> {
  const tools = await getAllTools();

  let toolsStr = "";

  tools.forEach((i) => {
    // error client has no tools
    if (!i.tools) return;

    toolsStr += MCP_TOOLS_TEMPLATE.replace(
      "{{ clientId }}",
      i.clientId,
    ).replace(
      "{{ tools }}",
      i.tools.tools.map((p: object) => JSON.stringify(p, null, 2)).join("\n"),
    );
  });

  return MCP_SYSTEM_TEMPLATE.replace("{{ MCP_TOOLS }}", toolsStr);
}

const DEFAULT_CHAT_STATE = {
  sessions: [createEmptySession()],
  currentSessionIndex: 0,
  lastInput: "",
};

export const useChatStore = createPersistStore(
  DEFAULT_CHAT_STATE,
  (set, _get) => {
    function get() {
      return {
        ..._get(),
        ...methods,
      };
    }

    const methods = {
      forkSession() {
        // 获取当前会话
        const currentSession = get().currentSession();
        if (!currentSession) return;

        const newSession = createEmptySession();

        newSession.topic = currentSession.topic;
        // 深拷贝消息
        newSession.messages = currentSession.messages.map((msg) => ({
          ...msg,
          id: nanoid(), // 生成新的消息 ID
        }));
        newSession.mask = {
          ...currentSession.mask,
          modelConfig: {
            ...currentSession.mask.modelConfig,
          },
        };
        // 复制对比配置
        if (currentSession.compareConfig) {
          newSession.compareConfig = {
            ...currentSession.compareConfig,
          };
        }

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [newSession, ...state.sessions],
        }));
      },

      clearSessions() {
        set(() => ({
          sessions: [createEmptySession()],
          currentSessionIndex: 0,
        }));
      },

      selectSession(index: number) {
        const currentIndex = get().currentSessionIndex;
        const sessions = get().sessions;

        // 停止当前会话中可能正在进行对比请求
        if (currentIndex >= 0 && currentIndex < sessions.length) {
          const currentSession = sessions[currentIndex];
          const lastMessage = currentSession?.messages[currentSession.messages.length - 1];
          if (lastMessage?.compareMeta) {
            const requestId = lastMessage.compareMeta.requestId;
            ChatControllerPool.stopAllCompare(requestId);
            CompareRequestPool.stop(requestId);
          }
        }

        set({
          currentSessionIndex: index,
        });
      },

      moveSession(from: number, to: number) {
        set((state) => {
          const { sessions, currentSessionIndex: oldIndex } = state;

          // move the session
          const newSessions = [...sessions];
          const session = newSessions[from];
          newSessions.splice(from, 1);
          newSessions.splice(to, 0, session);

          // modify current session id
          let newIndex = oldIndex === from ? to : oldIndex;
          if (oldIndex > from && oldIndex <= to) {
            newIndex -= 1;
          } else if (oldIndex < from && oldIndex >= to) {
            newIndex += 1;
          }

          return {
            currentSessionIndex: newIndex,
            sessions: newSessions,
          };
        });
      },

      newSession(mask?: Mask) {
        const session = createEmptySession();

        if (mask) {
          const config = useAppConfig.getState();
          const globalModelConfig = config.modelConfig;

          session.mask = {
            ...mask,
            modelConfig: {
              ...globalModelConfig,
              ...mask.modelConfig,
            },
          };
          session.topic = mask.name;
        }

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [session].concat(state.sessions),
        }));
      },

      nextSession(delta: number) {
        const n = get().sessions.length;
        const limit = (x: number) => (x + n) % n;
        const i = get().currentSessionIndex;
        get().selectSession(limit(i + delta));
      },

      deleteSession(index: number) {
        const deletingLastSession = get().sessions.length === 1;
        const deletedSession = get().sessions.at(index);

        if (!deletedSession) return;

        // 清理对比请求状态
        const lastMessage = deletedSession.messages[deletedSession.messages.length - 1];
        if (lastMessage?.compareMeta) {
          ChatControllerPool.stopAllCompare(lastMessage.compareMeta.requestId);
          CompareRequestPool.remove(lastMessage.compareMeta.requestId);
        }

        const sessions = get().sessions.slice();
        sessions.splice(index, 1);

        const currentIndex = get().currentSessionIndex;
        let nextIndex = Math.min(
          currentIndex - Number(index < currentIndex),
          sessions.length - 1,
        );

        if (deletingLastSession) {
          nextIndex = 0;
          sessions.push(createEmptySession());
        }

        // for undo delete action
        const restoreState = {
          currentSessionIndex: get().currentSessionIndex,
          sessions: get().sessions.slice(),
        };

        set(() => ({
          currentSessionIndex: nextIndex,
          sessions,
        }));

        showToast(
          Locale.Home.DeleteToast,
          {
            text: Locale.Home.Revert,
            onClick() {
              set(() => restoreState);
            },
          },
          5000,
        );
      },

      currentSession() {
        let index = get().currentSessionIndex;
        const sessions = get().sessions;

        if (index < 0 || index >= sessions.length) {
          index = Math.min(sessions.length - 1, Math.max(0, index));
          set(() => ({ currentSessionIndex: index }));
        }

        const session = sessions[index];

        return session;
      },

      onNewMessage(message: ChatMessage, targetSession: ChatSession) {
        get().updateTargetSession(targetSession, (session) => {
          session.messages = session.messages.concat();
          session.lastUpdate = Date.now();
        });

        get().updateStat(message, targetSession);

        get().checkMcpJson(message);

        get().summarizeSession(false, targetSession);
      },

      async onUserInput(
        content: string,
        attachImages?: string[],
        isMcpResponse?: boolean,
      ) {
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;

        // 检查是否启用对比模式（MCP 响应不走对比模式）
        if (!isMcpResponse && session.compareConfig?.enabled && session.compareConfig.selectedModels.length >= 2) {
          return get().onUserInputWithCompare(content, attachImages);
        }

        // MCP Response no need to fill template
        let mContent: string | MultimodalContent[] = isMcpResponse
          ? content
          : fillTemplateWith(content, modelConfig);

        if (!isMcpResponse && attachImages && attachImages.length > 0) {
          mContent = [
            ...(content ? [{ type: "text" as const, text: content }] : []),
            ...attachImages.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ];
        }

        let userMessage: ChatMessage = createMessage({
          role: "user",
          content: mContent,
          isMcpResponse,
        });

        const botMessage: ChatMessage = createMessage({
          role: "assistant",
          streaming: true,
          model: modelConfig.model,
        });

        // get recent messages
        const recentMessages = await get().getMessagesWithMemory();
        const sendMessages = recentMessages.concat(userMessage);
        const messageIndex = session.messages.length + 1;

        // save user's and bot's message
        get().updateTargetSession(session, (session) => {
          const savedUserMessage = {
            ...userMessage,
            content: mContent,
          };
          session.messages = session.messages.concat([
            savedUserMessage,
            botMessage,
          ]);
        });

        const api: ClientApi = getClientApi(modelConfig.providerName);
        // make request
        api.llm.chat({
          messages: sendMessages,
          config: { ...modelConfig, stream: true },
          onUpdate(message) {
            botMessage.streaming = true;
            if (message) {
              botMessage.content = message;
            }
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          async onFinish(message) {
            botMessage.streaming = false;
            if (message) {
              botMessage.content = message;
              botMessage.date = new Date().toLocaleString();
              get().onNewMessage(botMessage, session);
            }
            ChatControllerPool.remove(session.id, botMessage.id);
          },
          onBeforeTool(tool: ChatMessageTool) {
            (botMessage.tools = botMessage?.tools || []).push(tool);
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          onAfterTool(tool: ChatMessageTool) {
            botMessage?.tools?.forEach((t, i, tools) => {
              if (tool.id == t.id) {
                tools[i] = { ...tool };
              }
            });
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          onError(error) {
            const isAborted = error.message?.includes?.("aborted");
            botMessage.content +=
              "\n\n" +
              prettyObject({
                error: true,
                message: error.message,
              });
            botMessage.streaming = false;
            userMessage.isError = !isAborted;
            botMessage.isError = !isAborted;
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
            ChatControllerPool.remove(
              session.id,
              botMessage.id ?? messageIndex,
            );

            console.error("[Chat] failed ", error);
          },
          onController(controller) {
            // collect controller for stop/retry
            ChatControllerPool.addController(
              session.id,
              botMessage.id ?? messageIndex,
              controller,
            );
          },
        });
      },

      getMemoryPrompt() {
        const session = get().currentSession();

        if (session.memoryPrompt.length) {
          return {
            role: "system",
            content: Locale.Store.Prompt.History(session.memoryPrompt),
            date: "",
          } as ChatMessage;
        }
      },

      async getMessagesWithMemory() {
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;

        // 数据迁移：向后兼容旧的 clearContextIndex
        migrateClearContextIndex(session);

        // 获取最新的清除点索引，如果没有清除点则为 0
        const clearContextIndexes = session.clearContextIndexes ?? [];
        const clearContextIndex = clearContextIndexes.length > 0
          ? Math.max(...clearContextIndexes)
          : 0;
        const messages = session.messages.slice();
        const totalMessageCount = session.messages.length;

        // in-context prompts
        const contextPrompts = session.mask.context.slice();

        // system prompts, to get close to OpenAI Web ChatGPT
        const shouldInjectSystemPrompts =
          modelConfig.enableInjectSystemPrompts &&
          (session.mask.modelConfig.model.startsWith("gpt-") ||
            session.mask.modelConfig.model.startsWith("chatgpt-"));

        const mcpEnabled = await isMcpEnabled();
        const mcpSystemPrompt = mcpEnabled ? await getMcpSystemPrompt() : "";

        var systemPrompts: ChatMessage[] = [];

        if (shouldInjectSystemPrompts) {
          systemPrompts = [
            createMessage({
              role: "system",
              content:
                fillTemplateWith("", {
                  ...modelConfig,
                  template: DEFAULT_SYSTEM_TEMPLATE,
                }) + mcpSystemPrompt,
            }),
          ];
        } else if (mcpEnabled) {
          systemPrompts = [
            createMessage({
              role: "system",
              content: mcpSystemPrompt,
            }),
          ];
        }

        if (shouldInjectSystemPrompts || mcpEnabled) {
          console.log(
            "[Global System Prompt] ",
            systemPrompts.at(0)?.content ?? "empty",
          );
        }
        const memoryPrompt = get().getMemoryPrompt();
        // long term memory
        const shouldSendLongTermMemory =
          modelConfig.sendMemory &&
          session.memoryPrompt &&
          session.memoryPrompt.length > 0 &&
          session.lastSummarizeIndex > clearContextIndex;
        const longTermMemoryPrompts =
          shouldSendLongTermMemory && memoryPrompt ? [memoryPrompt] : [];
        const longTermMemoryStartIndex = session.lastSummarizeIndex;

        // short term memory
        const shortTermMemoryStartIndex = Math.max(
          0,
          totalMessageCount - modelConfig.historyMessageCount,
        );

        // lets concat send messages, including 4 parts:
        // 0. system prompt: to get close to OpenAI Web ChatGPT
        // 1. long term memory: summarized memory messages
        // 2. pre-defined in-context prompts
        // 3. short term memory: latest n messages
        // 4. newest input message
        const memoryStartIndex = shouldSendLongTermMemory
          ? Math.min(longTermMemoryStartIndex, shortTermMemoryStartIndex)
          : shortTermMemoryStartIndex;
        // and if user has cleared history messages, we should exclude the memory too.
        const contextStartIndex = Math.max(clearContextIndex, memoryStartIndex);
        // Use a large threshold to allow historyMessageCount to be the primary limiting factor
        // max_tokens is for response generation, not for limiting input context
        const maxTokenThreshold = 100000;

        // get recent messages as much as possible
        const reversedRecentMessages = [];
        for (
          let i = totalMessageCount - 1, tokenCount = 0;
          i >= contextStartIndex && tokenCount < maxTokenThreshold;
          i -= 1
        ) {
          const msg = messages[i];
          if (!msg || msg.isError) continue;
          tokenCount += estimateTokenLength(getMessageTextContent(msg));
          reversedRecentMessages.push(msg);
        }
        // concat all messages
        const recentMessages = [
          ...systemPrompts,
          ...longTermMemoryPrompts,
          ...contextPrompts,
          ...reversedRecentMessages.reverse(),
        ];

        return recentMessages;
      },

      updateMessage(
        sessionIndex: number,
        messageIndex: number,
        updater: (message?: ChatMessage) => void,
      ) {
        const sessions = get().sessions;
        const session = sessions.at(sessionIndex);
        const messages = session?.messages;
        updater(messages?.at(messageIndex));
        set(() => ({ sessions }));
      },

      resetSession(session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.messages = [];
          session.memoryPrompt = "";
        });
      },

      summarizeSession(
        refreshTitle: boolean = false,
        targetSession: ChatSession,
      ) {
        const config = useAppConfig.getState();
        const session = targetSession;
        const modelConfig = session.mask.modelConfig;
        // skip summarize when using dalle3?
        if (isDalle3(modelConfig.model)) {
          return;
        }

        // if not config compressModel, then using getSummarizeModel
        const [model, providerName] = modelConfig.compressModel
          ? [modelConfig.compressModel, modelConfig.compressProviderName]
          : getSummarizeModel(
              session.mask.modelConfig.model,
              session.mask.modelConfig.providerName,
            );
        const api: ClientApi = getClientApi(providerName as ServiceProvider);

        // remove error messages if any
        const messages = session.messages;

        // should summarize topic after chating more than 50 words
        const SUMMARIZE_MIN_LEN = 50;
        if (
          (config.enableAutoGenerateTitle &&
            session.topic === DEFAULT_TOPIC &&
            countMessages(messages) >= SUMMARIZE_MIN_LEN) ||
          refreshTitle
        ) {
          const startIndex = Math.max(
            0,
            messages.length - modelConfig.historyMessageCount,
          );
          const topicMessages = messages
            .slice(
              startIndex < messages.length ? startIndex : messages.length - 1,
              messages.length,
            )
            .concat(
              createMessage({
                role: "user",
                content: Locale.Store.Prompt.Topic,
              }),
            );
          api.llm.chat({
            messages: topicMessages,
            config: {
              model,
              stream: false,
              providerName,
            },
            onFinish(message, responseRes) {
              if (responseRes?.status === 200) {
                get().updateTargetSession(
                  session,
                  (session) =>
                    (session.topic =
                      message.length > 0 ? trimTopic(message) : DEFAULT_TOPIC),
                );
              }
            },
          });
        }
        const clearContextIndexes = session.clearContextIndexes ?? [];
        const maxClearContextIndex = clearContextIndexes.length > 0
          ? Math.max(...clearContextIndexes)
          : 0;
        const summarizeIndex = Math.max(
          session.lastSummarizeIndex,
          maxClearContextIndex,
        );
        let toBeSummarizedMsgs = messages
          .filter((msg) => !msg.isError)
          .slice(summarizeIndex);

        const historyMsgLength = countMessages(toBeSummarizedMsgs);

        if (historyMsgLength > (modelConfig?.max_tokens || 4000)) {
          const n = toBeSummarizedMsgs.length;
          toBeSummarizedMsgs = toBeSummarizedMsgs.slice(
            Math.max(0, n - modelConfig.historyMessageCount),
          );
        }
        const memoryPrompt = get().getMemoryPrompt();
        if (memoryPrompt) {
          // add memory prompt
          toBeSummarizedMsgs.unshift(memoryPrompt);
        }

        const lastSummarizeIndex = session.messages.length;

        console.log(
          "[Chat History] ",
          toBeSummarizedMsgs,
          historyMsgLength,
          modelConfig.compressMessageLengthThreshold,
        );

        if (
          historyMsgLength > modelConfig.compressMessageLengthThreshold &&
          modelConfig.sendMemory
        ) {
          /** Destruct max_tokens while summarizing
           * this param is just shit
           **/
          const { max_tokens, ...modelcfg } = modelConfig;
          api.llm.chat({
            messages: toBeSummarizedMsgs.concat(
              createMessage({
                role: "system",
                content: Locale.Store.Prompt.Summarize,
                date: "",
              }),
            ),
            config: {
              ...modelcfg,
              stream: true,
              model,
              providerName,
            },
            onUpdate(message) {
              session.memoryPrompt = message;
            },
            onFinish(message, responseRes) {
              if (responseRes?.status === 200) {
                console.log("[Memory] ", message);
                get().updateTargetSession(session, (session) => {
                  session.lastSummarizeIndex = lastSummarizeIndex;
                  session.memoryPrompt = message; // Update the memory prompt for stored it in local storage
                });
              }
            },
            onError(err) {
              console.error("[Summarize] ", err);
            },
          });
        }
      },

      updateStat(message: ChatMessage, session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.stat.charCount += message.content.length;
          // TODO: should update chat count and word count
        });
      },
      updateTargetSession(
        targetSession: ChatSession,
        updater: (session: ChatSession) => void,
      ) {
        const sessions = get().sessions;
        const index = sessions.findIndex((s) => s.id === targetSession.id);
        if (index < 0) {
          console.warn("[CompareDebug] updateTargetSession: session NOT FOUND, id:", targetSession.id,
            "available ids:", sessions.map(s => s.id));
          return;
        }
        updater(sessions[index]);
        set(() => ({ sessions }));
      },
      async clearAllData() {
        await indexedDBStorage.clear();
        localStorage.clear();
        location.reload();
      },
      setLastInput(lastInput: string) {
        set({
          lastInput,
        });
      },

      /** check if the message contains MCP JSON and execute the MCP action */
      checkMcpJson(message: ChatMessage) {
        const mcpEnabled = isMcpEnabled();
        if (!mcpEnabled) return;
        const content = getMessageTextContent(message);
        if (isMcpJson(content)) {
          try {
            const mcpRequest = extractMcpJson(content);
            if (mcpRequest) {
              console.debug("[MCP Request]", mcpRequest);

              executeMcpAction(mcpRequest.clientId, mcpRequest.mcp)
                .then((result) => {
                  console.log("[MCP Response]", result);
                  const mcpResponse =
                    typeof result === "object"
                      ? JSON.stringify(result)
                      : String(result);
                  get().onUserInput(
                    `\`\`\`json:mcp-response:${mcpRequest.clientId}\n${mcpResponse}\n\`\`\``,
                    [],
                    true,
                  );
                })
                .catch((error) => showToast("MCP execution failed", error));
            }
          } catch (error) {
            console.error("[Check MCP JSON]", error);
          }
        }
      },

      // ========== 多模型对比模式方法 ==========

      /**
       * 启用对比模式
       */
      enableCompareMode(selectedModels: string[]): void {
        const session = get().currentSession();
        if (!session) return;

        if (selectedModels.length < 2) {
          showToast("至少选择 2 个模型进行对比");
          return;
        }

        const config = useAppConfig.getState();
        const maxModels = config.compareConfig.maxModels;

        if (selectedModels.length > maxModels) {
          showToast(`最多选择 ${maxModels} 个模型`);
          return;
        }

        get().updateTargetSession(session, (session) => {
          session.compareConfig = {
            enabled: true,
            selectedModels,
            layout: config.compareConfig.defaultLayout,
          };
        });

        showToast(`已启用对比模式，选择了 ${selectedModels.length} 个模型`);
      },

      /**
       * 禁用对比模式
       */
      disableCompareMode(): void {
        const session = get().currentSession();
        if (!session?.compareConfig) return;

        // 停止所有进行中的对比请求
        if (session.compareConfig.enabled) {
          const lastMessage = session.messages[session.messages.length - 1];
          if (lastMessage?.compareMeta) {
            get().stopCompareRequest(lastMessage.compareMeta.requestId);
          }
        }

        get().updateTargetSession(session, (session) => {
          if (session.compareConfig) {
            session.compareConfig.enabled = false;
          }
        });
      },

      /**
       * 更新单个模型的对比回复
       * Fix #3: 增加 requestId 校验，避免竞态条件时匹配错误消息
       */
      updateCompareResponse(
        sessionId: string,
        requestId: string,
        modelKey: string,
        updater: (response: CompareResponse) => void,
      ): void {
        const sessions = get().sessions;
        const sessionIndex = sessions.findIndex((s) => s.id === sessionId);
        if (sessionIndex < 0) {
          console.warn("[CompareDebug] updateCompareResponse: session NOT FOUND, sessionId:", sessionId,
            "available:", sessions.map(s => s.id));
          return;
        }

        const session = sessions[sessionIndex];
        // compareMeta 在 user 消息上，compareResponses 在紧随其后的 assistant 消息上
        const userMsgIndex = session.messages.findIndex((m) => m.compareMeta?.requestId === requestId);

        // Fix #3: 当找不到 userMsgIndex 时，不要回退到 findLastIndex，直接返回错误
        // 这样可以避免匹配到之前对比会话的消息
        if (userMsgIndex < 0) {
          console.warn("[CompareDebug] updateCompareResponse: user message with requestId NOT FOUND", {
            requestId, modelKey,
            totalMsgs: session.messages.length,
            hasCompareMeta: session.messages.map(m => !!m.compareMeta),
          });
          return;
        }

        const messageIndex = userMsgIndex + 1;

        if (messageIndex >= session.messages.length || !session.messages[messageIndex]?.compareResponses) {
          console.warn("[CompareDebug] updateCompareResponse: assistant msg NOT FOUND or has no compareResponses", {
            requestId, modelKey, userMsgIndex, messageIndex,
            totalMsgs: session.messages.length,
          });
          return;
        }

        const responseIndex = session.messages[messageIndex].compareResponses!.findIndex(
          (r) => `${r.model}@${r.providerName.toLowerCase()}` === modelKey.toLowerCase()
        );
        if (responseIndex >= 0) {
          get().updateMessage(sessionIndex, messageIndex, (msg) => {
            if (msg?.compareResponses?.[responseIndex]) {
              updater(msg.compareResponses[responseIndex]);
            }
          });
        } else {
          console.warn("[CompareDebug] updateCompareResponse: model not found", {
            modelKey,
            available: session.messages[messageIndex].compareResponses!.map(r => `${r.model}@${r.providerName}`),
          });
        }
      },

      /**
       * 设置对比布局模式
       */
      setCompareLayout(layout: 'grid' | 'list'): void {
        const session = get().currentSession();
        if (!session?.compareConfig) return;

        get().updateTargetSession(session, (session) => {
          if (session.compareConfig) {
            session.compareConfig.layout = layout;
          }
        });

        // 同时更新最近消息的 compareMeta
        const lastMessage = session.messages[session.messages.length - 1];
        if (lastMessage?.compareMeta) {
          get().updateTargetSession(session, (session) => {
            const msg = session.messages[session.messages.length - 1];
            if (msg?.compareMeta) {
              msg.compareMeta.layout = layout;
            }
          });
        }
      },

      /**
       * 发起对比请求（核心方法）
       */
      async onUserInputWithCompare(
        content: string,
        attachImages?: string[],
      ): Promise<void> {
        const session = get().currentSession();
        if (!session?.compareConfig?.enabled) {
          return;
        }

        const selectedModels = session.compareConfig.selectedModels;
        if (selectedModels.length < 2) {
          showToast("至少选择 2 个模型进行对比");
          return;
        }

        const modelConfig = session.mask.modelConfig;
        const requestId = nanoid();
        const startTime = Date.now();

        // 创建 CompareRequestManager 状态
        const compareState = CompareRequestPool.create(
          session.id,
          requestId,
          selectedModels,
        );

        // 创建用户消息（携带元数据）
        let mContent: string | MultimodalContent[] = fillTemplateWith(content, modelConfig);
        if (attachImages && attachImages.length > 0) {
          mContent = [
            ...(content ? [{ type: "text" as const, text: content }] : []),
            ...attachImages.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ];
        }

        const userMessage: ChatMessage = createMessage({
          role: "user",
          content: mContent,
          compareMeta: {
            enabled: true,
            selectedModels,
            requestId,
            layout: session.compareConfig.layout,
          },
        });

        // 创建助手消息
        // 关键设计：第一个模型的回复直接写入 content，确保消息始终可持久化
        const [primaryModel, primaryProviderName] = getModelProvider(selectedModels[0]);
        const botMessage: ChatMessage = createMessage({
          role: "assistant",
          streaming: true,
          model: primaryModel as ModelType,
          content: "",
          compareResponses: selectedModels.map((modelKey) => {
            const [model, providerName] = getModelProvider(modelKey);
            return {
              model,
              providerName: providerName || "OpenAI",
              content: "",
              status: 'pending' as CompareStatus,
              startTime,
            };
          }),
        });

        // 获取历史消息
        const recentMessages = await get().getMessagesWithMemory();
        const sendMessages = recentMessages.concat(userMessage);

        // 保存消息
        get().updateTargetSession(session, (session) => {
          session.messages = session.messages.concat([userMessage, botMessage]);
        });
        // 并行发起请求
        const primaryModelKey = selectedModels[0];
        const requests = selectedModels.map(async (modelKey) => {
          const [model, providerName] = getModelProvider(modelKey);
          const api: ClientApi = getClientApi((providerName || "OpenAI") as ServiceProvider);
          const isPrimary = modelKey === primaryModelKey;

          // 记录开始时间
          CompareRequestPool.setStartTime(requestId, modelKey, Date.now());

          // 更新状态为 streaming
          get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
            r.status = 'streaming';
          });
          CompareRequestPool.setStatus(requestId, modelKey, 'streaming');

          try {
            await api.llm.chat({
              messages: sendMessages,
              config: {
                ...modelConfig,
                model,
                providerName,
                stream: true,
              },
              onUpdate(message) {
                // Fix #1: 使用节流机制，避免多个模型同时输出时频繁触发 setState
                compareUpdateThrottle.schedule(requestId, modelKey, message, () => {
                  // 所有模型：更新各自的 compareResponse
                  get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
                    r.content = message;
                  });
                  CompareRequestPool.setContent(requestId, modelKey, message);

                  // 主模型：同时写入 botMessage.content（确保消息始终可持久化）
                  if (isPrimary) {
                    get().updateTargetSession(session, (session) => {
                      const userMsgIndex = session.messages.findIndex((m) => m.compareMeta?.requestId === requestId);
                      if (userMsgIndex >= 0 && userMsgIndex + 1 < session.messages.length) {
                        const msg = session.messages[userMsgIndex + 1];
                        if (msg) msg.content = message;
                      }
                    });
                  }
                });
              },
              onFinish(message) {
                const latency = Date.now() - (CompareRequestPool.getStartTime(requestId, modelKey) || Date.now());
                get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
                  r.status = 'done';
                  r.content = message;
                  r.latency = latency;
                });
                CompareRequestPool.setStatus(requestId, modelKey, 'done');
                ChatControllerPool.removeCompare(requestId, modelKey);

                // 主模型：最终确认 content 和 date（使用 requestId 动态查找，避免闭包捕获过时的引用）
                if (isPrimary) {
                  get().updateTargetSession(session, (session) => {
                    const userMsgIndex = session.messages.findIndex((m) => m.compareMeta?.requestId === requestId);
                    if (userMsgIndex >= 0 && userMsgIndex + 1 < session.messages.length) {
                      const msg = session.messages[userMsgIndex + 1];
                      if (msg) {
                        msg.content = message;
                        msg.date = new Date().toLocaleString();
                      }
                    }
                  });
                }
              },
              onError(error) {
                get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
                  r.status = 'error';
                  r.error = error.message;
                });
                CompareRequestPool.setError(requestId, modelKey, error.message);
                ChatControllerPool.removeCompare(requestId, modelKey);
              },
              onController(controller) {
                ChatControllerPool.addCompareController(requestId, modelKey, controller);
                CompareRequestPool.setController(requestId, modelKey, controller);
              },
            });
          } catch (error: any) {
            get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
              r.status = 'error';
              r.error = error?.message || "请求失败";
            });
            CompareRequestPool.setError(requestId, modelKey, error?.message || "请求失败");
            ChatControllerPool.removeCompare(requestId, modelKey);
          }
        });

        // 等待所有请求完成（不阻塞UI，各请求独立更新）
        Promise.allSettled(requests).finally(() => {
          // 使用 requestId 动态查找消息，避免闭包捕获过时的 botMessage 引用
          get().updateTargetSession(session, (session) => {
            const userMsgIndex = session.messages.findIndex((m) => m.compareMeta?.requestId === requestId);
            if (userMsgIndex >= 0 && userMsgIndex + 1 < session.messages.length) {
              const msg = session.messages[userMsgIndex + 1];
              if (msg) msg.streaming = false;
            }
          });

          // 获取最新的消息引用，避免使用过时的闭包变量
          const currentSession = get().sessions.find(s => s.id === session.id);
          if (currentSession) {
            const userMsgIndex = currentSession.messages.findIndex((m) => m.compareMeta?.requestId === requestId);
            if (userMsgIndex >= 0 && userMsgIndex + 1 < currentSession.messages.length) {
              const latestBotMessage = currentSession.messages[userMsgIndex + 1];
              // 与正常模式保持一致：更新 session 元数据并触发标题生成
              get().onNewMessage(latestBotMessage, currentSession);
            }
          }
        });
      },

      /**
       * 采纳某个模型的回复作为正式回复
       * 就地替换 botMessage.content，而不是创建新消息
       */
      adoptCompareResult(modelKey: string): void {
        const session = get().currentSession();
        if (!session) return;

        const messages = session.messages;

        // 找到最近的对比消息
        let lastIndex = messages.length - 1;
        while (lastIndex >= 0 && !messages[lastIndex].compareResponses) {
          lastIndex--;
        }

        if (lastIndex < 0) return;

        const botMsg = messages[lastIndex];
        const userMsgIndex = lastIndex - 1;

        if (!botMsg.compareResponses) return;

        const selectedResponse = botMsg.compareResponses.find(
          (r) => `${r.model}@${r.providerName.toLowerCase()}` === modelKey.toLowerCase()
        );
        if (!selectedResponse) return;

        // 就地替换：更新 content 和 model，清除对比数据
        get().updateTargetSession(session, (session) => {
          const bot = session.messages[lastIndex];
          const user = session.messages[userMsgIndex];

          if (bot) {
            bot.content = selectedResponse.content;
            bot.model = selectedResponse.model as ModelType;
            bot.compareResponses = undefined;
          }
          if (user) {
            user.compareMeta = undefined;
          }
        });

        // 清理 CompareRequestPool
        const userMsg = messages[userMsgIndex];
        if (userMsg?.compareMeta) {
          CompareRequestPool.remove(userMsg.compareMeta.requestId);
        }

        showToast(`已采纳 ${selectedResponse.model} 的回复`);

        // 关闭对比模式
        get().disableCompareMode();
      },

      /**
       * 停止对比请求（全部或单个模型）
       */
      // Fix #2: 停止对比请求（全部或单个模型）
      stopCompareRequest(modelKey?: string): void {
        const session = get().currentSession();
        if (!session) return;

        const lastMessage = session.messages[session.messages.length - 1];
        if (!lastMessage?.compareMeta) return;

        const requestId = lastMessage.compareMeta.requestId;

        if (modelKey) {
          // 停止单个模型
          ChatControllerPool.stopCompareModel(requestId, modelKey);
          CompareRequestPool.stop(requestId, modelKey);
          get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
            r.status = 'stopped';
          });
        } else {
          // 停止全部 - Fix #2: 使用 updater 模式正确更新，不直接变异状态
          ChatControllerPool.stopAllCompare(requestId);
          CompareRequestPool.stop(requestId);
          get().updateTargetSession(session, (session) => {
            const lastMsg = session.messages[session.messages.length - 1];
            if (lastMsg?.compareResponses) {
              lastMsg.compareResponses.forEach((r) => {
                // Fix #2: 修复运算符优先级问题，添加括号确保正确逻辑
                if (r.status === 'streaming' || r.status === 'pending') {
                  r.status = 'stopped';
                }
              });
            }
          });
        }
      },

      /**
       * 重新发起某个模型的请求
       */
      async retryCompareModel(modelKey: string): Promise<void> {
        const session = get().currentSession();
        if (!session) return;

        const lastMessage = session.messages[session.messages.length - 1];
        if (!lastMessage?.compareMeta || !lastMessage.compareResponses) return;

        const requestId = lastMessage.compareMeta.requestId;
        const response = lastMessage.compareResponses.find(
          (r) => `${r.model}@${r.providerName.toLowerCase()}` === modelKey.toLowerCase()
        );
        if (!response) return;

        const [model, providerName] = getModelProvider(modelKey);
        const modelConfig = session.mask.modelConfig;

        // 重置状态
        get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
          r.status = 'streaming';
          r.content = "";
          r.error = undefined;
        });
        CompareRequestPool.setStatus(requestId, modelKey, 'streaming');
        CompareRequestPool.setContent(requestId, modelKey, "");
        CompareRequestPool.setStartTime(requestId, modelKey, Date.now());

        // 获取历史消息（不包括当前的 assistant 消息）
        const messages = session.messages.slice(0, -1);

        const api: ClientApi = getClientApi((providerName || "OpenAI") as ServiceProvider);

        try {
          await api.llm.chat({
            messages,
            config: {
              ...modelConfig,
              model,
              providerName,
              stream: true,
            },
            onUpdate(message) {
              get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
                r.content = message;
              });
              CompareRequestPool.setContent(requestId, modelKey, message);
            },
            onFinish(message) {
              const latency = Date.now() - (CompareRequestPool.getStartTime(requestId, modelKey) || Date.now());
              get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
                r.status = 'done';
                r.content = message;
                r.latency = latency;
              });
              CompareRequestPool.setStatus(requestId, modelKey, 'done');
              ChatControllerPool.removeCompare(requestId, modelKey);
            },
            onError(error) {
              get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
                r.status = 'error';
                r.error = error.message;
              });
              CompareRequestPool.setError(requestId, modelKey, error.message);
              ChatControllerPool.removeCompare(requestId, modelKey);
            },
            onController(controller) {
              ChatControllerPool.addCompareController(requestId, modelKey, controller);
              CompareRequestPool.setController(requestId, modelKey, controller);
            },
          });
        } catch (error: any) {
          get().updateCompareResponse(session.id, requestId, modelKey, (r) => {
            r.status = 'error';
            r.error = error?.message || "请求失败";
          });
          CompareRequestPool.setError(requestId, modelKey, error?.message || "请求失败");
          ChatControllerPool.removeCompare(requestId, modelKey);
        }
      },

      /**
       * 检查是否在对比模式
       */
      isInCompareMode(): boolean {
        const session = get().currentSession();
        return session?.compareConfig?.enabled ?? false;
      },

      /**
       * 获取对比模式配置
       */
      getCompareConfig() {
        const session = get().currentSession();
        return session?.compareConfig;
      },
    };

    return methods;
  },
  {
    name: StoreKey.Chat,
    version: 3.3,
    migrate(persistedState, version) {
      const state = persistedState as any;
      const newState = JSON.parse(
        JSON.stringify(state),
      ) as typeof DEFAULT_CHAT_STATE;

      if (version < 2) {
        newState.sessions = [];

        const oldSessions = state.sessions;
        for (const oldSession of oldSessions) {
          const newSession = createEmptySession();
          newSession.topic = oldSession.topic;
          newSession.messages = [...oldSession.messages];
          newSession.mask.modelConfig.sendMemory = true;
          newSession.mask.modelConfig.historyMessageCount = useAppConfig.getState().modelConfig.historyMessageCount;
          newSession.mask.modelConfig.compressMessageLengthThreshold = 1000;
          newState.sessions.push(newSession);
        }
      }

      if (version < 3) {
        // migrate id to nanoid
        newState.sessions.forEach((s) => {
          s.id = nanoid();
          s.messages.forEach((m) => (m.id = nanoid()));
        });
      }

      // Enable `enableInjectSystemPrompts` attribute for old sessions.
      // Resolve issue of old sessions not automatically enabling.
      if (version < 3.1) {
        newState.sessions.forEach((s) => {
          if (
            // Exclude those already set by user
            !s.mask.modelConfig.hasOwnProperty("enableInjectSystemPrompts")
          ) {
            // Because users may have changed this configuration,
            // the user's current configuration is used instead of the default
            const config = useAppConfig.getState();
            s.mask.modelConfig.enableInjectSystemPrompts =
              config.modelConfig.enableInjectSystemPrompts;
          }
        });
      }

      // add default summarize model for every session
      if (version < 3.2) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = config.modelConfig.compressModel;
          s.mask.modelConfig.compressProviderName =
            config.modelConfig.compressProviderName;
        });
      }
      // revert default summarize model for every session
      if (version < 3.3) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = "";
          s.mask.modelConfig.compressProviderName = "";
        });
      }

      return newState as any;
    },
  },
);
