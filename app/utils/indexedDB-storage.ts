import { StateStorage } from "zustand/middleware";
import { get, set, del, clear } from "idb-keyval";
import { safeLocalStorage } from "@/app/utils";

const localStorage = safeLocalStorage();

// Fix #4: IndexedDB 写入节流机制
class ThrottledIndexedDBStorage implements StateStorage {
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: { name: string; value: string } | null = null;

  public async getItem(name: string): Promise<string | null> {
    try {
      const value = (await get(name)) || localStorage.getItem(name);
      if (name === 'chat-next-web-store') {
        if (value) {
          try {
            const parsed = JSON.parse(value);
            const sessions = parsed?.state?.sessions;
            console.log('[IDB] read OK, sessions:', sessions?.length,
              'msgLens:', sessions?.map((s: any) => s.messages?.length),
              'dataSize:', (value.length / 1024).toFixed(1) + 'KB');
          } catch (e) {
            console.error('[IDB] read parse FAILED:', e, 'raw length:', value?.length);
          }
        } else {
          console.warn('[IDB] read: NO DATA found for', name);
        }
      }
      return value;
    } catch (error) {
      console.error('[IDB] read FAILED:', error, 'name:', name);
      return localStorage.getItem(name);
    }
  }

  public async setItem(name: string, value: string): Promise<void> {
    // Fix #4: 添加 1000ms 写入节流，避免频繁写入导致主线程阻塞
    this.pendingWrite = { name, value };

    if (this.writeTimer === null) {
      this.writeTimer = setTimeout(() => {
        this.flushWrite();
      }, 1000);
    }
  }

  private async flushWrite(): Promise<void> {
    this.writeTimer = null;
    const write = this.pendingWrite;
    this.pendingWrite = null;

    if (!write) return;

    try {
      const _value = JSON.parse(write.value);
      if (!_value?.state?._hasHydrated) {
        return;
      }
      await set(write.name, write.value);
    } catch (error) {
      console.error('[IDB] write FAILED:', error, 'name:', write.name, 'dataSize:', write.value?.length);
      localStorage.setItem(write.name, write.value);
    }
  }

  public async removeItem(name: string): Promise<void> {
    // 清除待写入的缓存
    if (this.pendingWrite?.name === name) {
      this.pendingWrite = null;
    }
    try {
      await del(name);
    } catch (error) {
      localStorage.removeItem(name);
    }
  }

  public async clear(): Promise<void> {
    // 清除所有待写入的缓存
    this.pendingWrite = null;
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    try {
      await clear();
    } catch (error) {
      localStorage.clear();
    }
  }
}

// 保持向后兼容的原有类（已废弃）
class IndexedDBStorage implements StateStorage {
  public async getItem(name: string): Promise<string | null> {
    try {
      const value = (await get(name)) || localStorage.getItem(name);
      if (name === 'chat-next-web-store') {
        if (value) {
          try {
            const parsed = JSON.parse(value);
            const sessions = parsed?.state?.sessions;
            console.log('[IDB] read OK, sessions:', sessions?.length,
              'msgLens:', sessions?.map((s: any) => s.messages?.length),
              'dataSize:', (value.length / 1024).toFixed(1) + 'KB');
          } catch (e) {
            console.error('[IDB] read parse FAILED:', e, 'raw length:', value?.length);
          }
        } else {
          console.warn('[IDB] read: NO DATA found for', name);
        }
      }
      return value;
    } catch (error) {
      console.error('[IDB] read FAILED:', error, 'name:', name);
      return localStorage.getItem(name);
    }
  }

  public async setItem(name: string, value: string): Promise<void> {
    try {
      const _value = JSON.parse(value);
      if (!_value?.state?._hasHydrated) {
        return;
      }
      await set(name, value);
    } catch (error) {
      console.error('[IDB] write FAILED:', error, 'name:', name, 'dataSize:', value?.length);
      localStorage.setItem(name, value);
    }
  }

  public async removeItem(name: string): Promise<void> {
    try {
      await del(name);
    } catch (error) {
      localStorage.removeItem(name);
    }
  }

  public async clear(): Promise<void> {
    try {
      await clear();
    } catch (error) {
      localStorage.clear();
    }
  }
}

// Fix #4: 使用带节流的存储类
export const indexedDBStorage = new ThrottledIndexedDBStorage();
