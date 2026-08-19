import { describe, expect, it } from 'vitest';

import { decodeHdr } from '../src/index.js';

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

  it('refuses malformed resolution lines and incomplete payloads', () => {
    expect(() => decodeHdr(new TextEncoder().encode('not an HDR'))).toThrow('signature');
    expect(() => decodeHdr(new TextEncoder().encode('#?RADIANCE\n\n+Y 1 +X 1\n'))).toThrow(
      'orientation',
    );
    expect(() => decodeHdr(hdrFixture().subarray(0, -1))).toThrow('truncated');
  });
});
