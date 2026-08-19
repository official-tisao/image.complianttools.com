import { describe, expect, it } from 'vitest';

import { createRaster, decodeHdr, encodeHdr } from '../src/index.js';

function hdrFixture(): Uint8Array {
  const header = new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n');
  const output = new Uint8Array(header.length + 4);
  output.set(header);
  output.set([128, 64, 0, 129], header.length);
  return output;
}

describe('Radiance HDR codec', () => {
  it('decodes an RGBE pixel into deterministic tone-mapped SDR', () => {
    const data = decodeHdr(hdrFixture()).frames[0].data;
    expect(data).toEqual(new Uint8ClampedArray([128, 85, 0, 255]));
  });

  it('round-trips SDR values through non-RLE RGBE encoding', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([0, 128, 200, 255, 128, 64, 32, 255]));
    const decoded = decodeHdr(encodeHdr(image)).frames[0].data;
    for (let index = 0; index < decoded.length; index += 1)
      expect(Math.abs(decoded[index]! - image.frames[0].data[index]!)).toBeLessThanOrEqual(1);
  });

  it('refuses malformed resolution lines and incomplete payloads', () => {
    expect(() => decodeHdr(new TextEncoder().encode('not an HDR'))).toThrow('signature');
    expect(() => decodeHdr(new TextEncoder().encode('#?RADIANCE\n\n+Y 1 +X 1\n'))).toThrow(
      'orientation',
    );
    expect(() => decodeHdr(hdrFixture().subarray(0, -1))).toThrow('truncated');
  });
});
