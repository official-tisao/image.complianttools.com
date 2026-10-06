/**
 * Settings → Data — storage measurement and deletion.
 */
export interface StoreInfo {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly lifetime: string;
  readonly kind: 'persistent' | 'memory-only' | 'not-yet-implemented';
  readonly canDelete: boolean;
}
export const STORES: readonly StoreInfo[] = [
  { id: 'localStorage-theme', label: 'Theme, locale, units', description: 'User settings saved in localStorage.', lifetime: 'Forever', kind: 'persistent', canDelete: true },
  { id: 'localStorage-tool-options', label: 'Per-tool last-used options', description: 'Last-used settings for each tool.', lifetime: 'Forever', kind: 'persistent', canDelete: true },
  { id: 'indexedDB-recipes', label: 'Saved recipes', description: 'IndexedDB `recipes` store.', lifetime: 'Forever', kind: 'persistent', canDelete: true },
  { id: 'indexedDB-providers', label: 'Provider config (non-secret)', description: 'IndexedDB `providers` store.', lifetime: 'Forever', kind: 'persistent', canDelete: true },
  { id: 'indexedDB-credentials', label: 'Credentials', description: 'Per mode (§16.2).', lifetime: 'Per mode', kind: 'persistent', canDelete: true },
  { id: 'indexedDB-ledger', label: 'Cost ledger', description: 'IndexedDB `ledger` — rolling 365 days.', lifetime: 'Rolling 365 days', kind: 'persistent', canDelete: true },
  { id: 'indexedDB-modelCache', label: 'Cached model lists', description: 'IndexedDB `modelCache` — 24 h TTL.', lifetime: '24 h TTL', kind: 'persistent', canDelete: true },
  { id: 'cache-module-assets', label: 'WASM modules + ONNX models', description: 'Cache Storage (`assets-v{n}`).', lifetime: 'Until version change', kind: 'persistent', canDelete: true },
  { id: 'opfs-scratch', label: 'Large intermediates / batch spill', description: 'OPFS `scratch/`.', lifetime: 'Auto', kind: 'persistent', canDelete: true },
  { id: 'memory-undo', label: 'Undo history', description: 'Memory only.', lifetime: 'Session', kind: 'memory-only', canDelete: false },
  { id: 'memory-input-output', label: 'Input files, output files, pixels', description: 'Memory / OPFS scratch only.', lifetime: 'Until tab close', kind: 'memory-only', canDelete: false },
];