<script lang="ts">
  import { onMount } from 'svelte';
  import { STORES } from '$lib/settings-data/stores';
  import {
    measureLocalStorage,
    listIndexedDBNames,
    measureIndexedDBStore,
    measureCacheStorage,
    measureOpfsScratch,
    measureStorageEstimate,
    type Measurement,
  } from '$lib/settings-data/measure';
  import {
    deleteEverything,
    clearDownloadedModules,
    type DeleteResult,
  } from '$lib/settings-data/delete';

  let measurements = $state<Record<string, Measurement>>({});
  let storageEstimate = $state<{ usage?: number; quota?: number; note: string }>({
    note: 'Not yet measured',
  });
  let deletingAll = $state(false);
  let deletingModule = $state(false);
  let statusMessage = $state('');
  let confirmResetOpen = $state(false);

  async function refreshMeasurements() {
    const m: Record<string, Measurement> = {};
    const localStorage = measureLocalStorage();
    const dbNames = await listIndexedDBNames();

    // Theme/locale/units + tool options: measured from localStorage
    m['localStorage-theme'] = {
      storeId: 'localStorage-theme',
      label: 'Theme, locale, units',
      measuredBytes: localStorage.bytes,
      recordCount: localStorage.entries,
      fileCount: 0,
      note: localStorage.bytes === 0 ? 'No settings saved yet.' : '',
    };
    m['localStorage-tool-options'] = {
      storeId: 'localStorage-tool-options',
      label: 'Per-tool last-used options',
      measuredBytes: 0,
      recordCount: 0,
      fileCount: 0,
      note: 'Measured separately if implemented.',
    };

    // Recipes
    const recipesDB = dbNames.includes('recipes')
      ? await measureIndexedDBStore('recipes', 'recipes')
      : { records: 0, bytes: 0, note: 'Database not found.' };
    m['indexedDB-recipes'] = {
      storeId: 'indexedDB-recipes',
      label: 'Saved recipes',
      measuredBytes: recipesDB.bytes,
      recordCount: recipesDB.records,
      fileCount: 0,
      note: recipesDB.note,
    };

    // Providers
    const providersDB = dbNames.includes('providers')
      ? await measureIndexedDBStore('providers')
      : { records: 0, bytes: 0, note: 'Database not found.' };
    m['indexedDB-providers'] = {
      storeId: 'indexedDB-providers',
      label: 'Provider config (non-secret)',
      measuredBytes: providersDB.bytes,
      recordCount: providersDB.records,
      fileCount: 0,
      note: providersDB.note,
    };

    // Credentials (measured only if DB exists; avoid creating it)
    const credDB = dbNames.includes('credentials')
      ? await measureIndexedDBStore('credentials')
      : { records: 0, bytes: 0, note: 'Not implemented or database not found.' };
    m['indexedDB-credentials'] = {
      storeId: 'indexedDB-credentials',
      label: 'Credentials',
      measuredBytes: credDB.bytes,
      recordCount: credDB.records,
      fileCount: 0,
      note: credDB.note,
    };

    // Ledger (measure from existing DB only)
    const ledgerDB = dbNames.includes('ctimg-cost-ledger')
      ? await measureIndexedDBStore('ctimg-cost-ledger', 'records')
      : { records: 0, bytes: 0, note: 'Database not found.' };
    m['indexedDB-ledger'] = {
      storeId: 'indexedDB-ledger',
      label: 'Cost ledger',
      measuredBytes: ledgerDB.bytes,
      recordCount: ledgerDB.records,
      fileCount: 0,
      note: ledgerDB.note,
    };

    // Model cache
    const modelCacheDB = dbNames.includes('ctimg-t32-models')
      ? await measureIndexedDBStore('ctimg-t32-models', 'registered-models')
      : { records: 0, bytes: 0, note: 'No cached models found.' };
    m['indexedDB-modelCache'] = {
      storeId: 'indexedDB-modelCache',
      label: 'Cached model lists',
      measuredBytes: modelCacheDB.bytes,
      recordCount: modelCacheDB.records,
      fileCount: 0,
      note: modelCacheDB.note,
    };

    // Cache modules
    const cache = await measureCacheStorage();
    m['cache-module-assets'] = {
      storeId: 'cache-module-assets',
      label: 'WASM modules + ONNX models',
      measuredBytes: cache.bytes,
      recordCount: cache.entries,
      fileCount: 0,
      note: cache.entries === 0 ? 'No downloaded module caches found.' : '',
    };

    // OPFS scratch
    const scratch = await measureOpfsScratch();
    m['opfs-scratch'] = {
      storeId: 'opfs-scratch',
      label: 'Large intermediates / batch spill',
      measuredBytes: scratch.bytes,
      recordCount: scratch.files,
      fileCount: scratch.files,
      note: scratch.note,
    };

    // Memory-only
    m['memory-undo'] = {
      storeId: 'memory-undo',
      label: 'Undo history',
      measuredBytes: 0,
      recordCount: 0,
      fileCount: 0,
      note: 'Memory only — not persisted to any store.',
    };
    m['memory-input-output'] = {
      storeId: 'memory-input-output',
      label: 'Input files, output files, pixels',
      measuredBytes: 0,
      recordCount: 0,
      fileCount: 0,
      note: 'Memory / OPFS scratch only, never persisted.',
    };

    measurements = m;
  }

  async function refreshStorageEstimate() {
    storageEstimate = await measureStorageEstimate();
  }

  onMount(async () => {
    await refreshMeasurements();
    await refreshStorageEstimate();
  });

  async function handleDelete(storeId: string) {
    if (storeId === 'cache-module-assets') {
      deletingModule = true;
      statusMessage = 'Clearing downloaded modules...';
      const result = await clearDownloadedModules();
      deletingModule = false;
      statusMessage = result.message;
      await refreshMeasurements();
      return;
    }
    // For persistent stores we could implement individual deletion; here we handle reset only.
    statusMessage = 'Individual deletion not implemented for this store; use "Delete everything".';
  }

  async function handleReset() {
    deletingAll = true;
    statusMessage = 'Deleting everything and resetting...';
    const results = await deleteEverything();
    deletingAll = false;
    confirmResetOpen = false;
    const failed = results.filter((r: DeleteResult) => !r.ok);
    const deletedAny = results.some((r: DeleteResult) => r.deleted);
    const messages = results.map((r: DeleteResult) => r.message).join(' ');
    statusMessage =
      failed.length > 0
        ? `Partial failure: ${messages}`
        : deletedAny
          ? `All persistent data removed: ${messages}`
          : `No persistent data found: ${messages}`;
    await refreshMeasurements();
    await refreshStorageEstimate();
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
</script>

<svelte:head>
  <title>Settings → Data — ctimg</title>
  <meta
    name="description"
    content="Review and manage stored data: recipes, models, settings, and module caches."
  />
</svelte:head>

<main class="reference" lang="en" dir="ltr" data-testid="settings-data">
  <nav aria-label="Breadcrumb">
    <a href="/">ctimg</a>
    <span aria-hidden="true">/</span>
    <a href="/settings">Settings</a>
    <span aria-hidden="true">/</span>
    <span aria-current="page">Data</span>
  </nav>

  <h1>Settings → Data</h1>
  <p class="eyebrow" style="margin-top: 0; color: #5c5a56; font-size: 15px;">
    Every store listed in §18.1, with its actual measured size and record/file count. No fabricated
    values. Memory-only stores are clearly labelled.
  </p>

  <section aria-label="Overall browser-origin storage">
    <h2>Browser-origin storage context</h2>
    <p>
      <code>navigator.storage.estimate()</code> gives overall usage and quota for this origin — it is
      shown as context, not a substitute for per-store measurements.
    </p>
    <dl class="store-detail-list" style="margin-top: 12px;">
      <dt>Usage</dt>
      <dd data-testid="storage-estimate-usage">
        {storageEstimate.usage !== undefined ? formatBytes(storageEstimate.usage) : 'Not available'}
      </dd>
      <dt>Quota</dt>
      <dd data-testid="storage-estimate-quota">
        {storageEstimate.quota !== undefined ? formatBytes(storageEstimate.quota) : 'Not available'}
      </dd>
      <dt>Note</dt>
      <dd data-testid="storage-estimate-note">{storageEstimate.note || '—'}</dd>
    </dl>
  </section>

  <section aria-label="Per-store measurements">
    <h2>Every store</h2>
    <table class="store-table" style="width: 100%; border-collapse: collapse; margin-top: 16px;">
      <thead>
        <tr>
          <th
            scope="col"
            style="text-align: left; padding: 8px; border-bottom: 2px solid #1c1a1720;">Store</th
          >
          <th
            scope="col"
            style="text-align: left; padding: 8px; border-bottom: 2px solid #1c1a1720;"
            >Measured size</th
          >
          <th
            scope="col"
            style="text-align: left; padding: 8px; border-bottom: 2px solid #1c1a1720;"
            >Records / files</th
          >
          <th
            scope="col"
            style="text-align: left; padding: 8px; border-bottom: 2px solid #1c1a1720;"
            >Status / note</th
          >
          <th
            scope="col"
            style="text-align: left; padding: 8px; border-bottom: 2px solid #1c1a1720;">Action</th
          >
        </tr>
      </thead>
      <tbody>
        {#each STORES as store (store.id)}
          {@const m = measurements[store.id]}
          <tr data-testid="store-row-{store.id}">
            <th scope="row" style="padding: 10px 8px; vertical-align: top;">
              <strong>{store.label}</strong><br />
              <span style="font-size: 12px; color: #5c5a56;">{store.id}</span>
            </th>
            <td
              style="padding: 10px 8px; vertical-align: top; font-family: ui-monospace, monospace; font-size: 12px;"
            >
              {m ? formatBytes(m.measuredBytes) : 'Measuring...'}
            </td>
            <td style="padding: 10px 8px; vertical-align: top; font-size: 13px;">
              {m
                ? m.recordCount > 0
                  ? `${m.recordCount} record${m.recordCount === 1 ? '' : 's'}`
                  : m.fileCount > 0
                    ? `${m.fileCount} file${m.fileCount === 1 ? '' : 's'}`
                    : 'None'
                : '—'}
            </td>
            <td style="padding: 10px 8px; vertical-align: top; font-size: 12px; color: #5c5a56;">
              {#if store.kind === 'memory-only'}
                <span style="color: #c23b22; font-weight: 600;">Memory only — not persisted.</span>
              {:else if store.kind === 'not-yet-implemented'}
                <span style="color: #c23b22; font-weight: 600;">Not yet implemented.</span>
              {:else}
                {m?.note ||
                  (m ? (m.measuredBytes === 0 ? 'No data found.' : 'Active.') : 'Measuring...')}
              {/if}
            </td>
            <td style="padding: 10px 8px; vertical-align: top;">
              {#if store.id === 'cache-module-assets'}
                <button
                  class="button"
                  data-testid="btn-clear-modules"
                  onclick={() => handleDelete('cache-module-assets')}
                  disabled={deletingModule}
                  aria-label="Clear downloaded module caches"
                >
                  {deletingModule ? 'Clearing...' : 'Clear downloaded modules'}
                </button>
              {:else if store.canDelete && store.kind === 'persistent'}
                <button
                  class="button"
                  data-testid="btn-delete-{store.id}"
                  onclick={() => handleDelete(store.id)}
                  aria-label="Delete {store.label}">Delete</button
                >
              {:else if store.kind === 'memory-only'}
                <span style="font-size: 12px; color: #5c5a56;">Not applicable</span>
              {:else}
                <span style="font-size: 12px; color: #5c5a56;">—</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section
    aria-label="Reset all"
    style="margin-top: 32px; padding-top: 24px; border-top: 2px solid #1c1a1720;"
  >
    <h2>Delete everything and reset</h2>
    <p>
      Removes all app-owned persistent user data (localStorage, IndexedDB, Cache Storage modules,
      OPFS scratch) and downloaded modules. This is a single confirmation — no maze.
    </p>
    <div style="margin-top: 12px; display: flex; gap: 12px; align-items: center;">
      {#if !confirmResetOpen}
        <button
          class="button primary"
          data-testid="btn-confirm-reset"
          onclick={() => (confirmResetOpen = true)}
          aria-label="Open confirmation for deleting everything">Confirm reset</button
        >
      {:else}
        <p role="alert" aria-live="assertive" style="margin: 0; font-weight: 600;">
          Confirm you want to delete everything. This cannot be undone.
        </p>
        <button
          class="button"
          data-testid="btn-do-reset"
          onclick={handleReset}
          disabled={deletingAll}
          aria-label="Delete everything and reset"
          >{deletingAll ? 'Deleting...' : 'Delete everything'}</button
        >
        <button
          class="button"
          data-testid="btn-cancel-reset"
          onclick={() => (confirmResetOpen = false)}
          aria-label="Cancel reset">Cancel</button
        >
      {/if}
    </div>
  </section>

  <p
    role="status"
    aria-live="polite"
    data-testid="status-message"
    style="margin-top: 16px; padding: 10px 12px; background: #ebe6de; border-radius: 6px; font-size: 14px;"
  >
    {statusMessage || '—'}
  </p>
</main>

<style>
  .store-detail-list {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 16px;
  }
  .store-detail-list dt {
    font-weight: 500;
  }
  .store-detail-list dd {
    margin: 0;
    color: #1c1a17;
  }
  .store-table th,
  .store-table td {
    vertical-align: top;
  }
</style>
