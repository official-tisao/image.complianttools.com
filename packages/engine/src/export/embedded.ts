import type { RasterImage } from '../types.js';

export type EmbeddedPixelFormat = 'rgb565' | 'rgb565be' | 'rgb888' | 'argb8888';

export interface EmbeddedExportOptions {
  readonly outputName: string;
  readonly format: EmbeddedPixelFormat;
  readonly alphaByte?: boolean;
  readonly chromaKey?: readonly [red: number, green: number, blue: number];
  readonly bigEndian?: boolean;
  readonly storage?: 'const' | 'static' | 'static-const';
  readonly lineWidth?: number;
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

/** Packs the first frame for LVGL or a generic embedded target without a runtime dependency. */
export function packEmbeddedPixels(image: RasterImage, options: EmbeddedExportOptions): Uint8Array {
  validateEmbeddedOutputName(options.outputName);
  const rgba = image.frames[0].data;
  const bytesPerPixel = options.format === 'rgb888' ? 3 : options.format === 'argb8888' ? 4 : 2;
  const output = new Uint8Array(
    image.width * image.height * (bytesPerPixel + (options.alphaByte ? 1 : 0)),
  );
  let target = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const [red, green, blue, alpha] = rgba.subarray(offset, offset + 4);
    const transparent = options.chromaKey?.every(
      (value, index) => value === [red, green, blue][index],
    );
    if (options.format === 'rgb565' || options.format === 'rgb565be') {
      const value = rgb565(red!, green!, blue!);
      const bigEndian = options.bigEndian || options.format === 'rgb565be';
      output[target++] = bigEndian ? value >> 8 : value & 255;
      output[target++] = bigEndian ? value & 255 : value >> 8;
    } else if (options.format === 'rgb888') {
      output.set([red!, green!, blue!], target);
      target += 3;
    } else {
      output.set([transparent ? 0 : alpha!, red!, green!, blue!], target);
      target += 4;
    }
    if (options.alphaByte) output[target++] = transparent ? 0 : alpha!;
  }
  return output;
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

/** Emits an LVGL v9 image descriptor and matching map for the supported true-colour formats. */
export function emitLvglV9CArray(image: RasterImage, options: EmbeddedExportOptions): string {
  const colourFormat: Record<EmbeddedPixelFormat, string> = {
    rgb565: 'LV_COLOR_FORMAT_RGB565',
    rgb565be: 'LV_COLOR_FORMAT_RGB565',
    rgb888: 'LV_COLOR_FORMAT_RGB888',
    argb8888: 'LV_COLOR_FORMAT_ARGB8888',
  };
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
`;
}

/** Emits an LVGL v8 descriptor and matching map for supported true-colour formats. */
export function emitLvglV8CArray(image: RasterImage, options: EmbeddedExportOptions): string {
  const colourFormat: Record<EmbeddedPixelFormat, string> = {
    rgb565: 'LV_IMG_CF_TRUE_COLOR',
    rgb565be: 'LV_IMG_CF_TRUE_COLOR',
    rgb888: 'LV_IMG_CF_TRUE_COLOR',
    argb8888: 'LV_IMG_CF_TRUE_COLOR_ALPHA',
  };
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
`;
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
      const luminance =
        pixels[offset]! * 0.2126 + pixels[offset + 1]! * 0.7152 + pixels[offset + 2]! * 0.0722;
      if (luminance < 128) bytes[y * rowBytes + Math.floor(x / 8)]! |= 0x80 >> (x % 8);
    }
  return `#include <avr/pgmspace.h>\nconst uint8_t ${name}[] PROGMEM = { ${[...bytes].map((value) => `0x${value.toString(16).padStart(2, '0')}`).join(', ')} };\n`;
}
