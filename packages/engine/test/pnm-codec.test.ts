import { describe, expect, it } from 'vitest';

import { createRaster, decodePnm, encodePpm, rasterEquals } from '../src/index.js';

describe('PNM codec', () => {
  it('round-trips an RGB raster as ASCII PPM', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([255, 0, 20, 255, 10, 128, 255, 255]));
    expect(rasterEquals(decodePnm(encodePpm(image)), image)).toBe(true);
  });

  it('decodes PBM and rejects truncated input', () => {
    expect(decodePnm(new TextEncoder().encode('P1\n2 1\n0 1').buffer).frames[0].data).toEqual(
      new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
    );
    expect(() => decodePnm(new TextEncoder().encode('P3\n2 1\n255\n1 2').buffer)).toThrow(
      'Truncated',
    );
  });
});
