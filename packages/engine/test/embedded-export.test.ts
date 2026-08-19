import { describe, expect, it } from 'vitest';

import {
  createRaster,
  emitEmbeddedCArray,
  emitLvglV8CArray,
  emitLvglV9CArray,
  packEmbeddedPixels,
  validateEmbeddedOutputName,
} from '../src/index.js';

const image = createRaster(1, 1, new Uint8ClampedArray([255, 0, 0, 128]));

describe('embedded exporter', () => {
  it('packs RGB565 in both byte orders and optional alpha bytes', () => {
    expect(packEmbeddedPixels(image, { outputName: 'logo', format: 'rgb565' })).toEqual(
      new Uint8Array([0x00, 0xf8]),
    );
    expect(
      packEmbeddedPixels(image, { outputName: 'logo', format: 'rgb565be', alphaByte: true }),
    ).toEqual(new Uint8Array([0xf8, 0x00, 128]));
  });

  it('emits a usable C array and validates its public symbol', () => {
    expect(emitEmbeddedCArray(image, { outputName: 'logo_data', format: 'argb8888' })).toContain(
      'static const uint8_t logo_data[]',
    );
    expect(() => validateEmbeddedOutputName('not-valid!')).toThrow('valid C identifier');
  });

  it('emits an LVGL v9 descriptor using the matching colour format', () => {
    const output = emitLvglV9CArray(image, { outputName: 'logo', format: 'rgb565' });
    expect(output).toContain('#include "lvgl.h"');
    expect(output).toContain('.cf = LV_COLOR_FORMAT_RGB565');
    expect(output).toContain('lv_image_dsc_t logo');
  });

  it('emits a version-specific LVGL v8 descriptor', () => {
    const output = emitLvglV8CArray(image, { outputName: 'logo', format: 'argb8888' });
    expect(output).toContain('lv_img_dsc_t logo');
    expect(output).toContain('LV_IMG_CF_TRUE_COLOR_ALPHA');
  });
});
