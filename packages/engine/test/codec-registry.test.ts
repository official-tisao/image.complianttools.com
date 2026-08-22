import { describe, expect, it } from 'vitest';

import { codecCapabilities, getCodec, loadCodec } from '../src/index.js';
import './encode-raster.test.js';

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
    expect(capabilities).toHaveLength(40);
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
      decode: 'unavailable',
      encode: 'unavailable',
      decodeUnavailableReason:
        'This browser does not provide an HEIC decoder. Open the file on a device with HEIC support or export it as JPEG.',
      encodeUnavailableReason:
        'HEIC encoding is deliberately excluded because HEVC has active patent pools and available browser encoders are GPL or commercial.',
    });
    expect(capabilities.find((entry) => entry.id === 'exr')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
      unavailableReason:
        'OpenEXR encoding is unavailable in v1 because no maintained permissive browser WASM distribution is available; a vendored TinyEXR build has not been produced and verified.',
    });
    expect(capabilities.find((entry) => entry.id === 'pfm')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
    });
    expect(capabilities.find((entry) => entry.id === 'fits')).toMatchObject({ decode: 'lazy' });
    expect(capabilities.find((entry) => entry.id === 'hdr')).toMatchObject({ decode: 'lazy' });
    expect(capabilities.find((entry) => entry.id === 'ico')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
    });
    expect(capabilities.find((entry) => entry.id === 'cur')).toMatchObject({ decode: 'lazy' });
    expect(capabilities.find((entry) => entry.id === 'dds')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
    });
    expect(capabilities.find((entry) => entry.id === 'sun-raster')).toMatchObject({
      decode: 'lazy',
    });
    expect(capabilities.find((entry) => entry.id === 'sgi')).toMatchObject({ decode: 'lazy' });
    expect(capabilities.find((entry) => entry.id === 'psd')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
      lazyBytes: 350_000,
    });
    expect(capabilities.find((entry) => entry.id === 'tiff')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
    });
    expect(capabilities.find((entry) => entry.id === 'apng')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
      animation: true,
    });
    expect(capabilities.find((entry) => entry.id === 'raw')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
      encodeUnavailableReason:
        'Camera RAW encoding is not offered; export the extracted preview or developed pixels to a standard image format.',
    });
    expect(capabilities.find((entry) => entry.id === 'cbz')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
      lazyBytes: 42_000,
    });
    expect(capabilities.find((entry) => entry.id === 'cbr')).toMatchObject({
      decode: 'unavailable',
      encode: 'unavailable',
      decodeUnavailableReason: expect.stringContaining('BSD RAR implementation'),
      encodeUnavailableReason: expect.stringContaining('use CBZ instead'),
    });
    expect(capabilities.find((entry) => entry.id === 'svg')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
    });
    expect(capabilities.find((entry) => entry.id === 'pdf')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
      animation: true,
    });
    for (const id of ['mp4', 'webm'] as const)
      expect(capabilities.find((entry) => entry.id === id)).toMatchObject({
        decode: 'unavailable',
        encode: 'unavailable',
        decodeUnavailableReason: expect.stringContaining('VideoDecoder'),
        encodeUnavailableReason: expect.stringContaining('Video encoding is outside'),
      });
    for (const id of ['jp2', 'pict', 'mng', 'flif', 'cdr', 'dwg', 'djvu'] as const) {
      expect(capabilities.find((entry) => entry.id === id)).toMatchObject({
        decode: 'unavailable',
        encode: 'unavailable',
        decodeUnavailableReason: expect.any(String),
        encodeUnavailableReason: expect.any(String),
        lazyBytes: 0,
      });
    }
  });

  it('loads implemented codecs and rejects a codec with no implementation', async () => {
    await expect(loadCodec('jpeg')).resolves.toBeDefined();
    await expect(loadCodec('exr')).resolves.toBeDefined();
    await expect(loadCodec('gif')).resolves.toBeDefined();
    expect(getCodec('webp').supports).toEqual(['decode', 'encode']);
    expect(getCodec('qoi').supports).toEqual(['decode', 'encode']);
  });

  it('enables platform media decoders only when WebCodecs is present', () => {
    const capabilities = codecCapabilities({
      wasmSimd: false,
      wasmThreads: false,
      webGpu: false,
      webGl2: false,
      offscreenCanvas: false,
      fileSystemAccess: false,
      opfs: false,
      webCodecs: true,
    });
    for (const id of ['heic', 'mp4', 'webm'] as const)
      expect(capabilities.find((entry) => entry.id === id)?.decode).toBe('lazy');
  });
});
