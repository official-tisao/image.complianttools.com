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
    expect(capabilities).toHaveLength(11);
    expect(capabilities.find((entry) => entry.id === 'jpeg')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
      lazyBytes: 195_000,
    });
    expect(capabilities.find((entry) => entry.id === 'gif')?.decode).toBe('unavailable');
    expect(capabilities.find((entry) => entry.id === 'exr')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
      unavailableReason: 'OpenEXR encoding is not implemented.',
    });
  });

  it('loads an implemented codec and rejects an unavailable codec', async () => {
    await expect(loadCodec('jpeg')).resolves.toBeDefined();
    await expect(loadCodec('exr')).resolves.toBeDefined();
    await expect(loadCodec('gif')).rejects.toThrow('unavailable');
    expect(getCodec('webp').supports).toEqual(['decode', 'encode']);
  });
});
