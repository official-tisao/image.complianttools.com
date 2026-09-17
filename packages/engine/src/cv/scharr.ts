import type { RasterImage } from '../types.js';

export function scharr(image: RasterImage): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const data = image.frames[0].data;
  const result = new Uint8ClampedArray(w * h);
  const gxKernel = [3, 0, -3, 10, 0, -10, 3, 0, -3];
  const gyKernel = [3, 10, 3, 0, 0, 0, -3, -10, -3];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      let gx = 0;
      let gy = 0;
      for (let ky = 0; ky < 3; ky += 1) {
        for (let kx = 0; kx < 3; kx += 1) {
          const off = ((y + ky - 1) * w + (x + kx - 1)) * 4;
          const gray = Math.round((data[off]! + data[off + 1]! + data[off + 2]!) / 3);
          const k = ky * 3 + kx;
          gx += gray * gxKernel[k]!;
          gy += gray * gyKernel[k]!;
        }
      }
      const mag = Math.sqrt(gx * gx + gy * gy);
      result[y * w + x] = Math.min(255, Math.round(mag));
    }
  }
  return result;
}
