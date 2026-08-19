import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

function headerLine(
  bytes: Uint8Array,
  offset: number,
): { readonly next: number; readonly value: string } {
  const end = bytes.indexOf(10, offset);
  if (end === -1) throw new Error('Malformed PFM header.');
  return {
    next: end + 1,
    value: new TextDecoder().decode(bytes.subarray(offset, bytes[end - 1] === 13 ? end - 1 : end)),
  };
}

/** Decodes 32-bit floating-point Portable Float Map images into an SDR raster. */
export function decodePfm(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const magic = headerLine(bytes, 0);
  const dimensions = headerLine(bytes, magic.next);
  const scaleLine = headerLine(bytes, dimensions.next);
  const channels = magic.value === 'PF' ? 3 : magic.value === 'Pf' ? 1 : 0;
  const dimensionParts = dimensions.value.trim().split(/\s+/u);
  const width = Number(dimensionParts[0] ?? Number.NaN);
  const height = Number(dimensionParts[1] ?? Number.NaN);
  const scale = Number(scaleLine.value.trim());
  if (
    channels === 0 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    !Number.isFinite(scale) ||
    scale === 0
  )
    throw new Error('Unsupported or malformed PFM image.');

  const byteLength = width * height * channels * 4;
  if (scaleLine.next + byteLength !== bytes.byteLength)
    throw new Error('Truncated PFM pixel data.');
  const view = new DataView(bytes.buffer, bytes.byteOffset + scaleLine.next, byteLength);
  const littleEndian = scale < 0;
  const multiplier = Math.abs(scale);
  const pixels = new Uint8ClampedArray(width * height * 4);
  const toSdr = (value: number) => {
    if (!Number.isFinite(value)) throw new Error('PFM pixel values must be finite.');
    return Math.round(Math.max(0, Math.min(1, value * multiplier)) * 255);
  };
  for (let y = 0; y < height; y += 1) {
    const targetY = height - 1 - y; // PFM stores rows from bottom to top.
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * channels * 4;
      const target = (targetY * width + x) * 4;
      pixels[target] = toSdr(view.getFloat32(source, littleEndian));
      pixels[target + 1] = toSdr(view.getFloat32(source + (channels === 1 ? 0 : 4), littleEndian));
      pixels[target + 2] = toSdr(view.getFloat32(source + (channels === 1 ? 0 : 8), littleEndian));
      pixels[target + 3] = 255;
    }
  }
  return createRaster(width, height, pixels);
}
