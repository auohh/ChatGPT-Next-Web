export type Updater<T> = (updater: (value: T) => void) => void;

export const ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof ROLES)[number];

// ========== 多模型对比相关类型 ==========
export type CompareStatus = 'pending' | 'streaming' | 'done' | 'error' | 'stopped';

export interface CompareResponse {
  model: string;                    // 使用的模型名称
  providerName: string;             // 服务商
  content: string;                  // 回复内容
  status: CompareStatus;            // 当前状态
  error?: string;                   // 错误信息
  tokens?: number;                  // token 使用量
  latency?: number;                 // 响应延迟（毫秒）
  startTime?: number;               // 请求开始时间
}

export interface CompareMeta {
  enabled: boolean;                 // 是否启用对比模式
  selectedModels: string[];         // 选择的模型列表 ["gpt-4o@OpenAI", ...]
  requestId: string;                // 当前对比请求唯一ID
  layout: 'grid' | 'list';          // 布局模式
}

export interface RequestMessage {
  role: MessageRole;
  content: string;
}

export type DalleSize = "1024x1024" | "1792x1024" | "1024x1792";
export type DalleQuality = "standard" | "hd";
export type DalleStyle = "vivid" | "natural";

export type ModelSize =
  | "1024x1024"
  | "1792x1024"
  | "1024x1792"
  | "768x1344"
  | "864x1152"
  | "1344x768"
  | "1152x864"
  | "1440x720"
  | "720x1440";
