// IndexedDB wrapper for file blob storage

const DB_NAME = 'kivora_blobs_v1';
const LEGACY_DB_NAME = 'studypilot_blobs_v1';
const STORE_NAME = 'blobs';

export interface BlobPayload {
  blob: Blob;
  name: string;
  type: string;
  size: number;
}

class IDBStore {
  private db: IDBDatabase | null = null;

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    const hasCurrent = await this.databaseExists(DB_NAME);
    const hasLegacy = await this.databaseExists(LEGACY_DB_NAME);

    if (!hasCurrent && hasLegacy) {
      await this.migrateLegacyDatabase();
    }

    return this.openDatabase(DB_NAME);
  }

  private openDatabase(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);

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

  private async databaseExists(name: string): Promise<boolean> {
    const indexedDbWithListing = indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string; version?: number }>>;
    };

    if (typeof indexedDbWithListing.databases !== 'function') {
      return name === DB_NAME;
    }

    try {
      const dbs = await indexedDbWithListing.databases();
      return dbs.some((db) => db.name === name);
    } catch {
      return name === DB_NAME;
    }
  }

  private async migrateLegacyDatabase(): Promise<void> {
    const legacyDb = await this.openDatabase(LEGACY_DB_NAME);
    const entries = await new Promise<Array<[IDBValidKey, BlobPayload]>>((resolve, reject) => {
      const tx = legacyDb.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      const keysRequest = tx.objectStore(STORE_NAME).getAllKeys();

      tx.oncomplete = () => {
        const values = (request.result || []) as BlobPayload[];
        const keys = (keysRequest.result || []) as IDBValidKey[];
        resolve(keys.map((key, index) => [key, values[index]]));
      };
      tx.onerror = () => reject(tx.error);
    });

    legacyDb.close();

    const targetDb = await this.openDatabase(DB_NAME);
    await new Promise<void>((resolve, reject) => {
      const tx = targetDb.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      entries.forEach(([key, value]) => {
        store.put(value, key);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    targetDb.close();
    this.db = null;
  }

  async put(key: string, value: BlobPayload): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(key: string): Promise<BlobPayload | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllKeys(): Promise<string[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAllKeys();
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }
}

export const idbStore = new IDBStore();

export async function getBlob(key: string): Promise<Blob | null> {
  const payload = await idbStore.get(key);
  return payload?.blob ?? null;
}
