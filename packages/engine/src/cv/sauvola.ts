import type { RasterImage } from '../types.js';

export function sauvolaThreshold(image: RasterImage): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const data = image.frames[0].data;
  const mask = new Uint8ClampedArray(w * h);
  const hist = new Uint32Array(256);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const off = (y * w + x) * 4;
      const gray = Math.round((data[off]! + data[off + 1]! + data[off + 2]!) / 3);
      hist[Math.min(255, Math.max(0, gray))]!++;
    }
  }
  let bestT = 128;
  let bestScore = 0;
  const total = w * h;
  for (let t = 1; t < 255; t += 1) {
    let wB = 0;
    let sumB = 0;
    for (let i = 0; i < t; i += 1) {
      wB += hist[i]!;
      sumB += i * hist[i]!;
    }
    const wF = total - wB;
    if (wF === 0 || wB === 0) continue;
    const meanB = sumB / wB;
    const meanF = ((total * (t + 255)) / 2 - sumB) / wF;
    const score = wB * wF * (meanB - meanF) * (meanB - meanF);
    if (score > bestScore) {
      bestScore = score;
      bestT = t;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const off = (y * w + x) * 4;
      const gray = Math.round((data[off]! + data[off + 1]! + data[off + 2]!) / 3);
      mask[y * w + x] = gray >= bestT ? 255 : 0;
    }
  }
  return mask;
}
