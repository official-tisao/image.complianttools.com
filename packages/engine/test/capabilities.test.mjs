import assert from 'node:assert/strict';
import test from 'node:test';

import { probeCapabilities, probeRuntimeCapabilities } from '../dist/index.js';

test('probes browser features without a user agent', async () => {
  const environment = {
    WebAssembly: { validate: () => true },
    SharedArrayBuffer: class {},
    Atomics: {},
    crossOriginIsolated: true,
    OffscreenCanvas: class {},
    ImageDecoder: class {},
    showOpenFilePicker() {},
    navigator: { gpu: {}, storage: { getDirectory() {} } },
    document: { createElement: () => ({ getContext: (name) => (name === 'webgl2' ? {} : null) }) },
  };
  assert.deepEqual(probeRuntimeCapabilities(environment), {
    wasmSimd: true,
    wasmThreads: true,
    webGpu: true,
    webGl2: true,
    offscreenCanvas: true,
    fileSystemAccess: true,
    opfs: true,
    webCodecs: true,
  });
  const formats = await probeCapabilities(environment);
  assert.equal(formats.find(({ id }) => id === 'jpeg').decode, 'ready');
});

test('reports unavailable acceleration honestly in a minimal environment', () => {
  const result = probeRuntimeCapabilities({ WebAssembly: { validate: () => false } });
  assert.ok(Object.values(result).every((value) => value === false));
});
