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

/** Encodes an 8-bit, uncompressed planar SGI/RGB image (RGB or RGBA). */
export function encodeSgi(image: RasterImage): ArrayBuffer {
  if (image.width < 1 || image.height < 1 || image.width > 65_535 || image.height > 65_535)
    throw new Error('SGI dimensions must be between 1 and 65535 pixels.');
  const frame = image.frames[0];
  if (!frame) throw new Error('Cannot encode an image without a frame.');
  const plane = image.width * image.height;
  let channels = 3;
  for (let pixel = 0; pixel < plane; pixel += 1)
    if (frame.data[pixel * 4 + 3] !== 255) {
      channels = 4;
      break;
    }
  const output = new Uint8Array(512 + plane * channels);
  const view = new DataView(output.buffer);
  view.setUint16(0, 474, false);
  output[3] = 1;
  view.setUint16(4, 3, false);
  view.setUint16(6, image.width, false);
  view.setUint16(8, image.height, false);
  view.setUint16(10, channels, false);
  view.setUint32(12, 0, false);
  view.setUint32(16, 255, false);
  for (let pixel = 0; pixel < plane; pixel += 1) {
    const source = pixel * 4;
    output[512 + pixel] = frame.data[source]!;
    output[512 + plane + pixel] = frame.data[source + 1]!;
    output[512 + plane * 2 + pixel] = frame.data[source + 2]!;
    if (channels === 4) output[512 + plane * 3 + pixel] = frame.data[source + 3]!;
  }
  return output.buffer;
}
