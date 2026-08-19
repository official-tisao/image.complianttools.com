import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

const viewOf = (bytes: ArrayBuffer | Uint8Array) =>
  new DataView(
    bytes instanceof Uint8Array ? bytes.buffer : bytes,
    bytes instanceof Uint8Array ? bytes.byteOffset : 0,
  );

export function decodeBmp(bytes: ArrayBuffer | Uint8Array): RasterImage {
  const view = viewOf(bytes);
  if (view.byteLength < 54 || view.getUint16(0, true) !== 0x4d42)
    throw new Error('Invalid BMP header.');
  const offset = view.getUint32(10, true);
  const dibSize = view.getUint32(14, true);
  const width = view.getInt32(18, true);
  const signedHeight = view.getInt32(22, true);
  const bitsPerPixel = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (
    dibSize < 40 ||
    width <= 0 ||
    signedHeight === 0 ||
    ![24, 32].includes(bitsPerPixel) ||
    compression !== 0
  )
    throw new Error('Unsupported BMP encoding.');
  const height = Math.abs(signedHeight);
  const rowBytes = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  if (offset + rowBytes * height > view.byteLength) throw new Error('Truncated BMP pixel data.');
  const pixels = new Uint8ClampedArray(width * height * 4);
  const topDown = signedHeight < 0;
  for (let y = 0; y < height; y += 1) {
    const sourceY = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const source = offset + sourceY * rowBytes + x * (bitsPerPixel / 8);
      const target = (y * width + x) * 4;
      pixels[target] = view.getUint8(source + 2);
      pixels[target + 1] = view.getUint8(source + 1);
      pixels[target + 2] = view.getUint8(source);
      pixels[target + 3] = bitsPerPixel === 32 ? view.getUint8(source + 3) : 255;
    }
  }
  return createRaster(width, height, pixels);
}

export function encodeBmp(image: RasterImage): ArrayBuffer {
  const width = image.width;
  const height = image.height;
  const rowBytes = width * 4;
  const offset = 54;
  const output = new ArrayBuffer(offset + rowBytes * height);
  const view = new DataView(output);
  view.setUint16(0, 0x4d42, true);
  view.setUint32(2, output.byteLength, true);
  view.setUint32(10, offset, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(34, rowBytes * height, true);
  const frame = image.frames[0].data;
  for (let y = 0; y < height; y += 1) {
    const targetY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = offset + targetY * rowBytes + x * 4;
      view.setUint8(target, frame[source + 2]!);
      view.setUint8(target + 1, frame[source + 1]!);
      view.setUint8(target + 2, frame[source]!);
      view.setUint8(target + 3, frame[source + 3]!);
    }
  }
  return output;
}
