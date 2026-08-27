import { describe, expect, it } from 'vitest';

import { decodeExr, decodeWithTypedErrors, isEngineError } from '../src/index.js';
import { exrDataToRaster } from '../src/codecs/third-party/exr.js';

function minimalExrFixture(): Uint8Array {
  const bytes: number[] = [];
  const text = (value: string) => bytes.push(...new TextEncoder().encode(value), 0);
  const u32 = (value: number) =>
    bytes.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24);
  const attribute = (name: string, type: string, value: readonly number[]) => {
    text(name);
    text(type);
    u32(value.length);
    bytes.push(...value);
  };
  const box = new Uint8Array(16); // xMin=yMin=xMax=yMax=0 for a 1×1 image
  const channels: number[] = [];
  for (const name of ['B', 'G', 'R', 'A']) {
    channels.push(name.charCodeAt(0), 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0);
  }
  channels.push(0);
  u32(20_000_630);
  bytes.push(2, 0, 0, 0);
  attribute('channels', 'chlist', channels);
  attribute('compression', 'compression', [0]);
  attribute('dataWindow', 'box2i', box);
  attribute('displayWindow', 'box2i', box);
  attribute('lineOrder', 'lineOrder', [0]);
  bytes.push(0); // end of header
  const scanlineOffset = bytes.length + 8;
  u32(scanlineOffset);
  u32(0);
  u32(0); // y coordinate
  u32(8); // four half-float samples
  bytes.push(0x00, 0x38, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x3c); // B=.5 G=0 R=1 A=1
  return Uint8Array.from(bytes);
}

describe('OpenEXR conversion', () => {
  it('converts linear half-float RGB data to an opaque sRGB raster', () => {
    const image = exrDataToRaster({
      header: {},
      width: 1,
      height: 1,
      data: new Uint16Array([0x3c00, 0x0000, 0x3800, 0x3c00]),
      format: 1023,
      colorSpace: 'srgb-linear',
    });
    expect(image.frames[0].data).toEqual(new Uint8ClampedArray([255, 0, 188, 255]));
  });

  it('expands a single red channel to RGB', () => {
    const image = exrDataToRaster({
      header: {},
      width: 1,
      height: 1,
      data: new Float32Array([0.25]),
      format: 1028,
      colorSpace: '',
    });
    expect(image.frames[0].data).toEqual(new Uint8ClampedArray([137, 137, 137, 255]));
  });

  it('decodes a real uncompressed scanline EXR fixture', () => {
    const image = decodeExr(minimalExrFixture());
    expect(image).toMatchObject({ width: 1, height: 1, bitDepth: 8 });
    expect(image.frames[0].data).toEqual(new Uint8ClampedArray([255, 0, 188, 255]));
  });

  it('normalizes malformed EXR input into a typed remediable error', async () => {
    try {
      await decodeWithTypedErrors('exr', () => decodeExr(new Uint8Array()));
      throw new Error('EXR unexpectedly accepted empty input.');
    } catch (error) {
      expect(isEngineError(error)).toBe(true);
      expect(error).toMatchObject({
        kind: 'decode-failed',
        format: 'exr',
        remedy: expect.any(String),
      });
    }
  });
});
