import { describe, expect, it } from 'vitest';

import { applyRawColourTransform, createRaster, demosaicBilinear } from '../src/index.js';

describe('DNG Bayer Stage 2 demosaic', () => {
  it('reconstructs a constant RGGB mosaic and normalizes black/white levels', () => {
    const mosaic = new Uint16Array([100, 200, 200, 300]);
    const image = demosaicBilinear(mosaic, 2, 2, 'RGGB', 100, 300);
    expect(image.frames[0].data).toEqual(
      new Uint8ClampedArray([
        0, 128, 255, 255, 0, 128, 255, 255, 0, 128, 255, 255, 0, 128, 255, 255,
      ]),
    );
  });

  it('rejects malformed mosaics and invalid levels', () => {
    expect(() => demosaicBilinear(new Uint16Array([1]), 2, 1)).toThrow('Invalid');
    expect(() => demosaicBilinear(new Uint16Array([1]), 1, 1, 'RGGB', 2, 2)).toThrow('Invalid');
  });

  it('applies white balance and a colour matrix without mutating the source', () => {
    const source = createRaster(1, 1, new Uint8ClampedArray([100, 100, 100, 255]));
    const developed = applyRawColourTransform(source, [2, 1, 0.5], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(developed.frames[0].data).toEqual(new Uint8ClampedArray([200, 100, 50, 255]));
    expect(source.frames[0].data).toEqual(new Uint8ClampedArray([100, 100, 100, 255]));
  });
});
