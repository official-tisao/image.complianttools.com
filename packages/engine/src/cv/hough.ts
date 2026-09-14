import type { RasterImage } from '../types.js';

export function hough(image: RasterImage): { lines: Array<{ r: number; theta: number }> } {
  const w = image.width;
  const h = image.height;
  const data = image.frames[0].data;
  const edgeMask = new Uint8ClampedArray(w * h);
  // Simple edge detection approximation for primitive.
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const off = (y * w + x) * 4;
      const gray = Math.round((data[off]! + data[off + 1]! + data[off + 2]!) / 3);
      const gx =
        gray -
        Math.round(
          (data[((y - 1) * w + (x - 1)) * 4]! +
            data[((y - 1) * w + (x - 1)) * 4 + 1]! +
            data[((y - 1) * w + (x - 1)) * 4 + 2]!) /
            3,
        );
      const gy =
        gray -
        Math.round(
          (data[((y + 1) * w + (x - 1)) * 4]! +
            data[((y + 1) * w + (x - 1)) * 4 + 1]! +
            data[((y + 1) * w + (x - 1)) * 4 + 2]!) /
            3,
        );
      const mag = Math.sqrt(gx * gx + gy * gy);
      edgeMask[y * w + x] = mag > 30 ? 255 : 0;
    }
  }
  const lines: Array<{ r: number; theta: number }> = [];
  // Simplified Hough: sample some points from edge mask and estimate line parameters.
  const angles = [0, 30, 45, 60, 90, 120, 135, 150, 180];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (edgeMask[idx] === 255) {
        for (const thetaDeg of angles) {
          const theta = (thetaDeg * Math.PI) / 180;
          const r = x * Math.cos(theta) + y * Math.sin(theta);
          lines.push({ r: Math.round(r), theta: thetaDeg });
        }
      }
    }
  }
  // Deduplicate approximate lines (simple clustering by rounding).
  const deduped = new Map<string, { r: number; theta: number }>();
  for (const line of lines) {
    const key = `${Math.round(line.r / 10) * 10},${line.theta}`;
    deduped.set(key, line);
  }
  return { lines: Array.from(deduped.values()) };
}
