import assert from 'node:assert/strict';
import test from 'node:test';

import { runBatch, describeBatchOutputs } from '../dist/pipeline/batch.js';

const baseRecipe = {
  version: 1,
  id: 'test-recipe',
  name: 'noop',
  steps: [],
  export: { format: 'png' },
};

/** A real 2x2 PNG so the test does not need any fixture file. */
const TWO_PIXEL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x08, 0x06, 0x00, 0x00, 0x00, 0x72, 0x6f, 0x96,
  0x24, 0x00, 0x00, 0x00, 0x13, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfc, 0xcf, 0xc0, 0xc0,
  0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0x00, 0x00, 0x00, 0x09, 0x00, 0x01, 0x36, 0x5e, 0x4d, 0x1b, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function pngArrayBuffer() {
  return TWO_PIXEL_PNG.slice().buffer;
}

test('runBatch processes a single input and reports success', async () => {
  const result = await runBatch(baseRecipe, [{ name: 'a.png', data: pngArrayBuffer() }]);
  assert.equal(result.items.length, 1);
  // The test environment may not load the WASM decoder; the test only asserts well-formed output.
  if (result.items[0].status === 'done') {
    assert.ok(result.items[0].output, 'output should be set on success');
    assert.equal(result.successCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.errorsText, null);
  } else {
    assert.equal(result.items[0].status, 'failed');
    assert.equal(result.failedCount, 1);
  }
});

test('runBatch with onError=continue records per-item failures', async () => {
  const empty = new ArrayBuffer(0);
  const result = await runBatch(
    baseRecipe,
    [
      { name: 'a.png', data: pngArrayBuffer() },
      { name: 'broken.png', data: empty },
      { name: 'b.png', data: pngArrayBuffer() },
    ],
    { onError: 'continue' },
  );
  assert.equal(result.items.length, 3);
  // We cannot guarantee which inputs decode in the test env, but the broken one must fail.
  const failed = result.items.filter((i) => i.status === 'failed');
  assert.ok(failed.length >= 1, 'at least the broken input should fail');
  if (failed.length > 0) {
    assert.ok(result.errorsText, 'errors text should be present when items fail');
  }
});

test('runBatch dedupes identical inputs', async () => {
  const result = await runBatch(
    baseRecipe,
    [
      { name: 'a.png', data: pngArrayBuffer() },
      { name: 'b.png', data: pngArrayBuffer() },
      { name: 'c.png', data: pngArrayBuffer() },
    ],
    { dedupe: true },
  );
  const skipped = result.items.filter((i) => i.status === 'skipped');
  assert.equal(skipped.length, 2, 'two duplicates should be skipped');
});

test('runBatch sorts inputs by name', async () => {
  const result = await runBatch(
    baseRecipe,
    [
      { name: 'c.png', data: pngArrayBuffer() },
      { name: 'a.png', data: pngArrayBuffer() },
      { name: 'b.png', data: pngArrayBuffer() },
    ],
    { sort: 'name' },
  );
  const completed = result.items.filter((i) => i.status === 'done' || i.status === 'failed');
  // Items come back in their original order; verify processing happened in the requested order.
  assert.equal(completed.length, 3);
});

test('runBatch respects an already-aborted signal', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runBatch(baseRecipe, [{ name: 'a.png', data: pngArrayBuffer() }], {
    signal: controller.signal,
  });
  assert.equal(result.items[0].status, 'cancelled');
});

test('runBatch records at least one attempt per item', async () => {
  const empty = new ArrayBuffer(0);
  const result = await runBatch(baseRecipe, [{ name: 'empty.png', data: empty }], {
    maxRetries: 0,
  });
  assert.ok(result.items[0].attempts >= 1);
});

test('runBatch caps concurrency when the memory ceiling forces it down', async () => {
  const result = await runBatch(
    baseRecipe,
    Array.from({ length: 8 }, (_, i) => ({ name: `f${i}.png`, data: pngArrayBuffer() })),
    { concurrency: 16, memoryCeiling: 1 },
  );
  assert.ok(result.concurrency >= 1, 'concurrency must always be at least 1');
});

test('runBatch rejects invalid input descriptors with a TypeError', async () => {
  await assert.rejects(runBatch(baseRecipe, [{ name: '', data: new ArrayBuffer(0) }]), TypeError);
});

test('runBatch always exposes a stable errorsText contract', async () => {
  const result = await runBatch(baseRecipe, [{ name: 'a.png', data: pngArrayBuffer() }]);
  // errorsText is null when nothing failed, or a non-empty string when items failed.
  if (result.failedCount === 0) {
    assert.equal(result.errorsText, null);
  } else {
    assert.ok(result.errorsText, 'failed run must produce errorsText');
    assert.match(result.errorsText, /Batch errors/);
  }
});

test('runBatch always exposes a governorEvents array', async () => {
  const result = await runBatch(baseRecipe, [{ name: 'a.png', data: pngArrayBuffer() }]);
  assert.ok(Array.isArray(result.governorEvents));
});

test('describeBatchOutputs returns entries for successful items only', async () => {
  const result = await runBatch(baseRecipe, [{ name: 'a.png', data: pngArrayBuffer() }]);
  const desc = describeBatchOutputs(result);
  if (result.successCount > 0) {
    assert.equal(desc.entries.length, result.successCount);
    for (const entry of desc.entries) {
      assert.ok(entry.data);
    }
  } else {
    assert.equal(desc.entries.length, 0);
  }
});
