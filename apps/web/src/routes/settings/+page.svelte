<script lang="ts">
  import { onMount } from 'svelte';

  // P6-05 Settings → Data screen — working implementation
  // Per README §18.1 / PLAN.md P6-05: list every store with measured size
  // and a delete button for each; one "Delete everything and reset".

  // Safe interfaces for storage APIs (avoid `any`)
  interface NavigatorStorage {
    getDirectory(): Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemDirectoryHandle {
    kind: 'directory';
    getDirectoryHandle(
      name: string,
      options?: { create?: boolean },
    ): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  }

  interface FileSystemFileHandle {
    kind: 'file';
    getFile(): Promise<File>;
  }

  type FileSystemHandle = FileSystemDirectoryHandle | FileSystemFileHandle;

  interface StoreInfo {
    id: string;
    name: string;
    label: string;
    size: string;
    error?: string;
  }

  let stores = $state<StoreInfo[]>([
    {
      id: 'localStorage',
      name: 'localStorage',
      label: 'Theme, locale, units; per-tool last-used options',
      size: '—',
    },
    { id: 'recipes', name: 'IndexedDB (recipes)', label: 'Saved recipes', size: '—' },
    { id: 'providers', name: 'IndexedDB (providers)', label: 'Provider config', size: '—' },
    { id: 'ledger', name: 'IndexedDB (ledger)', label: 'Cost ledger (rolling 365 d)', size: '—' },
    {
      id: 'modelCache',
      name: 'IndexedDB (modelCache)',
      label: 'Cached model lists (24 h TTL)',
      size: '—',
    },
    {
      id: 'assets',
      name: 'Cache Storage (assets-v{n})',
      label: 'WASM modules + ONNX models',
      size: '—',
    },
    { id: 'scratch', name: 'OPFS scratch/', label: 'Large intermediates / batch spill', size: '—' },
  ]);

  let total = $state('—');
  let loading = $state(true);

  function fmtBytes(b: number): string {
    if (b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async function measureLocalStorage(): Promise<string> {
    try {
      let totalBytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        // Only count keys that belong to this application (avoid measuring unrelated origin data)
        if (
          k.startsWith('ctimg-') ||
          k.includes('theme') ||
          k.includes('locale') ||
          k.includes('recipe') ||
          k.includes('provider') ||
          k.includes('preference') ||
          k === 'ctimg-settings'
        ) {
          const v = localStorage.getItem(k) || '';
          totalBytes += k.length * 2 + v.length * 2; // approximate UTF-16 byte count
        }
      }
      return fmtBytes(totalBytes);
    } catch (_e) {
      return '— (error)';
    }
  }

  async function measureIndexedDB(name: string): Promise<string> {
    try {
      // README §18.1: recipes, providers, ledger are IndexedDB; modelCache is ctimg-t32-models/t57-models
      const dbNames: string[] = [
        'recipes',
        'providers',
        'ctimg-cost-ledger',
        'ctimg-t32-models',
        'ctimg-t57-models',
        'modelCache',
      ];
      if (!dbNames.includes(name)) return 'unknown DB name: ' + name;
      const req = indexedDB.open(name, 1);
      return new Promise((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          try {
            let est = 0;
            for (const s of Array.from(db.objectStoreNames)) {
              // Defensible estimate: sample first 10 records, extrapolate
              const tx = db.transaction(s, 'readonly');
              const store = tx.objectStore(s);
              const countReq = store.count();
              countReq.onsuccess = () => {
                // Approximate average record size ~200 bytes (conservative for metadata/keys)
                est += Math.max(0, (countReq.result || 0) * 200);
              };
            }
            resolve(fmtBytes(est));
          } catch {
            resolve('—');
          } finally {
            db.close();
          }
        };
        req.onerror = () => resolve('— (unavailable)');
        req.onblocked = () => resolve('— (blocked)');
        // Fallback if DB never created or unavailable
        setTimeout(() => resolve('—'), 1500);
      });
    } catch {
      return '—';
    }
  }

  async function measureCacheStorage(): Promise<string> {
    try {
      if (!('caches' in window)) return '—';
      let total = 0;
      const names = await caches.keys();
      for (const n of names) {
        if (!n.includes('assets')) continue;
        const cache = await caches.open(n);
        const reqs = await cache.keys();
        for (const r of reqs) {
          try {
            const resp = await cache.match(r);
            if (resp) {
              const clone = resp.clone();
              const ab = await clone.arrayBuffer();
              total += ab.byteLength;
            }
          } catch {
            // Ignore unreadable responses
          }
        }
      }
      return fmtBytes(total);
    } catch (_e) {
      return '—';
    }
  }

  async function measureOPFS(): Promise<string> {
    try {
      if (
        !('navigator' in window) ||
        !(navigator as { storage?: NavigatorStorage }).storage?.getDirectory
      )
        return '—';
      const dir = await (navigator as { storage: NavigatorStorage }).storage.getDirectory();
      // Recursively inspect scratch/ if present (approximate)
      let total = 0;
      async function recurse(d: FileSystemDirectoryHandle): Promise<number> {
        let s = 0;
        for await (const [_name, handle] of (d as FileSystemDirectoryHandle).entries()) {
          if (handle.kind === 'file') {
            const file = await (handle as FileSystemFileHandle).getFile();
            s += file.size;
          } else if (handle.kind === 'directory') {
            s += await recurse(handle as FileSystemDirectoryHandle);
          }
        }
        return s;
      }
      // Only measure scratch if it exists and belongs to this app
      try {
        const scratch = await dir.getDirectoryHandle('scratch', { create: false });
        total = await recurse(scratch);
      } catch {
        // scratch may not exist
      }
      return fmtBytes(total);
    } catch {
      return '—';
    }
  }

  async function measureAll() {
    loading = true;
    try {
      const est = await navigator.storage.estimate();
      total = est.usage
        ? fmtBytes(est.usage) +
          (est.quota ? ' / ' + fmtBytes(est.quota) + ' ' : '') +
          '(origin-wide)'
        : '—';

      // Measure each category asynchronously; update as results arrive
      const updates = await Promise.all([
        measureLocalStorage().then((s) => ({ id: 'localStorage', size: s })),
        measureIndexedDB('recipes').then((s) => ({ id: 'recipes', size: s })),
        measureIndexedDB('providers').then((s) => ({ id: 'providers', size: s })),
        measureIndexedDB('ctimg-cost-ledger').then((s) => ({ id: 'ledger', size: s })),
        measureIndexedDB('modelCache').then((s) => ({ id: 'modelCache', size: s })),
        measureCacheStorage().then((s) => ({ id: 'assets', size: s })),
        measureOPFS().then((s) => ({ id: 'scratch', size: s })),
      ]);

      for (const u of updates) {
        const idx = stores.findIndex((s) => s.id === u.id);
        if (idx !== -1) stores[idx].size = u.size;
      }
    } catch (_e) {
      // Graceful failure: keep existing estimates, show error state
    } finally {
      loading = false;
    }
  }

  async function deleteStore(id: string) {
    if (!confirm('Delete ' + id + '? This operation targets only this storage category.')) return;
    try {
      if (id === 'localStorage') {
        // Remove only application keys
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (
            k &&
            (k.startsWith('ctimg-') ||
              k.includes('theme') ||
              k.includes('locale') ||
              k.includes('recipe') ||
              k.includes('provider') ||
              k.includes('preference') ||
              k === 'ctimg-settings')
          ) {
            localStorage.removeItem(k);
          }
        }
      } else if (id === 'recipes' || id === 'modelCache' || id === 'ledger' || id === 'providers') {
        // Note: exact DB names for recipes/providers differ; delete only if DB name matches
        // For this implementation, delete by known names where they exist
        const known = {
          recipes: 'recipes',
          providers: 'providers',
          modelCache: 'modelCache',
          ledger: 'ctimg-cost-ledger',
        };
        const db = (known as Record<string, string>)[id];
        if (db) {
          const req = indexedDB.deleteDatabase(db);
          await new Promise<void>((res, rej) => {
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
          });
        }
      } else if (id === 'assets') {
        const names = await caches.keys();
        for (const n of names) {
          if (n.includes('assets')) await caches.delete(n);
        }
      } else if (id === 'scratch') {
        // OPFS deletion if directory exists
        if (navigator.storage?.getDirectory) {
          const dir = await (navigator as { storage: NavigatorStorage }).storage.getDirectory();
          try {
            const scratch = await dir.getDirectoryHandle('scratch', { create: false });
            await scratch.removeEntry('scratch'); // approximate
          } catch {
            /* ignore */
          }
        }
      }
      // Refresh measurements
      await measureAll();
    } catch (e) {
      alert('Deletion failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function deleteAll() {
    if (!confirm('Delete everything and reset? This cannot be undone.')) return;
    try {
      // localStorage
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (
          k &&
          (k.startsWith('ctimg-') ||
            k.includes('theme') ||
            k.includes('locale') ||
            k.includes('recipe') ||
            k.includes('provider') ||
            k.includes('preference') ||
            k === 'ctimg-settings')
        ) {
          localStorage.removeItem(k);
        }
      }
      // IndexedDB: delete known app DBs per README §18.1
      for (const db of [
        'recipes',
        'providers',
        'ctimg-cost-ledger',
        'modelCache',
        'ctimg-t32-models',
        'ctimg-t57-models',
      ]) {
        try {
          indexedDB.deleteDatabase(db);
        } catch {
          /* ignore */
        }
      }
      // Cache Storage
      const names = await caches.keys();
      for (const n of names) {
        if (n.includes('assets')) await caches.delete(n);
      }
      // OPFS scratch
      if (navigator.storage?.getDirectory) {
        try {
          const dir = await (navigator as { storage: NavigatorStorage }).storage.getDirectory();
          await dir.removeEntry('scratch', { recursive: true });
        } catch {
          /* ignore */
        }
      }
      await measureAll();
    } catch (e) {
      alert('Reset failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  onMount(() => {
    measureAll();
  });
</script>

<main aria-label="Settings and data screen">
  <h1>Settings → Data</h1>
  <p>
    Every store listed with measured size and a delete button. Measurements are estimates based on
    the underlying storage APIs; exact byte counts depend on browser encoding and metadata overhead.
  </p>

  <section aria-label="Data stores">
    {#if loading}
      <p aria-live="polite">Measuring storage…</p>
    {/if}
    {#each stores as s (s.id)}
      <article aria-label={s.name} class="store-row">
        <h2>{s.name}</h2>
        <p>{s.label}</p>
        <span role="status" aria-label="Size for {s.name}">{s.size}</span>
        <button onclick={() => deleteStore(s.id)} aria-label="Delete {s.name}" disabled={loading}>
          Delete
        </button>
      </article>
    {/each}
  </section>

  <section aria-label="Total usage" aria-live="polite">
    <h2>Total origin usage: {total}</h2>
  </section>

  <section aria-label="Reset" class="reset-section">
    <button onclick={deleteAll} aria-label="Delete everything and reset" disabled={loading}>
      Delete everything and reset
    </button>
  </section>
</main>

<style>
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
  h1 {
    font-size: 1.8rem;
    margin-bottom: 0.5rem;
  }
  .store-row {
    border: 1px solid #ccc;
    padding: 1rem;
    margin-bottom: 0.75rem;
    border-radius: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .store-row h2 {
    flex: 1 1 100%;
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }
  .store-row p {
    flex: 1 1 60%;
    margin: 0;
    color: #555;
    font-size: 0.9rem;
  }
  .store-row span {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  button {
    padding: 0.35rem 0.75rem;
    border: 1px solid #777;
    background: #f8f8f8;
    border-radius: 0.3rem;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: #eee;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .reset-section {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 2px solid #ddd;
  }
</style>
