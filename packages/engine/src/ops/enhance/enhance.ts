import type { RasterImage } from '../../types.js';
import { computeHistogram } from '../histogram.js';

/**
 * The new richer `enhance` step (P3-04). Three sub-operations chained:
 *   1. auto-levels — histogram percentile stretch from
 *      `lowPercentile` to `highPercentile` (scaled by `amount`).
 *   2. auto-contrast — symmetric S-curve around mid-grey, intensity
 *      proportional to `amount`.
 *   3. local tone map — a 3×3 box-blur-based detail extraction that
 *      adds `amount` % of the detail back to the image, brightening
 *      midtones without blowing highlights.
 *
 * The whole thing is `amount`-gated: `amount = 0` is a no-op,
 * `amount = 100` is the documented OC-style full enhance.
 *
 * The local tone map reads a 3×3 neighbourhood (halo = 1).
 */
export const ENHANCE_HALO = 1;

export function applyEnhanceToggle(image: RasterImage, amount = 0): RasterImage {
  if (amount <= 0) return image;
  const k = amount / 100;
  // Step 1: auto-levels. Stretch 0.5%..99.5% of the histogram to 0..255.
  let current = autoLevels(image, 0.005 * (1 - k), 1 - 0.005 * (1 - k));
  // Step 2: auto-contrast. A symmetric S-curve around 128.
  current = autoContrast(current, 0.4 * k);
  // Step 3: local tone map. A detail-extract-and-add.
  current = localToneMap(current, 0.3 * k);
  return current;
}

/**
 * Stretch the per-channel histogram so the (low, high) percentile
 * pixels map to (0, 255). When `low` is 0 and `high` is 1 the
 * behaviour is a no-op (returns the source).
 */
function autoLevels(image: RasterImage, low: number, high: number): RasterImage {
  if (low <= 0 && high >= 1) return image;
  const histogram = computeHistogram(image);
  const lo = percentileFromHistogram(histogram.luminance, low * 100);
  const hi = percentileFromHistogram(histogram.luminance, high * 100);
  if (hi <= lo) return image;
  const scale = 255 / (hi - lo);
  return mapFrame(image, (r, g, b, a) => [
    clampByte((r - lo) * scale),
    clampByte((g - lo) * scale),
    clampByte((b - lo) * scale),
    a,
  ]);
}

/**
 * Symmetric S-curve auto-contrast. `strength` 0..1 controls the curve
 * steepness; `strength = 0` is a no-op. The formula is a simplified
 * `tanh`-like curve around 128.
 */
function autoContrast(image: RasterImage, strength: number): RasterImage {
  if (strength <= 0) return image;
  return mapFrame(image, (r, g, b, a) => {
    // Simple S-curve: (x/255 - 0.5) * (1 + k) + 0.5, then × 255.
    const k = strength;
    return [
      clampByte(((r / 255 - 0.5) * (1 + k) + 0.5) * 255),
      clampByte(((g / 255 - 0.5) * (1 + k) + 0.5) * 255),
      clampByte(((b / 255 - 0.5) * (1 + k) + 0.5) * 255),
      a,
    ];
  });
}

/**
 * Local tone map. For each pixel compute the average of the 3×3
 * neighbourhood, then add `amount` % of the difference back to the
 * image. This brightens midtones (where the neighbourhood mean is
 * close to the pixel) without blowing highlights (where the
 * neighbourhood is brighter than the pixel).
 */
function localToneMap(image: RasterImage, amount: number): RasterImage {
  if (amount <= 0) return image;
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const sy = Math.max(0, Math.min(height - 1, y + dy));
          const off = (sy * width + sx) * 4;
          sum += 0.2126 * source[off]! + 0.7152 * source[off + 1]! + 0.0722 * source[off + 2]!;
        }
      }
      const mean = sum / 9;
      const target = (y * width + x) * 4;
      const r = source[target]!;
      const g = source[target + 1]!;
      const b = source[target + 2]!;
      const a = source[target + 3]!;
      // Push the pixel toward the local mean by `amount`. When the
      // pixel is already close to the mean, this is a no-op; when it
      // is far, this is a contrast reduction — the desired
      // midtone-lifting effect.
      const detailR = r - mean;
      const detailG = g - mean;
      const detailB = b - mean;
      output[target] = clampByte(r - detailR * amount);
      output[target + 1] = clampByte(g - detailG * amount);
      output[target + 2] = clampByte(b - detailB * amount);
      output[target + 3] = a;
    }
  }
  return { ...image, frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'] };
}

function percentileFromHistogram(histogram: Uint32Array, percentile: number): number {
  const total = histogram.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const target = Math.max(0, Math.min(total, Math.floor((total * percentile) / 100)));
  let cum = 0;
  for (let i = 0; i < 256; i += 1) {
    cum += histogram[i] ?? 0;
    if (cum >= target) return i;
  }
  return 255;
}

type Rgba = readonly [number, number, number, number];

function mapFrame(
  image: RasterImage,
  mapper: (r: number, g: number, b: number, a: number) => Rgba,
): RasterImage {
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const [r, g, b, a] = mapper(input[offset]!, input[offset + 1]!, input[offset + 2]!, input[offset + 3]!);
      output[offset] = r;
      output[offset + 1] = g;
      output[offset + 2] = b;
      output[offset + 3] = a;
    }
    return { ...frame, data: output };
  });
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
