import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

/** Decodes uncompressed 8-bit planar SGI/RGB images. */
export function decodeSgi(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 512) throw new Error('SGI header is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, false);
  const height = view.getUint16(8, false);
  const channels = view.getUint16(10, false);
  if (
    view.getUint16(0, false) !== 474 ||
    view.getUint8(2) !== 0 ||
    view.getUint8(3) !== 1 ||
    ![2, 3].includes(view.getUint16(4, false)) ||
    ![1, 3, 4].includes(channels) ||
    width < 1 ||
    height < 1 ||
    width * height > 100_000_000
  )
    throw new Error('Unsupported or malformed SGI image.');
  const plane = width * height;
  if (512 + plane * channels !== bytes.byteLength)
    throw new Error('SGI pixel data is truncated or invalid.');
  const pixels = new Uint8ClampedArray(plane * 4);
  for (let pixel = 0; pixel < plane; pixel += 1) {
    pixels[pixel * 4] = bytes[512 + pixel]!;
    pixels[pixel * 4 + 1] = bytes[512 + (channels === 1 ? 0 : plane) + pixel]!;
    pixels[pixel * 4 + 2] = bytes[512 + (channels === 1 ? 0 : 2 * plane) + pixel]!;
    pixels[pixel * 4 + 3] = channels === 4 ? bytes[512 + 3 * plane + pixel]! : 255;
  }
  return createRaster(width, height, pixels);
}
