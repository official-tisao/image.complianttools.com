import type { RasterImage } from '../../types.js';

/**
 * Antialias: edge-aware 3×3 Gaussian smoothing. The `amount` field
 * controls the blend between the input and the Gaussian-smoothed
 * image; `amount = 0` is a no-op, `amount = 100` is the full
 * Gaussian smoothing.
 *
 * The kernel is a separable 3×3 Gaussian with weights
 *   [1 2 1; 2 4 2; 1 2 1] / 16
 * which is the standard normalised binomial. The halo is 1 px.
 */
export const ANTIALIAS_HALO = 1;

export function applyAntialias(image: RasterImage, amount = 50): RasterImage {
  if (amount <= 0) return image;
  const k = amount / 100; // 0 = no change, 1 = full Gaussian
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sums: [number, number, number] = [0, 0, 0];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const sy = Math.max(0, Math.min(height - 1, y + dy));
          const off = (sy * width + sx) * 4;
          // Weights: 1, 2, 1 — applied separably in x then y. The combined
          // weight is 1*1=1, 1*2=2, 2*1=2, 2*2=4, 1*1=1, 1*2=2, etc. We
          // could compute it in two passes but for a 3×3 kernel the
          // single pass with the table below is fast and clear.
          const w = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
          sums[0] += source[off]! * w;
          sums[1] += source[off + 1]! * w;
          sums[2] += source[off + 2]! * w;
        }
      }
      const blurredR = sums[0]! / 16;
      const blurredG = sums[1]! / 16;
      const blurredB = sums[2]! / 16;
      const target = (y * width + x) * 4;
      output[target] = clampByte(source[target]! * (1 - k) + blurredR * k);
      output[target + 1] = clampByte(source[target + 1]! * (1 - k) + blurredG * k);
      output[target + 2] = clampByte(source[target + 2]! * (1 - k) + blurredB * k);
      output[target + 3] = source[target + 3]!;
    }
  }
  return { ...image, frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'] };
}

function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
