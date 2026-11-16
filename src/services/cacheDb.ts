import type {HistoryResponse, LatestGoldResponse} from '../types/gold';

const DB_NAME = 'kgp-device-cache';
const DB_VERSION = 1;
const STORE_LATEST = 'latest';
const STORE_HISTORY = 'history';
const STORE_META = 'meta';

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days for unused historical periods
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // Run automatic pruning every 6 hours
const MAX_HISTORY_ENTRIES = 18;

export interface CachedHistoryRecord {
  key: string;
  data: HistoryResponse;
  cachedAt: number;
  lastAccessedAt: number;
  byteSize: number;
}

export interface CacheStats {
  latestCachedAt: number | null;
  historyCount: number;
  totalBytes: number;
  lastPrunedAt: number | null;
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LATEST)) {
        db.createObjectStore(STORE_LATEST, {keyPath: 'key'});
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        db.createObjectStore(STORE_HISTORY, {keyPath: 'key'});
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, {keyPath: 'key'});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function saveLatestCache(data: LatestGoldResponse): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LATEST, 'readwrite');
      tx.objectStore(STORE_LATEST).put({
        key: 'active',
        data,
        cachedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Graceful no-op in restricted storage environments
  }
}

export async function readLatestCache(): Promise<{data: LatestGoldResponse; cachedAt: number} | null> {
  try {
    const db = await openCacheDb();
    const record = await new Promise<{key: string; data: LatestGoldResponse; cachedAt: number} | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_LATEST, 'readonly');
        const req = tx.objectStore(STORE_LATEST).get('active');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    if (!record) return null;
    return {data: record.data, cachedAt: record.cachedAt};
  } catch {
    return null;
  }
}

export async function saveHistoryCache(key: string, data: HistoryResponse): Promise<void> {
  try {
    const json = JSON.stringify(data);
    const now = Date.now();
    const record: CachedHistoryRecord = {
      key,
      data,
      cachedAt: now,
      lastAccessedAt: now,
      byteSize: json.length,
    };
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_HISTORY, 'readwrite');
      tx.objectStore(STORE_HISTORY).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await maybeAutoPrune();
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export async function readHistoryCache(key: string): Promise<CachedHistoryRecord | null> {
  try {
    const db = await openCacheDb();
    const record = await new Promise<CachedHistoryRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_HISTORY, 'readwrite');
      const store = tx.objectStore(STORE_HISTORY);
      const req = store.get(key);
      req.onsuccess = () => {
        const val = req.result as CachedHistoryRecord | undefined;
        if (val) {
          val.lastAccessedAt = Date.now();
          store.put(val);
        }
        resolve(val);
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record || null;
  } catch {
    return null;
  }
}

async function getMetaTimestamp(key: string): Promise<number | null> {
  try {
    const db = await openCacheDb();
    const val = await new Promise<{key: string; value: number} | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return val ? val.value : null;
  } catch {
    return null;
  }
}

async function setMetaTimestamp(key: string, value: number): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({key, value});
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // No-op
  }
}

export async function pruneUnusedCache(force = false): Promise<{removedCount: number}> {
  try {
    if (!force) {
      const lastPruned = await getMetaTimestamp('lastPrunedAt');
      if (lastPruned && Date.now() - lastPruned < PRUNE_INTERVAL_MS) {
        return {removedCount: 0};
      }
    }

    const db = await openCacheDb();
    const allRecords = await new Promise<CachedHistoryRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_HISTORY, 'readonly');
      const req = tx.objectStore(STORE_HISTORY).getAll();
      req.onsuccess = () => resolve((req.result as CachedHistoryRecord[]) || []);
      req.onerror = () => reject(req.error);
    });

    const now = Date.now();
    // Sort newest accessed first so we always retain the 3 most recently accessed histories
    const sorted = [...allRecords].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
    const keysToDelete: string[] = [];

    sorted.forEach((rec, index) => {
      const isRecentThree = index < 3;
      const isExpired = now - rec.lastAccessedAt > MAX_AGE_MS;
      const exceedsCap = index >= MAX_HISTORY_ENTRIES;
      if ((!isRecentThree && isExpired) || exceedsCap) {
        keysToDelete.push(rec.key);
      }
    });

    if (keysToDelete.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_HISTORY, 'readwrite');
        const store = tx.objectStore(STORE_HISTORY);
        keysToDelete.forEach((k) => store.delete(k));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    db.close();
    await setMetaTimestamp('lastPrunedAt', now);
    return {removedCount: keysToDelete.length};
  } catch {
    return {removedCount: 0};
  }
}

export async function maybeAutoPrune(): Promise<void> {
  await pruneUnusedCache(false);
}

export async function clearHistoryCache(): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_HISTORY, 'readwrite');
      tx.objectStore(STORE_HISTORY).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await setMetaTimestamp('lastPrunedAt', Date.now());
  } catch {
    // No-op
  }
}

export async function getCacheStats(): Promise<CacheStats> {
  try {
    const [latest, lastPrunedAt] = await Promise.all([
      readLatestCache(),
      getMetaTimestamp('lastPrunedAt'),
    ]);
    const db = await openCacheDb();
    const historyRecords = await new Promise<CachedHistoryRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_HISTORY, 'readonly');
      const req = tx.objectStore(STORE_HISTORY).getAll();
      req.onsuccess = () => resolve((req.result as CachedHistoryRecord[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();

    const latestBytes = latest ? JSON.stringify(latest.data).length : 0;
    const historyBytes = historyRecords.reduce((acc, r) => acc + (r.byteSize || 0), 0);

    return {
      latestCachedAt: latest?.cachedAt ?? null,
      historyCount: historyRecords.length,
      totalBytes: latestBytes + historyBytes,
      lastPrunedAt,
    };
  } catch {
    return {
      latestCachedAt: null,
      historyCount: 0,
      totalBytes: 0,
      lastPrunedAt: null,
    };
  }
}
