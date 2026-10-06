/**
 * Deletion actions.
 */
export interface DeleteResult {
  readonly ok: boolean;
  readonly deleted: boolean;
  readonly message: string;
}
export async function deleteEverything(): Promise<DeleteResult[]> {
  const results: DeleteResult[] = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
      results.push({ ok: true, deleted: true, message: 'localStorage cleared.' });
    } else
      results.push({ ok: true, deleted: false, message: 'localStorage unavailable; skipped.' });
  } catch (e: unknown) {
    results.push({
      ok: false,
      deleted: false,
      message: `localStorage error: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  for (const name of ['ctimg-t32-models', 'ctimg-t57-models', 'ctimg-cost-ledger']) {
    try {
      const deleted = await deleteIndexedDB(name);
      results.push({
        ok: true,
        deleted,
        message: deleted ? `IndexedDB ${name} deleted.` : `IndexedDB ${name} not found.`,
      });
    } catch (e: unknown) {
      results.push({
        ok: false,
        deleted: false,
        message: `IndexedDB ${name} error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      for (const n of names) await caches.delete(n);
      results.push({
        ok: true,
        deleted: names.length > 0,
        message: names.length > 0 ? 'Cache Storage cleared.' : 'No caches found.',
      });
    } else results.push({ ok: true, deleted: false, message: 'Cache Storage unavailable.' });
  } catch (e: unknown) {
    results.push({
      ok: false,
      deleted: false,
      message: `Cache Storage error: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  try {
    if (typeof navigator?.storage?.getDirectory === 'function') {
      const deleted = await clearOpfsScratch();
      results.push({
        ok: true,
        deleted,
        message: deleted ? 'OPFS scratch cleared.' : 'No scratch files.',
      });
    } else results.push({ ok: true, deleted: false, message: 'OPFS unavailable.' });
  } catch (e: unknown) {
    results.push({
      ok: false,
      deleted: false,
      message: `OPFS error: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  return results;
}
async function deleteIndexedDB(dbName: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
async function clearOpfsScratch(): Promise<boolean> {
  try {
    const dir = await navigator.storage.getDirectory();
    try {
      const scratch = await dir.getDirectoryHandle('scratch', { create: false });
      for await (const [name, handle] of (
        scratch as FileSystemDirectoryHandle & {
          entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
        }
      ).entries()) {
        if (handle.kind === 'file') await scratch.removeEntry(name);
      }
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}
export async function clearDownloadedModules(): Promise<DeleteResult> {
  if (typeof caches === 'undefined')
    return { ok: false, deleted: false, message: 'Cache Storage unavailable.' };
  try {
    const names = await caches.keys();
    let deletedAny = false;
    for (const name of names) {
      if (
        name.includes('assets') ||
        name.includes('module') ||
        name.includes('wasm') ||
        name.includes('onnx')
      ) {
        await caches.delete(name);
        deletedAny = true;
      }
    }
    return {
      ok: true,
      deleted: deletedAny,
      message: deletedAny ? 'Module caches cleared.' : 'No module caches found.',
    };
  } catch (e: unknown) {
    return {
      ok: false,
      deleted: false,
      message: `Cache Storage error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
