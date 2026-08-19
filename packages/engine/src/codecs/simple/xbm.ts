import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

/** Decodes X11 bitmap source with the traditional LSB-first unsigned-char payload. */
export function decodeXbm(input: ArrayBuffer | Uint8Array): RasterImage {
  const source = new TextDecoder().decode(
    input instanceof Uint8Array ? input : new Uint8Array(input),
  );
  const width = Number(source.match(/#define\s+\w+_width\s+(\d+)/u)?.[1]);
  const height = Number(source.match(/#define\s+\w+_height\s+(\d+)/u)?.[1]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 100_000 ||
    width > 100_000_000 / height
  )
    throw new Error('Unsupported or unsafe XBM dimensions.');
  const body = source.match(/\{([\s\S]*)\}/u)?.[1];
  if (body === undefined) throw new Error('XBM data array is missing.');
  const values = [...body.matchAll(/0x([0-9a-f]{1,2})|\b(\d{1,3})\b/giu)].map((match) =>
    Number.parseInt(match[1] ?? match[2]!, match[1] ? 16 : 10),
  );
  const rowBytes = Math.ceil(width / 8);
  if (values.length !== rowBytes * height || values.some((value) => value > 255))
    throw new Error('Truncated or invalid XBM pixel data.');
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const black = (values[y * rowBytes + Math.floor(x / 8)]! & (1 << (x % 8))) !== 0;
      rgba.set(black ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * width + x) * 4);
    }
  return createRaster(width, height, rgba);
}
