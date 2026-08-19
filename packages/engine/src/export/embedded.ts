import type { RasterImage } from '../types.js';

export type EmbeddedPixelFormat =
  | 'rgb332'
  | 'rgb565'
  | 'rgb565be'
  | 'rgb888'
  | 'bgr888'
  | 'argb8888'
  | 'rgba8888'
  | 'gray8'
  | 'mono1';

export interface EmbeddedExportOptions {
  readonly outputName: string;
  readonly format: EmbeddedPixelFormat;
  readonly alphaByte?: boolean;
  readonly chromaKey?: readonly [red: number, green: number, blue: number];
  readonly bigEndian?: boolean;
  readonly storage?: 'const' | 'static' | 'static-const';
  readonly lineWidth?: number;
  readonly dithering?: 'none' | 'ordered';
}

export function validateEmbeddedOutputName(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new Error('Output name must be a valid C identifier.');
  }
  return value;
}

function rgb565(red: number, green: number, blue: number): number {
  return ((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3);
}

function luminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

const bayer4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

function ditherChannel(value: number, pixel: number, width: number, enabled: boolean): number {
  if (!enabled) return value;
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  return Math.max(0, Math.min(255, value + (bayer4[y % 4]![x % 4]! - 7.5) * 2));
}

/** Packs the first frame for LVGL or a generic embedded target without a runtime dependency. */
export function packEmbeddedPixels(image: RasterImage, options: EmbeddedExportOptions): Uint8Array {
  validateEmbeddedOutputName(options.outputName);
  if (options.format === 'mono1' && options.alphaByte) {
    throw new Error('Mono1 output cannot append an alpha byte.');
  }
  const rgba = image.frames[0].data;
  if (options.format === 'mono1') {
    const rowBytes = Math.ceil(image.width / 8);
    const output = new Uint8Array(rowBytes * image.height);
    for (let y = 0; y < image.height; y += 1)
      for (let x = 0; x < image.width; x += 1) {
        const offset = (y * image.width + x) * 4;
        if (luminance(rgba[offset]!, rgba[offset + 1]!, rgba[offset + 2]!) < 128)
          output[y * rowBytes + Math.floor(x / 8)]! |= 0x80 >> (x % 8);
      }
    return output;
  }
  const bytesPerPixel: Record<Exclude<EmbeddedPixelFormat, 'mono1'>, number> = {
    rgb332: 1,
    rgb565: 2,
    rgb565be: 2,
    rgb888: 3,
    bgr888: 3,
    argb8888: 4,
    rgba8888: 4,
    gray8: 1,
  };
  const output = new Uint8Array(
    image.width * image.height * (bytesPerPixel[options.format] + (options.alphaByte ? 1 : 0)),
  );
  let target = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const [sourceRed, sourceGreen, sourceBlue, alpha] = rgba.subarray(offset, offset + 4);
    const pixel = offset / 4;
    const red = ditherChannel(sourceRed!, pixel, image.width, options.dithering === 'ordered');
    const green = ditherChannel(sourceGreen!, pixel, image.width, options.dithering === 'ordered');
    const blue = ditherChannel(sourceBlue!, pixel, image.width, options.dithering === 'ordered');
    const transparent = options.chromaKey?.every(
      (value, index) => value === [sourceRed, sourceGreen, sourceBlue][index],
    );
    if (options.format === 'rgb332') {
      output[target++] = (red & 0xe0) | ((green >> 3) & 0x1c) | (blue >> 6);
    } else if (options.format === 'rgb565' || options.format === 'rgb565be') {
      const value = rgb565(red, green, blue);
      const bigEndian = options.bigEndian || options.format === 'rgb565be';
      output[target++] = bigEndian ? value >> 8 : value & 255;
      output[target++] = bigEndian ? value & 255 : value >> 8;
    } else if (options.format === 'rgb888') {
      output.set([red, green, blue], target);
      target += 3;
    } else if (options.format === 'bgr888') {
      output.set([blue, green, red], target);
      target += 3;
    } else if (options.format === 'gray8') {
      output[target++] = Math.round(luminance(red, green, blue));
    } else if (options.format === 'argb8888') {
      output.set([transparent ? 0 : alpha!, red, green, blue], target);
      target += 4;
    } else {
      output.set([red, green, blue, transparent ? 0 : alpha!], target);
      target += 4;
    }
    if (options.alphaByte) output[target++] = transparent ? 0 : alpha!;
  }
  return output;
}

/** Emits a `uint16_t` RGB565 map suitable for ESP-IDF and TFT_eSPI drawing APIs. */
export function emitEspIdfCArray(image: RasterImage, options: EmbeddedExportOptions): string {
  if (options.format !== 'rgb565' && options.format !== 'rgb565be') {
    throw new Error('ESP-IDF/TFT_eSPI output supports RGB565 or RGB565BE only.');
  }
  const name = validateEmbeddedOutputName(options.outputName);
  const storage =
    options.storage === 'static'
      ? 'static'
      : options.storage === 'const'
        ? 'const'
        : 'static const';
  const rgba = image.frames[0].data;
  const words = Array.from({ length: image.width * image.height }, (_, index) => {
    const offset = index * 4;
    return `0x${rgb565(rgba[offset]!, rgba[offset + 1]!, rgba[offset + 2]!)
      .toString(16)
      .padStart(4, '0')}`;
  });
  return `#include <stdint.h>\n/* ${image.width}x${image.height}, RGB565 */\n${storage} uint16_t ${name}[] = { ${words.join(', ')} };\n`;
}

