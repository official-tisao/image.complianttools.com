import type { RasterImage } from '../types.js';

export function integralImage(image: RasterImage): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const data = image.frames[0].data;
  // Simplified integral image: returns cumulative gray values as 32-bit array (scaled to fit in Uint8 for primitive).
  const intW = w + 1;
  const intH = h + 1;
  const intData = new Uint8ClampedArray(intW * intH);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const off = (y * w + x) * 4;
      const gray = Math.round((data[off]! + data[off + 1]! + data[off + 2]!) / 3);
      const intOff = (y + 1) * intW + (x + 1);
      const above = y * intW + (x + 1);
      const left = (y + 1) * intW + x;
      const diag = y * intW + x;
      intData[intOff] = Math.min(255, intData[above]! + intData[left]! - intData[diag]! + gray);
    }
  }
  return intData;
}
