import type { RasterImage } from '../types.js';

export function colourRange(
  image: RasterImage,
  lower: { r: number; g: number; b: number },
  upper: { r: number; g: number; b: number },
): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const data = image.frames[0].data;
  const mask = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const off = (y * w + x) * 4;
      const r = data[off];
      const g = data[off + 1];
      const b = data[off + 2];
      if (
        r! >= lower.r &&
        r! <= upper.r &&
        g! >= lower.g &&
        g! <= upper.g &&
        b! >= lower.b &&
        b! <= upper.b
      ) {
        mask[y * w + x] = 255;
      }
    }
  }
  return mask;
}
