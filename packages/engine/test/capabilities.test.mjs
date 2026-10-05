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
    showDirectoryPicker() {},
    showSaveFilePicker() {},
    FileSystemDirectoryHandle: class {},
    FileSystemWritableFileStream: class {},
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
    fileSystemDirectoryAccess: true,
    saveFilePicker: true,
    opfs: true,
    webCodecs: true,
  });
  const formats = await probeCapabilities(environment);
  assert.equal(formats.find(({ id }) => id === 'jpeg').decode, 'ready');
});

test('reports the File System Access directory and save pickers separately from the file picker', () => {
  // README §7.2 gives each API its own fallback, so folding them into one flag would hide which
  // of the three is actually missing — and the file picker existing says nothing about folders.
  const pickerOnly = probeRuntimeCapabilities({ showOpenFilePicker() {} });
  assert.equal(pickerOnly.fileSystemAccess, true);
  assert.equal(pickerOnly.fileSystemDirectoryAccess, false);
  assert.equal(pickerOnly.saveFilePicker, false);

  const directoryOnly = probeRuntimeCapabilities({
    showDirectoryPicker() {},
    FileSystemDirectoryHandle: class {},
    FileSystemWritableFileStream: class {},
  });
  assert.equal(directoryOnly.fileSystemAccess, false);
  assert.equal(directoryOnly.fileSystemDirectoryAccess, true);
  assert.equal(directoryOnly.saveFilePicker, false);

  // The picker without the handle constructors is not enough: there is nothing to enumerate or
  // write through, which is the failure T74 would otherwise offer a button for.
  const pickerWithoutHandles = probeRuntimeCapabilities({ showDirectoryPicker() {} });
  assert.equal(pickerWithoutHandles.fileSystemDirectoryAccess, false);

  assert.equal(probeRuntimeCapabilities({ showSaveFilePicker() {} }).saveFilePicker, true);
});

test('reports unavailable acceleration honestly in a minimal environment', () => {
  const result = probeRuntimeCapabilities({ WebAssembly: { validate: () => false } });
  assert.ok(Object.values(result).every((value) => value === false));
});
