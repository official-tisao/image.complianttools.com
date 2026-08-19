import { describe, expect, it } from 'vitest';

import { createRaster, decodeTiff, encodeTiff } from '../src/index.js';

describe('TIFF codec', () => {
  it('round-trips a raster through UTIF', () => {
    const source = createRaster(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 128, 255, 64]));
    const decoded = decodeTiff(encodeTiff(source));
    expect(decoded).toMatchObject({ width: 2, height: 1 });
    expect(decoded.frames[0].data).toEqual(source.frames[0].data);
  });

  it('rejects a TIFF with no image pages', () => {
    expect(() => decodeTiff(new Uint8Array())).toThrow();
  });
});
