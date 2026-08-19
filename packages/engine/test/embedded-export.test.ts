import { describe, expect, it } from 'vitest';

import {
  createRaster,
  embeddedByteSize,
  emitAdafruitGfxBitmap,
  emitEmbeddedCArray,
  emitEspIdfCArray,
  emitLvglUsageSnippet,
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

  it('reports the exact packed flash footprint before emitting data', () => {
    expect(embeddedByteSize(image, { outputName: 'logo', format: 'rgb565' })).toBe(2);
    expect(embeddedByteSize(image, { outputName: 'logo', format: 'rgb565', alphaByte: true })).toBe(
      3,
    );
  });

  it('packs every generic raw byte layout deterministically', () => {
    expect(packEmbeddedPixels(image, { outputName: 'logo', format: 'rgb332' })).toEqual(
      new Uint8Array([0xe0]),
    );
    expect(packEmbeddedPixels(image, { outputName: 'logo', format: 'bgr888' })).toEqual(
      new Uint8Array([0, 0, 255]),
    );
    expect(packEmbeddedPixels(image, { outputName: 'logo', format: 'rgba8888' })).toEqual(
      new Uint8Array([255, 0, 0, 128]),
    );
    expect(packEmbeddedPixels(image, { outputName: 'logo', format: 'gray8' })).toEqual(
      new Uint8Array([54]),
    );
    expect(packEmbeddedPixels(image, { outputName: 'logo', format: 'mono1' })).toEqual(
      new Uint8Array([0x80]),
    );
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
    expect(output).toContain('LV_IMAGE_DECLARE(logo);');
    expect(output).toContain('lv_image_set_src(image, &logo);');
  });

  it('emits a version-specific LVGL v8 descriptor', () => {
    const output = emitLvglV8CArray(image, { outputName: 'logo', format: 'argb8888' });
    expect(output).toContain('lv_img_dsc_t logo');
    expect(output).toContain('LV_IMG_CF_TRUE_COLOR_ALPHA');
    expect(output).toContain('LV_IMG_DECLARE(logo);');
    expect(output).toContain('lv_img_set_src(image, &logo);');
  });

  it('emits version-specific LVGL usage snippets with a validated public symbol', () => {
    expect(emitLvglUsageSnippet('logo', 8)).toContain('LV_IMG_DECLARE(logo)');
    expect(emitLvglUsageSnippet('logo', 9)).toContain('LV_IMAGE_DECLARE(logo)');
    expect(() => emitLvglUsageSnippet('not valid', 9)).toThrow('valid C identifier');
  });

  it('emits a 1-bit Adafruit GFX PROGMEM bitmap', () => {
    const output = emitAdafruitGfxBitmap(image, 'logo');
    expect(output).toContain('#include <avr/pgmspace.h>');
    expect(output).toContain('logo[] PROGMEM');
    expect(output).toContain('0x80');
  });

  it('emits an RGB565 word array for ESP-IDF and TFT_eSPI', () => {
    expect(emitEspIdfCArray(image, { outputName: 'logo', format: 'rgb565' })).toContain(
      'uint16_t logo[] = { 0xf800 };',
    );
  });
});
