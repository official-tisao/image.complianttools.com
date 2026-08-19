import { describe, expect, it } from 'vitest';

import { createRaster, decodeBmp, encodeBmp, rasterEquals } from '../src/index.js';

describe('P2 BMP codec', () => {
  it('round-trips an RGBA raster', () => {
    const image = createRaster(2, 1, Uint8ClampedArray.from([255, 0, 4, 128, 3, 5, 7, 255]));
    expect(rasterEquals(decodeBmp(encodeBmp(image)), image)).toBe(true);
  });

  it('rejects invalid headers', () => {
    expect(() => decodeBmp(new Uint8Array(54))).toThrow('Invalid BMP');
  });
});
