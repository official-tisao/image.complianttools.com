import { describe, expect, it } from 'vitest';

import { createRaster, decodeWbmp, encodeWbmp, rasterEquals } from '../src/index.js';

describe('WBMP codec', () => {
  it('round-trips a monochrome raster and respects MSB-first bit order', () => {
    const image = createRaster(
      3,
      1,
      new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]),
    );
    expect(rasterEquals(decodeWbmp(encodeWbmp(image)), image)).toBe(true);
  });

  it('rejects non-Type-0, truncated, and hostile inputs', () => {
    expect(() => decodeWbmp(new Uint8Array([1, 0]))).toThrow('Unsupported');
    expect(() => decodeWbmp(new Uint8Array([0, 0, 1, 1]))).toThrow('Truncated');
    expect(() => decodeWbmp(new Uint8Array([0, 0, 0xff, 0xff, 0xff, 0xff, 0x7f, 1]))).toThrow(
      'safe',
    );
  });
});
