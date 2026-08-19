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
