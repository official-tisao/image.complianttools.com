import type { RasterImage } from '../../types.js';

/**
 * Sharpen: unsharp mask. `output = clamp(input + amount × (input − blur))`
 * where `blur` is a box-blurred version of the input over a window
 * sized `radius`. The `threshold` field masks out edges whose luma
 * difference is below the threshold, so the op sharpens only the
 * already-distinct features.
 *
 * The kernel radius is `Math.ceil(radius)`. The exported
 * `SHARPEN_HALO_FN` makes the halo explicit for `executeTiled`.
 */
export const SHARPEN_HALO_FN = (radius: number): number => Math.ceil(radius);

export function applySharpen(
  image: RasterImage,
  amount = 100,
  radius = 1,
  threshold = 0,
): RasterImage {
  if (amount <= 0) return image;
  const r = Math.max(1, Math.ceil(radius));
  const k = amount / 100;
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const sy = Math.max(0, Math.min(height - 1, y + dy));
          const off = (sy * width + sx) * 4;
          sumR += source[off]!;
          sumG += source[off + 1]!;
          sumB += source[off + 2]!;
          count += 1;
        }
      }
      const blurredR = sumR / count;
      const blurredG = sumG / count;
      const blurredB = sumB / count;
      const target = (y * width + x) * 4;
      const r0 = source[target]!;
      const g0 = source[target + 1]!;
      const b0 = source[target + 2]!;
      // Threshold gate: only edges above the luma difference get sharpened.
      const luma0 = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
      const lumaB = 0.2126 * blurredR + 0.7152 * blurredG + 0.0722 * blurredB;
      const gate = Math.abs(luma0 - lumaB) >= threshold ? 1 : 0;
      output[target] = clampByte(r0 + (r0 - blurredR) * k * gate);
      output[target + 1] = clampByte(g0 + (g0 - blurredG) * k * gate);
      output[target + 2] = clampByte(b0 + (b0 - blurredB) * k * gate);
      output[target + 3] = source[target + 3]!;
    }
  }
  return { ...image, frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'] };
}

function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
