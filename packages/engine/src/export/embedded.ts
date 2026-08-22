import type { RasterImage } from '../types.js';

export type EmbeddedPixelFormat =
  | 'alpha1'
  | 'alpha2'
  | 'alpha4'
  | 'alpha8'
  | 'indexed1'
  | 'indexed2'
  | 'indexed4'
  | 'indexed8'
  | 'rgb332'
  | 'rgb565'
  | 'rgb565be'
  | 'rgb565a8'
  | 'rgb888'
  | 'bgr888'
  | 'argb8888'
  | 'rgba8888'
  | 'xrgb8888'
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

type AlphaPixelFormat = 'alpha1' | 'alpha2' | 'alpha4' | 'alpha8';

function isAlphaPixelFormat(format: EmbeddedPixelFormat): format is AlphaPixelFormat {
  return format === 'alpha1' || format === 'alpha2' || format === 'alpha4' || format === 'alpha8';
}

type IndexedPixelFormat = 'indexed1' | 'indexed2' | 'indexed4' | 'indexed8';

function isIndexedPixelFormat(format: EmbeddedPixelFormat): format is IndexedPixelFormat {
  return (
    format === 'indexed1' || format === 'indexed2' || format === 'indexed4' || format === 'indexed8'
  );
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
  if (isAlphaPixelFormat(options.format)) {
    const bits = Number(options.format.slice(5));
    const rowBytes = Math.ceil((image.width * bits) / 8);
    const output = new Uint8Array(rowBytes * image.height);
    const levels = (1 << bits) - 1;
    for (let y = 0; y < image.height; y += 1)
      for (let x = 0; x < image.width; x += 1) {
        const alpha = rgba[(y * image.width + x) * 4 + 3]!;
        const quantized = Math.round((alpha / 255) * levels);
        const bit = x * bits;
        output[y * rowBytes + Math.floor(bit / 8)]! |= quantized << (8 - bits - (bit % 8));
      }
    return output;
  }
  if (isIndexedPixelFormat(options.format)) return packLvglV8Indexed(image, options.format);
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
  const bytesPerPixel: Record<
    Exclude<
      EmbeddedPixelFormat,
      | 'alpha1'
      | 'alpha2'
      | 'alpha4'
      | 'alpha8'
      | 'indexed1'
      | 'indexed2'
      | 'indexed4'
      | 'indexed8'
      | 'mono1'
    >,
    number
  > = {
    rgb332: 1,
    rgb565: 2,
    rgb565be: 2,
    rgb565a8: 3,
    rgb888: 3,
    bgr888: 3,
    argb8888: 4,
    rgba8888: 4,
    xrgb8888: 4,
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
    } else if (
      options.format === 'rgb565' ||
      options.format === 'rgb565be' ||
      options.format === 'rgb565a8'
    ) {
      const value = rgb565(red, green, blue);
      const bigEndian = options.bigEndian || options.format === 'rgb565be';
      output[target++] = bigEndian ? value >> 8 : value & 255;
      output[target++] = bigEndian ? value & 255 : value >> 8;
      if (options.format === 'rgb565a8') output[target++] = transparent ? 0 : alpha!;
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
    } else if (options.format === 'xrgb8888') {
      output.set([255, red, green, blue], target);
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
  return emitByteCArray(image, options, bytes);
}

function emitByteCArray(
  image: RasterImage,
  options: EmbeddedExportOptions,
  bytes: Uint8Array,
): string {
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

/** Packs the exact byte layouts consumed by LVGL v9's five project formats. */
export function packLvglV9Pixels(image: RasterImage, format: EmbeddedPixelFormat): Uint8Array {
  const rgba = image.frames[0].data;
  if (format === 'rgb565' || format === 'rgb565be')
    return packEmbeddedPixels(image, { outputName: 'lvgl_image', format });
  if (format === 'rgb565a8') {
    const pixels = image.width * image.height;
    const output = new Uint8Array(pixels * 3);
    for (let index = 0; index < pixels; index += 1) {
      const source = index * 4;
      const value = rgb565(rgba[source]!, rgba[source + 1]!, rgba[source + 2]!);
      output[index * 2] = value & 255;
      output[index * 2 + 1] = value >> 8;
      output[pixels * 2 + index] = rgba[source + 3]!;
    }
    return output;
  }
  const bytesPerPixel = format === 'rgb888' ? 3 : 4;
  if (format !== 'rgb888' && format !== 'xrgb8888' && format !== 'argb8888')
    throw new Error(`LVGL v9 does not support ${format} in this exporter.`);
  const output = new Uint8Array(image.width * image.height * bytesPerPixel);
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    output[target++] = rgba[source + 2]!;
    output[target++] = rgba[source + 1]!;
    output[target++] = rgba[source]!;
    if (bytesPerPixel === 4) output[target++] = format === 'argb8888' ? rgba[source + 3]! : 255;
  }
  return output;
}

/** Packs LVGL v8 alpha-only, RGB565A8, and explicit 32-bit true-colour-alpha layouts. */
export function packLvglV8Pixels(image: RasterImage, format: EmbeddedPixelFormat): Uint8Array {
  if (isAlphaPixelFormat(format))
    return packEmbeddedPixels(image, { outputName: 'lvgl_image', format });
  if (isIndexedPixelFormat(format)) return packLvglV8Indexed(image, format);
  if (format === 'rgb565a8') return packLvglV9Pixels(image, format);
  if (format === 'argb8888') {
    const rgba = image.frames[0].data;
    const output = new Uint8Array(rgba.length);
    for (let source = 0; source < rgba.length; source += 4)
      output.set([rgba[source + 2]!, rgba[source + 1]!, rgba[source]!, rgba[source + 3]!], source);
    return output;
  }
  if (format === 'rgb565' || format === 'rgb565be' || format === 'rgb888')
    return packEmbeddedPixels(image, { outputName: 'lvgl_image', format });
  throw new Error(`LVGL v8 does not support ${format} in this exporter.`);
}

function packLvglV8Indexed(image: RasterImage, format: IndexedPixelFormat): Uint8Array {
  const bits = Number(format.slice(7));
  const paletteSize = 1 << bits;
  const rgba = image.frames[0].data;
  const unique = new Map<string, readonly [number, number, number, number]>();
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const colour = [
      rgba[offset]!,
      rgba[offset + 1]!,
      rgba[offset + 2]!,
      rgba[offset + 3]!,
    ] as const;
    unique.set(colour.join(','), colour);
  }
  const colours = [...unique.values()];
  const palette = Array.from({ length: Math.min(paletteSize, colours.length) }, (_, index) =>
    colours.length <= paletteSize
      ? colours[index]!
      : colours[Math.floor((index * colours.length) / paletteSize)]!,
  );
  while (palette.length < paletteSize) palette.push([0, 0, 0, 0]);
  const rowBytes = Math.ceil((image.width * bits) / 8);
  const output = new Uint8Array(paletteSize * 4 + rowBytes * image.height);
  for (let index = 0; index < palette.length; index += 1) {
    const [red, green, blue, alpha] = palette[index]!;
    output.set([blue, green, red, alpha], index * 4);
  }
  const indexStart = paletteSize * 4;
  for (let y = 0; y < image.height; y += 1)
    for (let x = 0; x < image.width; x += 1) {
      const source = (y * image.width + x) * 4;
      let selected = 0;
      let distance = Number.POSITIVE_INFINITY;
      for (let candidate = 0; candidate < palette.length; candidate += 1) {
        const colour = palette[candidate]!;
        const next =
          (rgba[source]! - colour[0]) ** 2 +
          (rgba[source + 1]! - colour[1]) ** 2 +
          (rgba[source + 2]! - colour[2]) ** 2 +
          (rgba[source + 3]! - colour[3]) ** 2;
        if (next < distance) {
          distance = next;
          selected = candidate;
        }
      }
      const bit = x * bits;
      output[indexStart + y * rowBytes + Math.floor(bit / 8)]! |=
        selected << (8 - bits - (bit % 8));
    }
  return output;
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
    rgb565a8: 'LV_COLOR_FORMAT_RGB565A8',
    rgb888: 'LV_COLOR_FORMAT_RGB888',
    xrgb8888: 'LV_COLOR_FORMAT_XRGB8888',
    argb8888: 'LV_COLOR_FORMAT_ARGB8888',
  };
  if (!colourFormat[options.format]) {
    throw new Error(`LVGL v9 does not support ${options.format} in this exporter.`);
  }
  const mapName = `${validateEmbeddedOutputName(options.outputName)}_map`;
  const mapOptions = { ...options, outputName: mapName };
  const array = emitByteCArray(image, mapOptions, packLvglV9Pixels(image, options.format));
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
${emitLvglUsageSnippet(options.outputName, 9)}`;
}

/** Emits an LVGL v8 descriptor and matching map for supported true-colour formats. */
export function emitLvglV8CArray(image: RasterImage, options: EmbeddedExportOptions): string {
  const colourFormat: Partial<Record<EmbeddedPixelFormat, string>> = {
    alpha1: 'LV_IMG_CF_ALPHA_1BIT',
    alpha2: 'LV_IMG_CF_ALPHA_2BIT',
    alpha4: 'LV_IMG_CF_ALPHA_4BIT',
    alpha8: 'LV_IMG_CF_ALPHA_8BIT',
    indexed1: 'LV_IMG_CF_INDEXED_1BIT',
    indexed2: 'LV_IMG_CF_INDEXED_2BIT',
    indexed4: 'LV_IMG_CF_INDEXED_4BIT',
    indexed8: 'LV_IMG_CF_INDEXED_8BIT',
    rgb565: 'LV_IMG_CF_TRUE_COLOR',
    rgb565be: 'LV_IMG_CF_TRUE_COLOR',
    rgb888: 'LV_IMG_CF_TRUE_COLOR',
    argb8888: 'LV_IMG_CF_TRUE_COLOR_ALPHA',
    rgb565a8: 'LV_IMG_CF_RGB565A8',
  };
  if (!colourFormat[options.format]) {
    throw new Error(`LVGL v8 does not support ${options.format} in this exporter.`);
  }
  const mapName = `${validateEmbeddedOutputName(options.outputName)}_map`;
  const mapOptions = { ...options, outputName: mapName };
  const array = emitByteCArray(image, mapOptions, packLvglV8Pixels(image, options.format));
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
${emitLvglUsageSnippet(options.outputName, 8)}`;
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
