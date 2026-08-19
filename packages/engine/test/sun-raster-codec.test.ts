import { describe, expect, it } from 'vitest';

import { decodeSunRaster } from '../src/index.js';

function fixture(): Uint8Array {
  const bytes = new Uint8Array(36);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x59a66a95, false);
  view.setUint32(4, 1, false);
  view.setUint32(8, 1, false);
  view.setUint32(12, 24, false);
  view.setUint32(16, 4, false);
  view.setUint32(20, 1, false);
  bytes.set([3, 2, 1, 0], 32);
  return bytes;
}

describe('Sun Raster codec', () => {
  it('decodes a padded 24-bit RGB scanline', () => {
    expect(decodeSunRaster(fixture()).frames[0].data).toEqual(
      new Uint8ClampedArray([3, 2, 1, 255]),
    );
  });

  it('refuses bad magic and declared-length mismatches', () => {
    expect(() => decodeSunRaster(new Uint8Array(32))).toThrow('Unsupported');
    expect(() => decodeSunRaster(fixture().subarray(0, -1))).toThrow('truncated');
  });
});
