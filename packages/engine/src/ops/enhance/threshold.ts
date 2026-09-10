import type { RasterImage } from '../../types.js';
import { computeHistogram } from '../histogram.js';

/**
 * Threshold (B/W) — three modes:
 *   - `'off'` — no-op, returns the source raster.
 *   - numeric — fixed threshold in 0..255.
 *   - `'otsu'` — automatic threshold by Otsu's method (between-class
 *     variance maximisation over the luma histogram).
 *   - `'adaptive'` — Sauvola's local-mean-threshold algorithm, with
 *     `k = 0.2` and `R = 64` (the documented defaults from the
 *     original paper). Window radius is fixed at 7 px; halo = 7.
 *
 * The Sauvola window radius is exported as `SAUVOLA_HALO` so the
 * executor can pass the right halo when tiling.
 */
export const SAUVOLA_HALO = 7;
export type ThresholdMode = 'off' | 'otsu' | 'adaptive' | number;

export function applyThreshold(image: RasterImage, mode: ThresholdMode = 'off'): RasterImage {
  if (mode === 'off') return image;
  let t: number;
  let perPixel: Uint8ClampedArray | null = null;
  if (typeof mode === 'number') {
    t = mode;
  } else if (mode === 'otsu') {
    t = otsuThreshold(image);
    if (t < 0) return image; // zero-variance image; no-op per P8
  } else {
    // Adaptive (Sauvola) — we still need a global default `t` for the
    // pixel-local path, but the per-pixel map is what matters.
    perPixel = sauvolaThresholdMap(image, 0.2, 64);
    if (perPixel === null) return image;
    t = 128; // unused when perPixel is set, but the local type expects a number
  }

  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const luma = 0.2126 * input[offset]! + 0.7152 * input[offset + 1]! + 0.0722 * input[offset + 2]!;
      const local = perPixel !== null ? perPixel[offset >> 2]! : t;
      const value = luma >= local ? 255 : 0;
      output[offset] = value;
      output[offset + 1] = value;
      output[offset + 2] = value;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

/**
 * Otsu's method. Returns the luma threshold (0..255) that maximises
 * the between-class variance of the histogram. Returns -1 if the
 * image has zero variance (per P8, the caller treats that as a
 * no-op).
 */
export function otsuThreshold(image: RasterImage): number {
  const histogram = computeHistogram(image);
  const total = histogram.luminance.reduce((a, b) => a + b, 0);
  if (total === 0) return -1;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * (histogram.luminance[i] ?? 0);
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 0;
  for (let t = 0; t < 256; t += 1) {
    wB += histogram.luminance[t] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * (histogram.luminance[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    // `>=` rather than `>` is the canonical Otsu convention: any
    // threshold in the gap between two distinct bands yields the
    // same between-class variance, so we accept the first one.
    if (between >= maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Sauvola's local threshold map. Returns a per-pixel threshold as a
 * `Uint8ClampedArray` of length `width * height`, or `null` if the
 * image has zero variance (per P8, the caller treats that as a
 * no-op).
 *
 * Sauvola's formula: `t(x, y) = mean(x, y) · (1 + k · (sd(x, y) / R − 1))`
 * where `k = 0.2` and `R = 64` are the documented defaults, and
 * `mean` and `sd` are taken over a `(2W + 1)²` window with `W = 7`.
 */
export function sauvolaThresholdMap(
  image: RasterImage,
  k = 0.2,
  r = 64,
): Uint8ClampedArray | null {
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const luma = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      luma[y * width + x] = Math.round(
        0.2126 * source[off]! + 0.7152 * source[off + 1]! + 0.0722 * source[off + 2]!,
      );
    }
  }
  const W = SAUVOLA_HALO;
  // Integral image over luma and luma² so the window mean and variance
  // are O(1) per pixel.
  const integral = new Float64Array((width + 1) * (height + 1));
  const integralSq = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    let rowSumSq = 0;
    for (let x = 0; x < width; x += 1) {
      const v = luma[y * width + x]!;
      rowSum += v;
      rowSumSq += v * v;
      const offRow = y * (width + 1);
      integral[(offRow + x + 1)] = integral[offRow + x]! + rowSum;
      integralSq[(offRow + x + 1)] = integralSq[offRow + x]! + rowSumSq;
    }
  }
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - W);
      const x1 = Math.min(width - 1, x + W);
      const y0 = Math.max(0, y - W);
      const y1 = Math.min(height - 1, y + W);
      const a = integral[y0 * (width + 1) + x0]!;
      const b = integral[y0 * (width + 1) + (x1 + 1)]!;
      const c = integral[(y1 + 1) * (width + 1) + x0]!;
      const d = integral[(y1 + 1) * (width + 1) + (x1 + 1)]!;
      const aSq = integralSq[y0 * (width + 1) + x0]!;
      const bSq = integralSq[y0 * (width + 1) + (x1 + 1)]!;
      const cSq = integralSq[(y1 + 1) * (width + 1) + x0]!;
      const dSq = integralSq[(y1 + 1) * (width + 1) + (x1 + 1)]!;
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const mean = (a + d - b - c) / count;
      const variance = (aSq + dSq - bSq - cSq) / count - mean * mean;
      const sd = variance > 0 ? Math.sqrt(variance) : 0;
      out[y * width + x] = clampByte(mean * (1 + k * (sd / r - 1)));
    }
  }
  return out;
}

function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
