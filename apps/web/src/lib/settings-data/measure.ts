/**
 * Per-store measurement.
 */
export interface Measurement {
  readonly storeId: string;
  readonly label: string;
  readonly measuredBytes: number;
  readonly recordCount: number;
  readonly fileCount: number;
  readonly note: string;
}
export function measureLocalStorage(): { bytes: number; entries: number } {
  if (typeof localStorage === 'undefined') return { bytes: 0, entries: 0 };
  let bytes = 0,
    entries = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key ?? '');
    if (key && value !== null) {
      bytes += (key.length + value.length) * 2;
      entries++;
    }
  }
  return { bytes, entries };
}
export async function listIndexedDBNames(): Promise<string[]> {
  if (typeof indexedDB === 'undefined') return [];
  return new Promise((resolve) => {
    try {
      if (
        typeof (indexedDB as { databases?: () => Promise<Array<{ name?: string }>> }).databases ===
        'function'
      ) {
        (indexedDB as { databases?: () => Promise<Array<{ name?: string }>> }).databases!()
          .then((dbs: Array<{ name?: string }>) =>
            resolve(dbs.map((d) => d.name ?? '').filter(Boolean)),
          )
          .catch(() => resolve([]));
      } else resolve([]);
    } catch {
      resolve([]);
    }
  });
}
export async function measureIndexedDBStore(
  dbName: string,
  storeName?: string,
): Promise<{ records: number; bytes: number; note: string }> {
  if (typeof indexedDB === 'undefined')
    return { records: 0, bytes: 0, note: 'IndexedDB unavailable.' };
  try {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error ?? new Error('open failed'));
      req.onblocked = () => rej(new Error('blocked'));
    });
    let totalRecords = 0,
      totalBytes = 0;
    for (const s of Array.from(db.objectStoreNames)) {
      if (storeName && s !== storeName) continue;
      try {
        const count = await new Promise<number>((res, rej) => {
          const tx = db.transaction(s, 'readonly');
          const r = tx.objectStore(s).count();
          r.onsuccess = () => res(r.result as number);
          r.onerror = () => rej(r.error);
        });
        totalRecords += count;
        if (count > 0) {
          const keys = await new Promise<IDBValidKey[]>((res, rej) => {
            const tx = db.transaction(s, 'readonly');
            const r = tx.objectStore(s).getAllKeys();
            r.onsuccess = () => res(r.result as IDBValidKey[]);
            r.onerror = () => rej(r.error);
          });
          for (const key of keys) {
            const val = await new Promise<unknown>((res, rej) => {
              const tx = db.transaction(s, 'readonly');
              const r = tx.objectStore(s).get(key);
              r.onsuccess = () => res(r.result);
              r.onerror = () => rej(r.error);
            });
            if (val && typeof val === 'object')
              try {
                totalBytes += JSON.stringify(val).length * 2;
              } catch {
                /* skip */
              }
          }
        }
      } catch {
        /* skip */
      }
    }
    db.close();
    return {
      records: totalRecords,
      bytes: totalBytes,
      note: totalRecords === 0 ? 'No records found.' : '',
    };
  } catch (e: unknown) {
    return {
      records: 0,
      bytes: 0,
      note: `Could not measure: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
export async function measureCacheStorage(): Promise<{
  entries: number;
  bytes: number;
  keys: string[];
}> {
  if (typeof caches === 'undefined') return { entries: 0, bytes: 0, keys: [] };
  try {
    const names = await caches.keys();
    let entries = 0,
      bytes = 0;
    const allKeys: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      entries += requests.length;
      for (const req of requests) {
        allKeys.push(`${name}:${req.url}`);
        const response = await cache.match(req);
        if (response) {
          const blob = await response.blob();
          bytes += blob.size;
        }
      }
    }
    return { entries, bytes, keys: allKeys };
  } catch {
    return { entries: 0, bytes: 0, keys: [] };
  }
}
export async function measureOpfsScratch(): Promise<{
  files: number;
  bytes: number;
  note: string;
}> {
  if (!navigator?.storage?.getDirectory) return { files: 0, bytes: 0, note: 'OPFS unavailable.' };
  try {
    const dir = await navigator.storage.getDirectory();
    let files = 0,
      bytes = 0;
    try {
      const scratch = await dir.getDirectoryHandle('scratch', { create: false });
      for await (const entry of (
        scratch as FileSystemDirectoryHandle & {
          entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
        }
      ).entries()) {
        const [_name, handle] = entry as [string, FileSystemHandle];
        if (handle.kind === 'file') {
          files++;
          const file = await (handle as FileSystemFileHandle).getFile();
          bytes += file.size;
        }
      }
    } catch {
      /* skip */
    }
    return { files, bytes, note: files === 0 ? 'No orphaned scratch files.' : '' };
  } catch (e: unknown) {
    return {
      files: 0,
      bytes: 0,
      note: `OPFS measurement failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
export async function measureStorageEstimate(): Promise<{
  usage?: number;
  quota?: number;
  note: string;
}> {
  if (!navigator?.storage?.estimate) return { note: 'navigator.storage.estimate() unavailable.' };
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? undefined, quota: estimate.quota ?? undefined, note: '' };
  } catch (e: unknown) {
    return { note: `Storage estimate failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
