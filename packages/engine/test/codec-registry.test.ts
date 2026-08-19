import { describe, expect, it } from 'vitest';

import { codecCapabilities, getCodec, loadCodec } from '../src/index.js';

describe('P2 codec registry', () => {
  it('reports only registered formats and their lazy download costs', () => {
    const capabilities = codecCapabilities({
      wasmSimd: false,
      wasmThreads: false,
      webGpu: false,
      webGl2: false,
      offscreenCanvas: false,
      fileSystemAccess: false,
      opfs: false,
      webCodecs: false,
    });
    expect(capabilities).toHaveLength(20);
    expect(capabilities.find((entry) => entry.id === 'jpeg')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
      lazyBytes: 195_000,
    });
    expect(capabilities.find((entry) => entry.id === 'gif')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
    });
    expect(capabilities.find((entry) => entry.id === 'heic')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
    });
    expect(capabilities.find((entry) => entry.id === 'exr')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
      unavailableReason: 'OpenEXR encoding is not implemented.',
    });
    expect(capabilities.find((entry) => entry.id === 'pfm')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
    });
    expect(capabilities.find((entry) => entry.id === 'fits')).toMatchObject({ decode: 'lazy' });
    expect(capabilities.find((entry) => entry.id === 'hdr')).toMatchObject({ decode: 'lazy' });
    expect(capabilities.find((entry) => entry.id === 'ico')).toMatchObject({ encode: 'lazy' });
  });

  it('loads implemented codecs and rejects a codec with no implementation', async () => {
    await expect(loadCodec('jpeg')).resolves.toBeDefined();
    await expect(loadCodec('exr')).resolves.toBeDefined();
    await expect(loadCodec('gif')).resolves.toBeDefined();
    expect(getCodec('webp').supports).toEqual(['decode', 'encode']);
  });
});
