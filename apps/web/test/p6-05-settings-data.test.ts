/**
 * Focused tests for P6-05 Settings → Data measurement, fallbacks, and deletion.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  measureLocalStorage,
  listIndexedDBNames,
  measureIndexedDBStore,
  measureStorageEstimate,
  measureCacheStorage,
  measureOpfsScratch,
} from '../src/lib/settings-data/measure.ts';
import {
  deleteEverything,
  clearDownloadedModules,
} from '../src/lib/settings-data/delete.ts';

test('P6-05 measurement: localStorage returns numbers', () => {
  const result = measureLocalStorage();
  assert.equal(typeof result.bytes, 'number');
  assert.equal(typeof result.entries, 'number');
  assert.ok(result.bytes >= 0);
  assert.ok(result.entries >= 0);
});

test('P6-05 measurement: navigator.storage.estimate() handled gracefully', async () => {
  const result = await measureStorageEstimate();
  assert.ok(typeof result.note === 'string');
  // If the API exists, usage and quota should be defined or undefined, never NaN.
  if (result.usage !== undefined) assert.ok(Number.isFinite(result.usage) || result.usage > 0 || result.usage === 0);
});

test('P6-05 measurement: listIndexedDBNames never throws', async () => {
  const names = await listIndexedDBNames();
  assert.ok(Array.isArray(names));
});

test('P6-05 measurement: measureIndexedDBStore handles missing DB', async () => {
  const result = await measureIndexedDBStore('nonexistent-db-for-p6-05');
  assert.equal(result.records, 0);
  assert.equal(result.bytes, 0);
  assert.ok(typeof result.note === 'string');
});

test('P6-05 measurement: measureCacheStorage handles missing caches', async () => {
  const result = await measureCacheStorage();
  assert.ok(typeof result.entries === 'number');
  assert.ok(typeof result.bytes === 'number');
  assert.ok(Array.isArray(result.keys));
});

test('P6-05 measurement: measureOpfsScratch handles missing OPFS', async () => {
  const result = await measureOpfsScratch();
  assert.ok(typeof result.files === 'number');
  assert.ok(typeof result.bytes === 'number');
  assert.ok(typeof result.note === 'string');
});

test('P6-05 deletion: deleteEverything returns array with results', async () => {
  const results = await deleteEverything();
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.ok(typeof r.ok === 'boolean');
    assert.ok(typeof r.deleted === 'boolean');
    assert.ok(typeof r.message === 'string');
  }
});

test('P6-05 deletion: clearDownloadedModules handles missing caches', async () => {
  const result = await clearDownloadedModules();
  assert.ok(typeof result.ok === 'boolean');
  assert.ok(typeof result.deleted === 'boolean');
  assert.ok(typeof result.message === 'string');
});
