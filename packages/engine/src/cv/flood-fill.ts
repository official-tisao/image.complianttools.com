import type { RasterImage } from '../types.js';

export function floodFill(
  image: RasterImage,
  seedX: number,
  seedY: number,
  tolerance: number,
): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const frame = image.frames[0];
  const data = frame.data;
  const mask = new Uint8ClampedArray(w * h);
  const seedIndex = seedY * w + seedX;
  if (seedX < 0 || seedX >= w || seedY < 0 || seedY >= h || seedIndex < 0 || seedIndex >= w * h) {
    return mask;
  }
  const stack: Array<{ x: number; y: number }> = [{ x: seedX, y: seedY }];
  const seedOffset = seedIndex * 4;
  const sr = data[seedOffset]!;
  const sg = data[seedOffset + 1]!;
  const sb = data[seedOffset + 2]!;
  const sa = data[seedOffset + 3]!;
  if (tolerance < 0) tolerance = 0;
  // tol2 removed; distance compared directly
  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const idx = y * w + x;
    if (mask[idx] === 255) continue;
    const off = idx * 4;
    const r = data[off]!;
    const g = data[off + 1]!;
    const b = data[off + 2]!;
    const a = data[off + 3]!;
    const distR = r - sr;
    const distG = g - sg;
    const distB = b - sb;
    const dist = Math.sqrt(distR * distR + distG * distG + distB * distB);
    if (dist <= tolerance && a === sa) {
      mask[idx] = 255;
      if (x > 0) stack.push({ x: x - 1, y });
      if (x < w - 1) stack.push({ x: x + 1, y });
      if (y > 0) stack.push({ x, y: y - 1 });
      if (y < h - 1) stack.push({ x, y: y + 1 });
    }
  }
  return mask;
}
