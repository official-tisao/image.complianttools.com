import type { RasterImage } from '../types.js';

export function canny(
  image: RasterImage,
  lowThreshold: number,
  highThreshold: number,
): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const data = image.frames[0].data;
  const result = new Uint8ClampedArray(w * h);
  const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      let gx = 0;
      let gy = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const off = ((y + ky) * w + (x + kx)) * 4;
          const gray = Math.round((data[off]! + data[off + 1]! + data[off + 2]!) / 3);
          const kIndex = (ky + 1) * 3 + (kx + 1);
          gx += gray * kernelX[kIndex]!;
          gy += gray * kernelY[kIndex]!;
        }
      }
      const mag = Math.sqrt(gx * gx + gy * gy);
      result[y * w + x] = mag > highThreshold ? 255 : mag > lowThreshold ? 128 : 0;
    }
  }
  return result;
}
