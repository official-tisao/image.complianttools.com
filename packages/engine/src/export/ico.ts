import type { RasterImage } from '../types.js';

function iconBitmap(image: RasterImage): Uint8Array {
  const xorBytes = image.width * image.height * 4;
  const maskRowBytes = Math.ceil(image.width / 32) * 4;
  const output = new Uint8Array(40 + xorBytes + maskRowBytes * image.height);
  const view = new DataView(output.buffer);
  view.setUint32(0, 40, true);
  view.setInt32(4, image.width, true);
  view.setInt32(8, image.height * 2, true);
  view.setUint16(12, 1, true);
  view.setUint16(14, 32, true);
  view.setUint32(20, xorBytes, true);
  const frame = image.frames[0].data;
  for (let y = 0; y < image.height; y += 1) {
    const targetY = image.height - 1 - y;
    for (let x = 0; x < image.width; x += 1) {
      const source = (y * image.width + x) * 4;
      const target = 40 + (targetY * image.width + x) * 4;
      output[target] = frame[source + 2]!;
      output[target + 1] = frame[source + 1]!;
      output[target + 2] = frame[source]!;
      output[target + 3] = frame[source + 3]!;
      if (frame[source + 3] === 0)
        output[40 + xorBytes + targetY * maskRowBytes + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }
  return output;
}

/** Creates a standards-compliant single-image ICO with a 32-bit BMP payload. */
export function encodeIco(image: RasterImage): ArrayBuffer {
  if (image.width < 1 || image.height < 1 || image.width > 256 || image.height > 256)
    throw new Error('ICO dimensions must be between 1 and 256 pixels.');
  const bitmap = iconBitmap(image);
  const output = new Uint8Array(22 + bitmap.length);
  const view = new DataView(output.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  output[6] = image.width === 256 ? 0 : image.width;
  output[7] = image.height === 256 ? 0 : image.height;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, bitmap.length, true);
  view.setUint32(18, 22, true);
  output.set(bitmap, 22);
  return output.buffer;
}

/** Creates a multi-resolution 32-bit BMP-backed ICO in ascending size order. */
export function encodeMultiIco(images: readonly RasterImage[]): ArrayBuffer {
  if (images.length < 1 || images.length > 256)
    throw new Error('ICO export requires between 1 and 256 images.');
  const ordered = [...images].sort((left, right) => left.width - right.width);
  const seen = new Set<number>();
  for (const image of ordered) {
    if (
      image.width !== image.height ||
      image.width < 1 ||
      image.width > 256 ||
      seen.has(image.width)
    )
      throw new Error('ICO images must be distinct square sizes between 1 and 256 pixels.');
    seen.add(image.width);
  }
  const bitmaps = ordered.map(iconBitmap);
  const directoryBytes = 6 + 16 * ordered.length;
  const output = new Uint8Array(
    directoryBytes + bitmaps.reduce((total, bitmap) => total + bitmap.length, 0),
  );
  const view = new DataView(output.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, ordered.length, true);
  let payloadOffset = directoryBytes;
  for (let index = 0; index < ordered.length; index += 1) {
    const image = ordered[index]!;
    const bitmap = bitmaps[index]!;
    const entry = 6 + index * 16;
    output[entry] = image.width === 256 ? 0 : image.width;
    output[entry + 1] = image.height === 256 ? 0 : image.height;
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, bitmap.length, true);
    view.setUint32(entry + 12, payloadOffset, true);
    output.set(bitmap, payloadOffset);
    payloadOffset += bitmap.length;
  }
  return output.buffer;
}

/** Creates a single-image 32-bit Windows cursor with a validated pixel hotspot. */
export function encodeCur(
  image: RasterImage,
  hotspot: { readonly x?: number; readonly y?: number } = {},
): ArrayBuffer {
  if (image.width < 1 || image.height < 1 || image.width > 256 || image.height > 256)
    throw new Error('CUR dimensions must be between 1 and 256 pixels.');
  const x = hotspot.x ?? 0;
  const y = hotspot.y ?? 0;
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= image.width ||
    y >= image.height
  )
    throw new Error('CUR hotspot must lie within the cursor dimensions.');
  const bitmap = iconBitmap(image);
  const output = new Uint8Array(22 + bitmap.length);
  const view = new DataView(output.buffer);
  view.setUint16(2, 2, true);
  view.setUint16(4, 1, true);
  output[6] = image.width === 256 ? 0 : image.width;
  output[7] = image.height === 256 ? 0 : image.height;
  view.setUint16(10, x, true);
  view.setUint16(12, y, true);
  view.setUint32(14, bitmap.length, true);
  view.setUint32(18, 22, true);
  output.set(bitmap, 22);
  return output.buffer;
}
