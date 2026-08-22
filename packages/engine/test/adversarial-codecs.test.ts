import { describe, expect, it } from 'vitest';

import {
  SVG_EXTERNAL_REFERENCE_MESSAGE,
  assertSafeSvg,
  decodeBmp,
  decodeCur,
  decodeDds,
  decodeFits,
  decodeGif,
  decodeHdr,
  decodeIco,
  decodePcx,
  decodePfm,
  decodePnm,
  decodePngToRaster,
  decodeQoi,
  decodeSgi,
  decodeSunRaster,
  decodeTga,
  decodeTiff,
  decodeWbmp,
  decodeWithTypedErrors,
  decodeXbm,
  decodeXpm,
  detectImageFormat,
  isEngineError,
  readExifIfd0,
} from '../src/index.js';
import type { FormatId, RasterImage } from '../src/types.js';

const decoders: ReadonlyArray<readonly [FormatId, (input: Uint8Array) => RasterImage]> = [
  ['bmp', decodeBmp],
  ['cur', decodeCur],
  ['dds', decodeDds],
  ['fits', decodeFits],
  ['gif', decodeGif],
  ['hdr', decodeHdr],
  ['ico', decodeIco],
  ['pcx', decodePcx],
  ['pfm', decodePfm],
  ['pnm', decodePnm],
  ['qoi', decodeQoi],
  ['sgi', decodeSgi],
  ['sun-raster', decodeSunRaster],
  ['tga', decodeTga],
  ['tiff', decodeTiff],
  ['wbmp', decodeWbmp],
  ['xbm', decodeXbm],
  ['xbm', decodeXpm],
];

function qoiHeader(width: number, height: number): number[] {
  return [
    113,
    111,
    105,
    102,
    width >>> 24,
    (width >>> 16) & 255,
    (width >>> 8) & 255,
    width & 255,
    height >>> 24,
    (height >>> 16) & 255,
    (height >>> 8) & 255,
    height & 255,
    4,
    0,
  ];
}