/** Returns the exact local flash footprint of the packed image data. */
export function embeddedByteSize(image: RasterImage, options: EmbeddedExportOptions): number {
  return packEmbeddedPixels(image, options).byteLength;
}

export function emitEmbeddedCArray(image: RasterImage, options: EmbeddedExportOptions): string {
  const bytes = packEmbeddedPixels(image, options);
  const width = Math.max(1, options.lineWidth ?? 12);
  const rows = Array.from({ length: Math.ceil(bytes.length / width) }, (_, row) => {
    const values = bytes.slice(row * width, row * width + width);
    return `  ${[...values].map((value) => `0x${value.toString(16).padStart(2, '0')}`).join(', ')},`;
  });
  const storage =
    options.storage === 'static'
      ? 'static'
      : options.storage === 'const'
        ? 'const'
        : 'static const';
  return [
    `/* ${image.width}x${image.height}, ${options.format} */`,
    `#include <stdint.h>`,
    `${storage} uint8_t ${options.outputName}[] = {`,
    ...rows,
    '};',
    '',
  ].join('\n');
}

/** Returns the declaration and widget binding needed by an LVGL v8 or v9 caller. */
export function emitLvglUsageSnippet(outputName: string, version: 8 | 9): string {
  const name = validateEmbeddedOutputName(outputName);
  return version === 9
    ? `/* In a separate translation unit */\nLV_IMAGE_DECLARE(${name});\nlv_image_set_src(image, &${name});\n`
    : `/* In a separate translation unit */\nLV_IMG_DECLARE(${name});\nlv_img_set_src(image, &${name});\n`;
}

/** Emits an LVGL v9 image descriptor and matching map for the supported true-colour formats. */
export function emitLvglV9CArray(image: RasterImage, options: EmbeddedExportOptions): string {
  const colourFormat: Partial<Record<EmbeddedPixelFormat, string>> = {
    rgb565: 'LV_COLOR_FORMAT_RGB565',
    rgb565be: 'LV_COLOR_FORMAT_RGB565',
    rgb888: 'LV_COLOR_FORMAT_RGB888',
    argb8888: 'LV_COLOR_FORMAT_ARGB8888',
  };
  if (!colourFormat[options.format]) {
    throw new Error(`LVGL v9 does not support ${options.format} in this exporter.`);
  }
  const mapName = `${validateEmbeddedOutputName(options.outputName)}_map`;
  const array = emitEmbeddedCArray(image, { ...options, outputName: mapName });
  const descriptorStorage =
    options.storage === 'static'
      ? 'static'
      : options.storage === 'const'
        ? 'const'
        : 'static const';
  return `${array.replace('#include <stdint.h>', '#include <stdint.h>\n#include "lvgl.h"')}${descriptorStorage} lv_image_dsc_t ${options.outputName} = {
  .header = { .cf = ${colourFormat[options.format]}, .w = ${image.width}, .h = ${image.height} },
  .data_size = sizeof(${mapName}),
  .data = ${mapName},
};
}${emitLvglUsageSnippet(options.outputName, 9)}`;
}

/** Emits an LVGL v8 descriptor and matching map for supported true-colour formats. */
export function emitLvglV8CArray(image: RasterImage, options: EmbeddedExportOptions): string {
  const colourFormat: Partial<Record<EmbeddedPixelFormat, string>> = {
    rgb565: 'LV_IMG_CF_TRUE_COLOR',
    rgb565be: 'LV_IMG_CF_TRUE_COLOR',
    rgb888: 'LV_IMG_CF_TRUE_COLOR',
    argb8888: 'LV_IMG_CF_TRUE_COLOR_ALPHA',
  };
  if (!colourFormat[options.format]) {
    throw new Error(`LVGL v8 does not support ${options.format} in this exporter.`);
  }
  const mapName = `${validateEmbeddedOutputName(options.outputName)}_map`;
  const array = emitEmbeddedCArray(image, { ...options, outputName: mapName });
  const descriptorStorage =
    options.storage === 'static'
      ? 'static'
      : options.storage === 'const'
        ? 'const'
        : 'static const';
  return `${array.replace('#include <stdint.h>', '#include <stdint.h>\n#include "lvgl.h"')}${descriptorStorage} lv_img_dsc_t ${options.outputName} = {
  .header = { .always_zero = 0, .w = ${image.width}, .h = ${image.height}, .cf = ${colourFormat[options.format]} },
  .data_size = sizeof(${mapName}),
  .data = ${mapName},
};
}${emitLvglUsageSnippet(options.outputName, 8)}`;
}

/** Emits a 1-bit MSB-first Adafruit GFX bitmap in a PROGMEM C array. */
export function emitAdafruitGfxBitmap(image: RasterImage, outputName: string): string {
  const name = validateEmbeddedOutputName(outputName);
  const rowBytes = Math.ceil(image.width / 8);
  const bytes = new Uint8Array(rowBytes * image.height);
  const pixels = image.frames[0].data;
  for (let y = 0; y < image.height; y += 1)
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (luminance(pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!) < 128)
        bytes[y * rowBytes + Math.floor(x / 8)]! |= 0x80 >> (x % 8);
    }
  return `#include <avr/pgmspace.h>\nconst uint8_t ${name}[] PROGMEM = { ${[...bytes].map((value) => `0x${value.toString(16).padStart(2, '0')}`).join(', ')} };\n`;
}
