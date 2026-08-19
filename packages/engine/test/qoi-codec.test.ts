import { describe, expect, it } from 'vitest';
import { createRaster, decodeQoi, encodeQoi, rasterEquals } from '../src/index.js';
describe('P2 QOI codec', () => {
  it('round-trips RGBA pixels and repeated runs', () => {
    const image = createRaster(
      3,
      1,
      Uint8ClampedArray.from([1, 2, 3, 4, 1, 2, 3, 4, 9, 8, 7, 255]),
    );
    expect(rasterEquals(decodeQoi(encodeQoi(image)), image)).toBe(true);
  });
});
