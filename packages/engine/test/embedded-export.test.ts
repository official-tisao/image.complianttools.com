import { describe, expect, it } from 'vitest';

import {
  createRaster,
  embeddedByteSize,
  emitAdafruitGfxBitmap,
  emitEmbeddedCArray,
  emitEspIdfCArray,
  emitLvglUsageSnippet,
  emitLvglV8CArray,
  emitLvglV8RawCArray,
  emitLvglV9CArray,
  packLvglV8Pixels,
  packLvglV9Pixels,
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

  it('applies deterministic ordered dithering only when explicitly requested', () => {
    const middleGray = createRaster(1, 1, new Uint8ClampedArray([127, 127, 127, 255]));
    expect(packEmbeddedPixels(middleGray, { outputName: 'logo', format: 'rgb565' })).toEqual(
      new Uint8Array([0xef, 0x7b]),
    );
    expect(
      packEmbeddedPixels(middleGray, {
        outputName: 'logo',
        format: 'rgb565',
        dithering: 'ordered',
      }),
    ).toEqual(new Uint8Array([0x8e, 0x73]));
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
    expect(output).not.toContain('\n}\/* In a separate translation unit');
  });

  it('packs all five LVGL v9 formats in LVGL memory order', () => {
    expect(packLvglV9Pixels(image, 'rgb565')).toEqual(new Uint8Array([0x00, 0xf8]));
    expect(packLvglV9Pixels(image, 'rgb565a8')).toEqual(new Uint8Array([0x00, 0xf8, 128]));
    expect(packLvglV9Pixels(image, 'rgb888')).toEqual(new Uint8Array([0, 0, 255]));
    expect(packLvglV9Pixels(image, 'xrgb8888')).toEqual(new Uint8Array([0, 0, 255, 255]));
    expect(packLvglV9Pixels(image, 'argb8888')).toEqual(new Uint8Array([0, 0, 255, 128]));
    for (const [format, constant] of [
      ['rgb565a8', 'LV_COLOR_FORMAT_RGB565A8'],
      ['rgb888', 'LV_COLOR_FORMAT_RGB888'],
      ['xrgb8888', 'LV_COLOR_FORMAT_XRGB8888'],
      ['argb8888', 'LV_COLOR_FORMAT_ARGB8888'],
    ] as const)
      expect(emitLvglV9CArray(image, { outputName: 'logo', format })).toContain(
        `.cf = ${constant}`,
      );
  });

  it('emits a version-specific LVGL v8 descriptor', () => {
    const output = emitLvglV8CArray(image, { outputName: 'logo', format: 'argb8888' });
    expect(output).toContain('lv_img_dsc_t logo');
    expect(output).toContain('LV_IMG_CF_TRUE_COLOR_ALPHA');
    expect(output).toContain('LV_IMG_DECLARE(logo);');
    expect(output).toContain('lv_img_set_src(image, &logo);');
    expect(output).not.toContain('\n}\/* In a separate translation unit');
  });

  it('packs LVGL v8 alpha formats and RGB565A8 deterministically', () => {
    const opacityRamp = createRaster(
      4,
      1,
      new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 85, 0, 0, 0, 170, 0, 0, 0, 255]),
    );
    expect(packLvglV8Pixels(opacityRamp, 'alpha2')).toEqual(new Uint8Array([0x1b]));
    expect(packLvglV8Pixels(image, 'rgb565a8')).toEqual(new Uint8Array([0x00, 0xf8, 128]));
    for (const [format, constant] of [
      ['alpha1', 'LV_IMG_CF_ALPHA_1BIT'],
      ['alpha2', 'LV_IMG_CF_ALPHA_2BIT'],
      ['alpha4', 'LV_IMG_CF_ALPHA_4BIT'],
      ['alpha8', 'LV_IMG_CF_ALPHA_8BIT'],
      ['rgb565a8', 'LV_IMG_CF_RGB565A8'],
    ] as const)
      expect(emitLvglV8CArray(image, { outputName: 'logo', format })).toContain(
        `.cf = ${constant}`,
      );
  });

  it('writes LVGL v8 indexed palettes as BGRA followed by packed indices', () => {
    const twoColours = createRaster(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]));
    expect(packLvglV8Pixels(twoColours, 'indexed1')).toEqual(
      new Uint8Array([
        0,
        0,
        255,
        255, // red BGRA palette entry
        255,
        0,
        0,
        255, // blue BGRA palette entry
        0x40, // indexes 0, 1, padded MSB-first
      ]),
    );
    for (const [format, constant] of [
      ['indexed1', 'LV_IMG_CF_INDEXED_1BIT'],
      ['indexed2', 'LV_IMG_CF_INDEXED_2BIT'],
      ['indexed4', 'LV_IMG_CF_INDEXED_4BIT'],
      ['indexed8', 'LV_IMG_CF_INDEXED_8BIT'],
    ] as const)
      expect(emitLvglV8CArray(twoColours, { outputName: 'logo', format })).toContain(
        `.cf = ${constant}`,
      );
  });

  it('preserves original encoded bytes for LVGL v8 raw decoder formats', () => {
    const encoded = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    for (const [format, constant] of [
      ['raw', 'LV_IMG_CF_RAW'],
      ['raw-alpha', 'LV_IMG_CF_RAW_ALPHA'],
      ['raw-chroma', 'LV_IMG_CF_RAW_CHROMA_KEYED'],
    ] as const) {
      const output = emitLvglV8RawCArray(encoded, 1, 1, 'logo', format);
      expect(output).toContain(`.cf = ${constant}`);
      expect(output).toContain('0x89, 0x50, 0x4e, 0x47');
      expect(output).toContain('.data_size = sizeof(logo_map)');
    }
    expect(() => emitLvglV8RawCArray(new Uint8Array(), 1, 1, 'logo', 'raw')).toThrow('non-empty');
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
