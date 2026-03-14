import {
  buildRagIndex,
  getDocumentSignature,
  isCompatibleRagIndex,
  retrieveFromIndex,
  type RAGIndex,
} from './retrieve';

const DB_NAME = 'kivora_rag_v1';
const STORE_NAME = 'indexes';
const SERVER_ROUTE = '/api/rag/index';

class RAGIndexStore {
  private db: IDBDatabase | null = null;

  async open() {
    if (this.db) return this.db;

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async get(fileId: string): Promise<RAGIndex | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(fileId);
      request.onsuccess = () => resolve(request.result as RAGIndex | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async put(fileId: string, value: RAGIndex): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, fileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(fileId: string) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(fileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const ragIndexStore = new RAGIndexStore();

const persistQueue = new Map<string, Promise<RAGIndex | undefined>>();

async function readServerIndex(fileId: string) {
  if (typeof window === 'undefined') return undefined;
  const res = await fetch(`${SERVER_ROUTE}?fileId=${encodeURIComponent(fileId)}`, {
    cache: 'no-store',
  }).catch(() => null);

  if (!res?.ok) return undefined;

  const data = await res.json().catch(() => null) as { persisted?: boolean; index?: RAGIndex | null } | null;
  return data?.persisted && data.index ? data.index : undefined;
}

async function persistServerIndex(fileId: string, text: string) {
  if (typeof window === 'undefined') return undefined;
  const res = await fetch(SERVER_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, text }),
  }).catch(() => null);

  if (!res?.ok) return undefined;

  const data = await res.json().catch(() => null) as { persisted?: boolean; index?: RAGIndex | null } | null;
  return data?.persisted && data.index ? data.index : undefined;
}

function schedulePersistedSync(fileId: string, text: string) {
  const signature = getDocumentSignature(text);
  const key = `${fileId}:${signature}`;
  const existing = persistQueue.get(key);
  if (existing) return existing;

  const task = persistServerIndex(fileId, text)
    .then(async (index) => {
      if (index && isCompatibleRagIndex(index, signature)) {
        await ragIndexStore.put(fileId, index).catch(() => {});
      }
      return index;
    })
    .finally(() => {
      persistQueue.delete(key);
    });

  persistQueue.set(key, task);
  return task;
}

export async function ensureRagIndex(fileId: string, text: string) {
  const signature = getDocumentSignature(text);
  const local = await ragIndexStore.get(fileId).catch(() => undefined);

  if (isCompatibleRagIndex(local, signature)) {
    if (!local?.persistedAt) {
      void schedulePersistedSync(fileId, text);
    }
    return local;
  }

  const persisted = await readServerIndex(fileId).catch(() => undefined);
  if (isCompatibleRagIndex(persisted, signature)) {
    await ragIndexStore.put(fileId, persisted!).catch(() => {});
    return persisted!;
  }

  const built = buildRagIndex(fileId, text);
  await ragIndexStore.put(fileId, built).catch(() => {});
  const synced = await schedulePersistedSync(fileId, text).catch(() => undefined);

  if (isCompatibleRagIndex(synced, signature)) {
    return synced!;
  }

  return built;
}

export async function queryIndexedDocument(fileId: string, text: string, query: string, limit = 5) {
  const index = await ensureRagIndex(fileId, text);
  return retrieveFromIndex(index, query, limit);
}

export async function deleteRagIndex(fileId: string) {
  await ragIndexStore.delete(fileId).catch(() => {});
  if (typeof window !== 'undefined') {
    await fetch(`${SERVER_ROUTE}?fileId=${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }
}
