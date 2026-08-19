import { describe, expect, it } from 'vitest';

import { exrDataToRaster } from '../src/codecs/third-party/exr.js';

describe('OpenEXR conversion', () => {
  it('converts linear half-float RGB data to an opaque sRGB raster', () => {
    const image = exrDataToRaster({
      header: {},
      width: 1,
      height: 1,
      data: new Uint16Array([0x3c00, 0x0000, 0x3800, 0x3c00]),
      format: 1023,
      colorSpace: 'srgb-linear',
    });
    expect(image.frames[0].data).toEqual(new Uint8ClampedArray([255, 0, 188, 255]));
  });

  it('expands a single red channel to RGB', () => {
    const image = exrDataToRaster({
      header: {},
      width: 1,
      height: 1,
      data: new Float32Array([0.25]),
      format: 1028,
      colorSpace: '',
    });
    expect(image.frames[0].data).toEqual(new Uint8ClampedArray([137, 137, 137, 255]));
  });
});
