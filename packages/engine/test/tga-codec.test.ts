import { describe, expect, it } from 'vitest';
import { createRaster, decodeTga, encodeTga, rasterEquals } from '../src/index.js';
describe('P2 TGA codec', () => {
  it('round-trips RGBA pixels', () => {
    const image = createRaster(1, 2, Uint8ClampedArray.from([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(rasterEquals(decodeTga(encodeTga(image)), image)).toBe(true);
  });
});
