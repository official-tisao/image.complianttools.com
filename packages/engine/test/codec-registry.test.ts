import { describe, expect, it } from 'vitest';

import {
  codecCapabilities,
  codecDownloadDisclosure,
  codecUnavailableError,
  getCodec,
  loadCodec,
  loadEncoder,
  productionEncoderFormats,
  requiresCodecDownloadConsent,
} from '../src/index.js';
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
    expect(capabilities).toHaveLength(57);
    expect(capabilities.find((entry) => entry.id === 'ktx')).toMatchObject({
      decode: 'unavailable',
      encode: 'unavailable',
      decodeUnavailableReason: expect.stringContaining('Basis Universal'),
      encodeUnavailableReason: expect.stringContaining('conformance corpus'),
    });
    expect(capabilities.find((entry) => entry.id === 'jpeg')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
      lazyBytes: 195_000,
    });
    expect(capabilities.find((entry) => entry.id === 'gif')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
    });
    expect(capabilities.find((entry) => entry.id === 'avif')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
      lazyBytes: 1_900_000,
    });
    expect(capabilities.find((entry) => entry.id === 'jxl')).toMatchObject({
      decode: 'lazy',
      encode: 'lazy',
      lazyBytes: 1_200_000,
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
      decode: 'unavailable',
      encode: 'unavailable',
      unavailableReason:
        'OpenEXR is unavailable in v1 because the experimental parser does not provide verified complete ZIP/PIZ interoperability and a reproducible, licence-recorded TinyEXR WASM build has not been produced.',
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
    expect(codecUnavailableError('cbr', 'decode')).toMatchObject({
      kind: 'codec-unavailable',
      format: 'cbr',
      reason: expect.stringContaining('BSD RAR implementation'),
      remedy: expect.any(String),
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
    expect(capabilities.find((entry) => entry.id === 'ai')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
    });
    expect(getCodec('ai').decodeUnavailableReason).toContain('PDF-compatible Illustrator');
    expect(capabilities.find((entry) => entry.id === 'eps')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
      lazyBytes: 10_000,
      encodeUnavailableReason: expect.stringContaining('SVG or PDF'),
    });
    expect(capabilities.find((entry) => entry.id === 'dxf')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
      lazyBytes: 90_000,
    });
    for (const id of ['wmf', 'emf'] as const)
      expect(capabilities.find((entry) => entry.id === id)).toMatchObject({
        decode: 'lazy',
        encode: 'unavailable',
        lazyBytes: 12_000,
      });
    expect(capabilities.find((entry) => entry.id === 'xcf')).toMatchObject({
      decode: 'lazy',
      encode: 'unavailable',
      lazyBytes: 24_000,
    });
    for (const id of ['mp4', 'm4v', 'mov', '3gp', 'webm', 'mkv', 'ogv'] as const)
      expect(capabilities.find((entry) => entry.id === id)).toMatchObject({
        decode: 'unavailable',
        encode: 'unavailable',
        decodeUnavailableReason: expect.stringContaining('VideoDecoder'),
        encodeUnavailableReason: expect.stringContaining('Video encoding is outside'),
      });
    for (const id of ['avi', 'wmv', 'flv', 'mts', 'm2ts'] as const)
      expect(capabilities.find((entry) => entry.id === id)).toMatchObject({
        decode: 'unavailable',
        encode: 'unavailable',
        decodeUnavailableReason: expect.stringContaining('container reader'),
      });
    for (const id of ['jp2', 'pict', 'mng', 'flif', 'cdr', 'dwg', 'djvu', 'ktx'] as const) {
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
    await expect(loadCodec('exr')).rejects.toThrow('OpenEXR is unavailable in v1');
    await expect(loadCodec('gif')).resolves.toBeDefined();
    await expect(loadEncoder('avif')).resolves.toMatchObject({
      encodeRasterAsAvif: expect.any(Function),
    });
    await expect(loadEncoder('jxl')).resolves.toMatchObject({
      encodeRasterAsJxl: expect.any(Function),
    });
    await expect(loadEncoder('heic')).rejects.toThrow('HEIC encoding is deliberately excluded');
    expect(getCodec('webp').supports).toEqual(['decode', 'encode']);
    expect(getCodec('qoi').supports).toEqual(['decode', 'encode']);
    await expect(loadCodec('jp2')).rejects.toThrow(
      'JPEG 2000 is unavailable in v1 because no verified permissive browser package exists',
    );
  });

  it('exposes download cost before loading and never advertises an unavailable generic encoder', () => {
    expect(codecDownloadDisclosure('jpeg')).toEqual({
      id: 'codec:jpeg',
      bytes: 195_000,
      requiresConsent: false,
    });
    for (const id of productionEncoderFormats()) {
      const codec = getCodec(id);
      expect(codec.supports).toContain('encode');
      expect(codec.encodeLoad ?? codec.load).toBeTypeOf('function');
      expect(codecDownloadDisclosure(id).bytes).toBe(codec.lazyBytes);
    }
    expect(productionEncoderFormats()).not.toContain('avif');
    expect(productionEncoderFormats()).not.toContain('heic');
    expect(requiresCodecDownloadConsent(5_000_000)).toBe(false);
    expect(requiresCodecDownloadConsent(5_000_001)).toBe(true);
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
    for (const id of ['heic', 'mp4', 'm4v', 'mov', '3gp', 'webm', 'mkv', 'ogv'] as const)
      expect(capabilities.find((entry) => entry.id === id)?.decode).toBe('lazy');
    for (const id of ['avi', 'wmv', 'flv', 'mts', 'm2ts'] as const)
      expect(capabilities.find((entry) => entry.id === id)?.decode).toBe('unavailable');
  });
});
