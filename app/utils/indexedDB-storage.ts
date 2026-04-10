import { StateStorage } from "zustand/middleware";
import { get, set, del, clear } from "idb-keyval";
import { safeLocalStorage } from "@/app/utils";

const localStorage = safeLocalStorage();

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

export const indexedDBStorage = new IndexedDBStorage();
