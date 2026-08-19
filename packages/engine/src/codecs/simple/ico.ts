import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

export { encodeIco } from '../../export/ico.js';

const readView = (bytes: ArrayBuffer | Uint8Array) =>
  new DataView(
    bytes instanceof Uint8Array ? bytes.buffer : bytes,
    bytes instanceof Uint8Array ? bytes.byteOffset : 0,
    bytes instanceof Uint8Array ? bytes.byteLength : undefined,
  );

/**
 * Decodes a 32-bit BMP-backed ICO or CUR entry. PNG-backed entries deliberately
 * fail here; their decoding is delegated to the PNG codec rather than pretending
 * all icon payloads share a bitmap layout.
 */
function decodeIcon(bytes: ArrayBuffer | Uint8Array, kind: 1 | 2): RasterImage {
  const view = readView(bytes);
  if (view.byteLength < 22 || view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== kind)
    throw new Error(`Invalid ${kind === 1 ? 'ICO' : 'CUR'} header.`);
  const count = view.getUint16(4, true);
  if (count < 1 || view.byteLength < 6 + count * 16) throw new Error('Truncated ICO directory.');

  let entry = -1;
  let entryPixels = -1;
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = view.getUint8(offset) || 256;
    const height = view.getUint8(offset + 1) || 256;
    const bytesInResource = view.getUint32(offset + 8, true);
    const imageOffset = view.getUint32(offset + 12, true);
    if (imageOffset + bytesInResource > view.byteLength || bytesInResource < 40) continue;
    if (view.getUint32(imageOffset, true) !== 40) continue;
    const pixels = width * height;
    if (pixels > entryPixels) {
      entry = offset;
      entryPixels = pixels;
    }
  }
  if (entry === -1)
    throw new Error(
      'This ICO has no supported 32-bit BMP entry; PNG-backed ICO entries are unsupported.',
    );

  const width = view.getUint8(entry) || 256;
  const directoryHeight = view.getUint8(entry + 1) || 256;
  const imageOffset = view.getUint32(entry + 12, true);
  const bitmapWidth = view.getInt32(imageOffset + 4, true);
  const bitmapHeight = view.getInt32(imageOffset + 8, true);
  const planes = view.getUint16(imageOffset + 12, true);
  const bitsPerPixel = view.getUint16(imageOffset + 14, true);
  const compression = view.getUint32(imageOffset + 16, true);
  if (
    bitmapWidth !== width ||
    Math.abs(bitmapHeight) !== directoryHeight * 2 ||
    planes !== 1 ||
    bitsPerPixel !== 32 ||
    compression !== 0
  )
    throw new Error('Unsupported ICO bitmap encoding.');

  const pixelOffset = imageOffset + 40;
  const xorBytes = width * directoryHeight * 4;
  if (pixelOffset + xorBytes > view.byteLength) throw new Error('Truncated ICO pixel data.');
  const pixels = new Uint8ClampedArray(width * directoryHeight * 4);
  const topDown = bitmapHeight < 0;
  for (let y = 0; y < directoryHeight; y += 1) {
    const sourceY = topDown ? y : directoryHeight - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const source = pixelOffset + (sourceY * width + x) * 4;
      const target = (y * width + x) * 4;
      pixels[target] = view.getUint8(source + 2);
      pixels[target + 1] = view.getUint8(source + 1);
      pixels[target + 2] = view.getUint8(source);
      pixels[target + 3] = view.getUint8(source + 3);
    }
  }
  return createRaster(width, directoryHeight, pixels);
}

export function decodeIco(bytes: ArrayBuffer | Uint8Array): RasterImage {
  return decodeIcon(bytes, 1);
}

/** Decodes a BMP-backed Windows cursor; cursor hotspots are intentionally ignored for raster export. */
export function decodeCur(bytes: ArrayBuffer | Uint8Array): RasterImage {
  return decodeIcon(bytes, 2);
}
