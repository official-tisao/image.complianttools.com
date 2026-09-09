import type { RasterImage } from '../types.js';

export function otsuThreshold(image: RasterImage): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const data = image.frames[0].data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i += 4) {
    const gray = Math.round((data[i]! + data[i + 1]! + data[i + 2]!) / 3);
    hist[Math.min(255, Math.max(0, gray))]!++;
  }
  const total = w * h;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const meanB = sumB / wB;
    const meanF = (sum - sumB) / wF;
    const varB = wB * wF * (meanB - meanF) * (meanB - meanF);
    if (varB > maxVar) {
      maxVar = varB;
      threshold = t;
    }
  }
  const mask = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const off = (y * w + x) * 4;
      const gray = Math.round((data[off]! + data[off + 1]! + data[off + 2]!) / 3);
      mask[y * w + x] = gray >= threshold ? 255 : 0;
    }
  }
  return mask;
}
