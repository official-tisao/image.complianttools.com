/**
 * P5-05 — Ledger persistence layer (IndexedDB, local-only).
 * Never transmits ledger data externally.
 */

import type { LedgerRecord, PriceTableVersion, SpendThresholdConfig } from './ledger.js';
import { DEFAULT_PRICE_TABLE } from './ledger.js';

const LEDGER_DB = 'ctimg-cost-ledger';
const LEDGER_STORE = 'records';
const PRICE_STORE = 'price-table';
const THRESHOLD_STORE = 'thresholds';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEDGER_DB, DB_VERSION);
    request.onerror = () => reject(new Error('IndexedDB open failed for ledger'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(LEDGER_STORE)) {
        db.createObjectStore(LEDGER_STORE, { keyPath: 'timestamp' });
      }
      if (!db.objectStoreNames.contains(PRICE_STORE)) {
        db.createObjectStore(PRICE_STORE, { keyPath: 'version' });
      }
      if (!db.objectStoreNames.contains(THRESHOLD_STORE)) {
        db.createObjectStore(THRESHOLD_STORE, { keyPath: 'id' });
      }
    };
  });
}

export async function saveRecord(record: LedgerRecord): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LEDGER_STORE, 'readwrite');
    tx.onerror = () => reject(tx.error ?? new Error('Ledger write failed'));
    tx.oncomplete = () => resolve();
    tx.objectStore(LEDGER_STORE).put(record);
  }).finally(() => db.close());
}

export async function getAllRecords(): Promise<readonly LedgerRecord[]> {
  const db = await openDB();
  return new Promise<readonly LedgerRecord[]>((resolve, reject) => {
    const tx = db.transaction(LEDGER_STORE, 'readonly');
    const store = tx.objectStore(LEDGER_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as LedgerRecord[]);
    req.onerror = () => reject(req.error ?? new Error('Ledger read failed'));
  }).finally(() => db.close());
}

export async function getRecordsByProvider(provider: string): Promise<readonly LedgerRecord[]> {
  const all = await getAllRecords();
  return all.filter((r) => r.provider === provider);
}

export async function savePriceTable(table: PriceTableVersion): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PRICE_STORE, 'readwrite');
    tx.onerror = () => reject(tx.error ?? new Error('Price table write failed'));
    tx.oncomplete = () => resolve();
    tx.objectStore(PRICE_STORE).put(table);
  }).finally(() => db.close());
}

export async function loadPriceTable(): Promise<PriceTableVersion | undefined> {
  const db = await openDB();
  return new Promise<PriceTableVersion | undefined>((resolve, reject) => {
    const tx = db.transaction(PRICE_STORE, 'readonly');
    const req = tx.objectStore(PRICE_STORE).get('table');
    req.onsuccess = () => resolve(req.result as PriceTableVersion | undefined);
    req.onerror = () => reject(req.error ?? new Error('Price table read failed'));
  }).finally(() => db.close());
}

export async function saveThresholdConfig(config: SpendThresholdConfig): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(THRESHOLD_STORE, 'readwrite');
    tx.onerror = () => reject(tx.error ?? new Error('Threshold write failed'));
    tx.oncomplete = () => resolve();
    tx.objectStore(THRESHOLD_STORE).put({ id: 'config', ...config });
  }).finally(() => db.close());
}

export async function loadThresholdConfig(): Promise<SpendThresholdConfig | undefined> {
  const db = await openDB();
  return new Promise<SpendThresholdConfig | undefined>((resolve, reject) => {
    const tx = db.transaction(THRESHOLD_STORE, 'readonly');
    const req = tx.objectStore(THRESHOLD_STORE).get('config');
    req.onsuccess = () =>
      resolve(req.result ? (({ id: _, ...rest }) => rest)(req.result) : undefined);
    req.onerror = () => reject(req.error ?? new Error('Threshold read failed'));
  }).finally(() => db.close());
}

/** Helper to compute provider totals from local records (no external transmission). */
export async function computeProviderTotals(): Promise<Record<string, string>> {
  try {
    const records = await getAllRecords();
    const totals: Record<string, number> = {};
    for (const r of records) {
      const cost = parseFloat(r.usage.providerCost ?? r.estimatedCost ?? '0');
      totals[r.provider] = (totals[r.provider] ?? 0) + cost;
    }
    const result: Record<string, string> = {};
    for (const [prov, total] of Object.entries(totals)) {
      result[prov] = total.toFixed(4);
    }
    return result;
  } catch {
    return {};
  }
}

/** Compute total spend from records. */
export async function computeTotalSpent(): Promise<string> {
  try {
    const records = await getAllRecords();
    let total = 0;
    for (const r of records) {
      total += parseFloat(r.usage.providerCost ?? r.estimatedCost ?? '0');
    }
    return total.toFixed(4);
  } catch {
    return '0.0000';
  }
}

/** Pre-request estimate from local price table. Always labelled an estimate. */
export async function estimateRequestCost(
  provider: string,
  model: string,
  capability: string,
  usage?: { images?: number; inputTokens?: number; outputTokens?: number },
): Promise<{ estimate: string; label: string; source: string }> {
  // If indexedDB is unavailable (e.g. some test environments), fall back to default price table
  let table: PriceTableVersion | undefined;
  try {
    table = await loadPriceTable();
  } catch {
    table = undefined;
  }
  const activeTable = table ?? DEFAULT_PRICE_TABLE;
  const entry = (activeTable.entries ?? []).find(
    (e) => e.provider === provider && e.model === model && e.capability === capability,
  );
  let estimateValue = 0;
  if (entry) {
    const unit = parseFloat(entry.estimatedUnitCost);
    const imgCount = usage?.images ?? 1;
    estimateValue = unit * imgCount;
  } else {
    // No documented price: preserve limitation, don't invent a value
    // Return a clearly labelled zero/unknown estimate rather than fabricating cost
    return {
      estimate: '0.0000',
      label:
        'Estimate unavailable — no documented price for this provider/model/capability (see price table version ' +
        activeTable.version +
        ', updated ' +
        (activeTable.lastUpdated ?? 'unknown') +
        ').',
      source: 'local-price-table',
    };
  }
  return {
    estimate: estimateValue.toFixed(4),
    label: `Estimate: ≈ $${estimateValue.toFixed(4)} (derived from local price table v${activeTable.version}, last updated ${activeTable.lastUpdated ?? 'unknown'}; always an estimate — verify with provider pricing page)`,
    source: 'local-price-table',
  };
}

export function buildCsvExport(records: readonly LedgerRecord[]): string {
  const header =
    'timestamp,provider,model,capability,inputTokens,outputTokens,images,providerCost,requestId,estimatedCost\n';
  const rows = records.map((r) => {
    const u = r.usage;
    return [
      r.timestamp,
      r.provider,
      r.model,
      r.capability,
      String(u.inputTokens ?? ''),
      String(u.outputTokens ?? ''),
      String(u.images ?? ''),
      u.providerCost ?? '',
      u.requestId ?? '',
      r.estimatedCost,
    ]
      .map((cell) => {
        const s = String(cell);
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      })
      .join(',');
  });
  return header + rows.join('\n');
}
