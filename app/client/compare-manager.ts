import type { CompareStatus } from "../typing";

/**
 * 对比请求状态
 */
export interface CompareRequestState {
  sessionId: string;
  requestId: string;
  models: string[];
  controllers: Map<string, AbortController>;
  status: Map<string, CompareStatus>;
  content: Map<string, string>;      // 各模型的内容缓存
  errors: Map<string, string>;       // 各模型的错误信息
  startTimes: Map<string, number>;   // 各模型的开始时间
}

/**
 * 对比请求管理器
 * 负责管理多模型并行请求的状态和控制器
 */
export class CompareRequestManager {
  private states = new Map<string, CompareRequestState>();

  /**
   * 创建新的对比请求状态
   */
  create(sessionId: string, requestId: string, models: string[]): CompareRequestState {
    const state: CompareRequestState = {
      sessionId,
      requestId,
      models,
      controllers: new Map(),
      status: new Map(models.map(m => [m, 'pending' as CompareStatus])),
      content: new Map(models.map(m => [m, ""])),
      errors: new Map(),
      startTimes: new Map(),
    };
    this.states.set(requestId, state);
    return state;
  }

  /**
   * 设置某个模型的控制器
   */
  setController(requestId: string, modelKey: string, controller: AbortController): void {
    const state = this.states.get(requestId);
    if (state) {
      state.controllers.set(modelKey, controller);
    }
  }

  /**
   * 更新某个模型的状态
   */
  setStatus(requestId: string, modelKey: string, status: CompareStatus): void {
    const state = this.states.get(requestId);
    if (state) {
      state.status.set(modelKey, status);
    }
  }

  /**
   * 获取某个模型的状态
   */
  getStatus(requestId: string, modelKey: string): CompareStatus | undefined {
    const state = this.states.get(requestId);
    return state?.status.get(modelKey);
  }

  /**
   * 更新某个模型的内容
   */
  setContent(requestId: string, modelKey: string, content: string): void {
    const state = this.states.get(requestId);
    if (state) {
      state.content.set(modelKey, content);
    }
  }

  /**
   * 获取某个模型的内容
   */
  getContent(requestId: string, modelKey: string): string | undefined {
    const state = this.states.get(requestId);
    return state?.content.get(modelKey);
  }

  /**
   * 设置某个模型的错误信息
   */
  setError(requestId: string, modelKey: string, error: string): void {
    const state = this.states.get(requestId);
    if (state) {
      state.errors.set(modelKey, error);
      state.status.set(modelKey, 'error');
    }
  }

  /**
   * 获取某个模型的错误信息
   */
  getError(requestId: string, modelKey: string): string | undefined {
    const state = this.states.get(requestId);
    return state?.errors.get(modelKey);
  }

  /**
   * 记录某个模型的开始时间
   */
  setStartTime(requestId: string, modelKey: string, startTime: number): void {
    const state = this.states.get(requestId);
    if (state) {
      state.startTimes.set(modelKey, startTime);
    }
  }

  /**
   * 获取某个模型的开始时间
   */
  getStartTime(requestId: string, modelKey: string): number | undefined {
    const state = this.states.get(requestId);
    return state?.startTimes.get(modelKey);
  }

  /**
   * 停止请求（全部或单个模型）
   */
  stop(requestId: string, modelKey?: string): void {
    const state = this.states.get(requestId);
    if (!state) return;

    if (modelKey) {
      // 停止单个模型
      const controller = state.controllers.get(modelKey);
      controller?.abort();
      state.status.set(modelKey, 'stopped');
    } else {
      // 停止全部
      state.controllers.forEach(c => c.abort());
      state.models.forEach(m => state.status.set(m, 'stopped'));
    }
  }

  /**
   * 移除对比请求状态
   */
  remove(requestId: string): void {
    const state = this.states.get(requestId);
    if (state) {
      // 清理所有控制器
      state.controllers.clear();
    }
    this.states.delete(requestId);
  }

  /**
   * 获取对比请求状态
   */
  get(requestId: string): CompareRequestState | undefined {
    return this.states.get(requestId);
  }

  /**
   * 检查是否有进行中的请求
   */
  hasPending(requestId: string): boolean {
    const state = this.states.get(requestId);
    if (!state) return false;

    for (const status of state.status.values()) {
      if (status === 'pending' || status === 'streaming') {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取所有状态
   */
  getAllStates(): Map<string, CompareRequestState> {
    return this.states;
  }

  /**
   * 清理所有状态
   */
  clear(): void {
    this.states.forEach(state => {
      state.controllers.forEach(c => c.abort());
    });
    this.states.clear();
  }
}

// 导出单例
export const CompareRequestPool = new CompareRequestManager();
