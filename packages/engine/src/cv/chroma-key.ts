import type { RasterImage } from '../types.js';

export function chromaKey(
  image: RasterImage,
  keyColor: { r: number; g: number; b: number },
  tolerance: number,
): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const data = image.frames[0].data;
  const mask = new Uint8ClampedArray(w * h);
  const kr = keyColor.r;
  const kg = keyColor.g;
  const kb = keyColor.b;
  const t2 = tolerance * tolerance;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const off = (y * w + x) * 4;
      const r = data[off];
      const g = data[off + 1];
      const b = data[off + 2];
      const dR = r! - kr;
      const dG = g! - kg;
      const dB = b! - kb;
      if (dR * dR + dG * dG + dB * dB <= t2) {
        mask[y * w + x] = 0;
      } else {
        mask[y * w + x] = 255;
      }
    }
  }
  return mask;
}
