import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

function readMultiByte(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0;
  for (let count = 0; count < 5; count += 1) {
    const byte = bytes[offset++];
    if (byte === undefined) throw new Error('Truncated WBMP header.');
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: offset };
  }
  throw new Error('WBMP integer is too large.');
}

function writeMultiByte(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) throw new Error('Invalid WBMP dimension.');
  const bytes = [value & 0x7f];
  for (let remaining = value >>> 7; remaining > 0; remaining >>>= 7)
    bytes.unshift((remaining & 0x7f) | 0x80);
  return bytes;
}

/** Decodes monochrome WBMP Type 0 images (one means black, zero means white). */
export function decodeWbmp(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] !== 0 || bytes[1] !== 0) throw new Error('Unsupported WBMP type or fixed header.');
  const width = readMultiByte(bytes, 2);
  const height = readMultiByte(bytes, width.next);
  if (
    width.value < 1 ||
    height.value < 1 ||
    width.value > 100_000 ||
    height.value > 100_000 ||
    width.value > 100_000_000 / height.value
  )
    throw new Error('WBMP dimensions exceed the safe decode limit.');
  const rowBytes = Math.ceil(width.value / 8);
  if (height.next + rowBytes * height.value !== bytes.length)
    throw new Error('Truncated or invalid WBMP pixel data.');
  const rgba = new Uint8ClampedArray(width.value * height.value * 4);
  for (let y = 0; y < height.value; y += 1)
    for (let x = 0; x < width.value; x += 1) {
      const black =
        (bytes[height.next + y * rowBytes + Math.floor(x / 8)]! & (0x80 >> (x % 8))) !== 0;
      const offset = (y * width.value + x) * 4;
      rgba.set(black ? [0, 0, 0, 255] : [255, 255, 255, 255], offset);
    }
  return createRaster(width.value, height.value, rgba);
}

export function encodeWbmp(image: RasterImage): ArrayBuffer {
  const rowBytes = Math.ceil(image.width / 8);
  const output = new Uint8Array(
    2 +
      writeMultiByte(image.width).length +
      writeMultiByte(image.height).length +
      rowBytes * image.height,
  );
  output.set([0, 0, ...writeMultiByte(image.width), ...writeMultiByte(image.height)]);
  const start = output.length - rowBytes * image.height;
  for (let y = 0; y < image.height; y += 1)
    for (let x = 0; x < image.width; x += 1) {
      const pixel = (y * image.width + x) * 4;
      const luminance =
        image.frames[0].data[pixel]! * 0.2126 +
        image.frames[0].data[pixel + 1]! * 0.7152 +
        image.frames[0].data[pixel + 2]! * 0.0722;
      if (luminance < 128) output[start + y * rowBytes + Math.floor(x / 8)]! |= 0x80 >> (x % 8);
    }
  return output.buffer;
}
