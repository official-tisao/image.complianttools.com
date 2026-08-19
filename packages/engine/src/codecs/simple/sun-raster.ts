import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

const magic = 0x59a66a95;

/** Decodes standard uncompressed 24/32-bit Sun Raster images into RGBA pixels. */
export function decodeSunRaster(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 32) throw new Error('Sun Raster header is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(4, false);
  const height = view.getUint32(8, false);
  const depth = view.getUint32(12, false);
  const length = view.getUint32(16, false);
  if (
    view.getUint32(0, false) !== magic ||
    ![24, 32].includes(depth) ||
    view.getUint32(20, false) !== 1 ||
    view.getUint32(24, false) !== 0 ||
    view.getUint32(28, false) !== 0 ||
    width < 1 ||
    height < 1 ||
    width * height > 100_000_000
  )
    throw new Error('Unsupported or malformed Sun Raster image.');
  const bytesPerPixel = depth / 8;
  const rowBytes = Math.ceil((width * bytesPerPixel) / 2) * 2;
  if (length !== rowBytes * height || 32 + length !== bytes.byteLength)
    throw new Error('Sun Raster pixel data is truncated or invalid.');
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const source = 32 + y * rowBytes + x * bytesPerPixel;
      const target = (y * width + x) * 4;
      pixels.set(
        [
          bytes[source + bytesPerPixel - 3]!,
          bytes[source + bytesPerPixel - 2]!,
          bytes[source + bytesPerPixel - 1]!,
          depth === 32 ? bytes[source]! : 255,
        ],
        target,
      );
    }
  return createRaster(width, height, pixels);
}
