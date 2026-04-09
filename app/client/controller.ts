// To store message streaming controller
export const ChatControllerPool = {
  controllers: {} as Record<string, AbortController>,

  addController(
    sessionId: string,
    messageId: string,
    controller: AbortController,
  ) {
    const key = this.key(sessionId, messageId);
    this.controllers[key] = controller;
    return key;
  },

  // 新增：为对比模式添加控制器
  addCompareController(
    requestId: string,
    modelKey: string,
    controller: AbortController,
  ) {
    const key = this.compareKey(requestId, modelKey);
    this.controllers[key] = controller;
    return key;
  },

  stop(sessionId: string, messageId: string) {
    const key = this.key(sessionId, messageId);
    const controller = this.controllers[key];
    controller?.abort();
  },

  // 新增：停止对比模式的单个模型
  stopCompareModel(requestId: string, modelKey: string) {
    const key = this.compareKey(requestId, modelKey);
    const controller = this.controllers[key];
    controller?.abort();
  },

  // 新增：停止对比模式的所有模型
  stopAllCompare(requestId: string) {
    Object.keys(this.controllers)
      .filter(key => key.startsWith(`compare:${requestId}`))
      .forEach(key => {
        this.controllers[key]?.abort();
      });
  },

  stopAll() {
    Object.values(this.controllers).forEach((v) => v.abort());
  },

  hasPending() {
    return Object.values(this.controllers).length > 0;
  },

  remove(sessionId: string, messageId: string) {
    const key = this.key(sessionId, messageId);
    delete this.controllers[key];
  },

  // 新增：移除对比模式控制器
  removeCompare(requestId: string, modelKey: string) {
    const key = this.compareKey(requestId, modelKey);
    delete this.controllers[key];
  },

  // 新增：移除对比模式所有控制器
  removeAllCompare(requestId: string) {
    Object.keys(this.controllers)
      .filter(key => key.startsWith(`compare:${requestId}`))
      .forEach(key => {
        delete this.controllers[key];
      });
  },

  key(sessionId: string, messageIndex: string) {
    return `${sessionId},${messageIndex}`;
  },

  // 新增：生成对比模式的控制器 key
  compareKey(requestId: string, modelKey: string) {
    return `compare:${requestId}:${modelKey}`;
  },
};
