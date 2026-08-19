import parseExr from 'parse-exr';

import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

const HALF_FLOAT_EXPONENT_MASK = 0x7c00;
const HALF_FLOAT_FRACTION_MASK = 0x03ff;

function halfFloatToNumber(value: number): number {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value & HALF_FLOAT_EXPONENT_MASK) >> 10;
  const fraction = value & HALF_FLOAT_FRACTION_MASK;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 31) return fraction === 0 ? sign * Infinity : Number.NaN;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

function linearToSrgb8(value: number): number {
  const linear = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

/** Converts parse-exr's linear HDR payload into the engine's 8-bit sRGB working raster. */
export function exrDataToRaster(parsed: ReturnType<typeof parseExr>): RasterImage {
  const channels = parsed.format === 1023 ? 4 : 1;
  const expectedValues = parsed.width * parsed.height * channels;
  if (parsed.data.length !== expectedValues) throw new Error('Invalid OpenEXR pixel data length.');

  const output = new Uint8ClampedArray(parsed.width * parsed.height * 4);
  const sample = (index: number) =>
    parsed.data instanceof Uint16Array
      ? halfFloatToNumber(parsed.data[index]!)
      : parsed.data[index]!;

  for (let pixel = 0; pixel < parsed.width * parsed.height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    const red = sample(source);
    output[target] = linearToSrgb8(red);
    output[target + 1] = linearToSrgb8(channels === 1 ? red : sample(source + 1));
    output[target + 2] = linearToSrgb8(channels === 1 ? red : sample(source + 2));
    output[target + 3] = channels === 1 ? 255 : linearToSrgb8(sample(source + 3));
  }
  return createRaster(parsed.width, parsed.height, output);
}

export function decodeExr(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return exrDataToRaster(parseExr(buffer));
}
