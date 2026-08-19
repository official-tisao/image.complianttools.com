import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

/** Decodes the common 8-bit, one-plane PCX variant with its trailing 256-colour palette. */
export function decodePcx(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (
    bytes.length < 897 ||
    bytes[0] !== 0x0a ||
    bytes[2] !== 1 ||
    bytes[3] !== 8 ||
    bytes[65] !== 1
  )
    throw new Error('Unsupported or malformed PCX image.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = u16(view, 8) - u16(view, 4) + 1;
  const height = u16(view, 10) - u16(view, 6) + 1;
  const bytesPerLine = u16(view, 66);
  if (width < 1 || height < 1 || bytesPerLine < width)
    throw new Error('Unsupported or malformed PCX dimensions.');
  const paletteOffset = bytes.length - 769;
  if (bytes[paletteOffset] !== 12) throw new Error('PCX is missing its 256-colour palette.');
  const indices = new Uint8Array(bytesPerLine * height);
  let source = 128;
  let target = 0;
  while (target < indices.length && source < paletteOffset) {
    const value = bytes[source++]!;
    const count = (value & 0xc0) === 0xc0 ? value & 0x3f : 1;
    const sample = count === 1 ? value : bytes[source++]!;
    if (target + count > indices.length)
      throw new Error('PCX RLE data exceeds its declared dimensions.');
    indices.fill(sample!, target, target + count);
    target += count;
  }
  if (target !== indices.length) throw new Error('Truncated PCX RLE data.');
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = indices[y * bytesPerLine + x]!;
      const pixel = (y * width + x) * 4;
      const palette = paletteOffset + 1 + index * 3;
      rgba.set([bytes[palette]!, bytes[palette + 1]!, bytes[palette + 2]!, 255], pixel);
    }
  }
  return createRaster(width, height, rgba);
}