describe('Phase 2 adversarial codec corpus', () => {
  const within = async <T>(operation: Promise<T>, milliseconds = 1_000): Promise<T> =>
    Promise.race([
      operation,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Adversarial decode exceeded ${milliseconds} ms.`)),
          milliseconds,
        ),
      ),
    ]);

  it('rejects zero-byte and wrong-magic inputs with typed remedies without hanging', async () => {
    for (const [format, decode] of decoders) {
      for (const input of [new Uint8Array(), new Uint8Array([0xde, 0xad, 0xbe, 0xef])]) {
        try {
          await decodeWithTypedErrors(format, () => decode(input));
          throw new Error(`${format} unexpectedly accepted malformed input.`);
        } catch (error) {
          expect(isEngineError(error), `${format} must return an EngineError`).toBe(true);
          expect((error as { remedy: string }).remedy.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('identifies content bytes independently of a mismatched filename extension', () => {
    const qoiNamedAsJpeg = new Uint8Array([
      ...qoiHeader(1, 1),
      0xfe,
      10,
      20,
      30,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
    ]);
    expect(detectImageFormat(qoiNamedAsJpeg)).toBe('qoi');
  });

  it('rejects a QOI file declaring a hostile pixel allocation before allocating pixels', () => {
    const hostile = new Uint8Array(22);
    hostile.set(qoiHeader(0xffffffff, 0xffffffff));
    expect(() => decodeQoi(hostile)).toThrow('safe decode limit');
  });

  it('rejects 4 GB PNG dimensions before initializing the decoder', async () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
    const view = new DataView(png.buffer);
    view.setUint32(16, 0xffff_ffff);
    view.setUint32(20, 1);
    await expect(
      within(decodeWithTypedErrors('png', () => decodePngToRaster(png.buffer))),
    ).rejects.toMatchObject({
      kind: 'decode-failed',
      format: 'png',
      remedy: expect.any(String),
    });
  });

  it('rejects a hostile GIF canvas before frame decompression', async () => {
    const gif = new Uint8Array([
      ...new TextEncoder().encode('GIF89a'),
      0xff,
      0xff,
      0xff,
      0xff,
      0x80,
      0,
      0,
      0,
      0,
      0,
      255,
      255,
      255,
      0x3b,
    ]);
    await expect(within(decodeWithTypedErrors('gif', () => decodeGif(gif)))).rejects.toMatchObject({
      kind: 'decode-failed',
      format: 'gif',
      remedy: expect.any(String),
    });
  });

  it('rejects truncated QOI multi-byte pixel opcodes instead of coercing missing bytes', () => {
    // Each fixture keeps the container's 22-byte minimum, then reaches an incomplete opcode.
    const truncatedRgb = new Uint8Array([
      ...qoiHeader(7, 1),
      0xc0,
      0xc0,
      0xc0,
      0xc0,
      0xc0,
      0xc0,
      0xfe,
      12,
    ]);
    const truncatedRgba = new Uint8Array([
      ...qoiHeader(6, 1),
      0xc0,
      0xc0,
      0xc0,
      0xc0,
      0xc0,
      0xff,
      12,
      34,
    ]);
    const truncatedLuma = new Uint8Array([
      ...qoiHeader(8, 1),
      0xc0,
      0xc0,
      0xc0,
      0xc0,
      0xc0,
      0xc0,
      0xc0,
      0x80,
    ]);
    for (const input of [truncatedRgb, truncatedRgba, truncatedLuma]) {
      expect(() => decodeQoi(input)).toThrow('Truncated QOI image.');
    }
  });

  it('handles self-generated 1×1 and 30000×1 QOI fixtures within the decode limit', () => {
    const tiny = new Uint8Array([...qoiHeader(1, 1), 0xfe, 10, 20, 30, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(decodeQoi(tiny).frames[0].data).toEqual(new Uint8ClampedArray([10, 20, 30, 255]));

    // QOI run packets encode up to 62 pixels; this fixture is only ~500 bytes but expands safely.
    const runs = Array.from(
      { length: Math.ceil(30_000 / 62) },
      (_, index) => 0xc0 | (Math.min(62, 30_000 - index * 62) - 1),
    );
    const wide = new Uint8Array([...qoiHeader(30_000, 1), ...runs, 0, 0, 0, 0, 0, 0, 0, 1]);
    const decoded = decodeQoi(wide);
    expect([decoded.width, decoded.height, decoded.frames[0].data.length]).toEqual([
      30_000, 1, 120_000,
    ]);
  });

  it('refuses SVG external references with a typed error before any renderer can request them', async () => {
    await expect(
      decodeWithTypedErrors('svg', () =>
        assertSafeSvg(
          '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/x.png"/></svg>',
        ),
      ),
    ).rejects.toMatchObject({
      kind: 'decode-failed',
      detail: SVG_EXTERNAL_REFERENCE_MESSAGE,
      remedy: expect.any(String),
    });
  });

  it('rejects a nested active SVG document and oversized EXIF IFD tables before traversal', async () => {
    await expect(
      decodeWithTypedErrors('svg', () =>
        assertSafeSvg(
          '<svg><foreignObject><iframe src="https://example.test/evil" /></foreignObject></svg>',
        ),
      ),
    ).rejects.toMatchObject({ kind: 'decode-failed', remedy: expect.any(String) });

    const exifBomb = new Uint8Array(16);
    const view = new DataView(exifBomb.buffer);
    exifBomb.set([0x49, 0x49, 42, 0]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 12_000, true);
    await expect(decodeWithTypedErrors('jpeg', () => readExifIfd0(exifBomb))).rejects.toMatchObject(
      { kind: 'decode-failed', remedy: expect.any(String) },
    );
  });

  it('rejects an EXIF field whose declared value offset lies outside the local file', async () => {
    const exif = new Uint8Array(26);
    const view = new DataView(exif.buffer);
    exif.set([0x49, 0x49, 42, 0]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 0x8298, true); // Copyright
    view.setUint16(12, 2, true); // ASCII
    view.setUint32(14, 20, true);
    view.setUint32(18, 0xfffffff0, true);
    await expect(decodeWithTypedErrors('jpeg', () => readExifIfd0(exif))).rejects.toMatchObject({
      kind: 'decode-failed',
      detail: 'EXIF copyright offset is outside the file.',
      remedy: expect.any(String),
    });
  });
});
