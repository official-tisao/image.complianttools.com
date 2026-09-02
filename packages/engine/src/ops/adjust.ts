import type { RasterImage } from '../types.js';
import type { AdjustOptions } from '../schemas/options.js';

/**
 * Phase 3 adjustment foundation.
 *
 * Each `applyX(image, value)` is the canonical, deterministic CPU reference for one adjustment. The
 * mathematical formulas are intentionally NOT implemented here -- they are added individually in
 * later P3-02 tasks. What this module establishes is the API shape, the composition contract, and the
 * invariants that keep the CPU path authoritative for GPU parity:
 *
 * - pixel-local (implemented via `mapPixels` when the math lands; `boxBlur`/`executeTiled` never needed
 *   because no adjustment reads a neighbourhood),
 * - deterministic (fixed evaluation order, no random state, no hidden global state),
 * - alpha unchanged (the RGB transform never alters the alpha channel),
 * - preservative: the returned `RasterImage` keeps `width`, `height`, `colorSpace`, `bitDepth`,
 *   `premultipliedAlpha`, `iccProfile`, and `encodedMetadata` (spread the source and replace only the
 *   frame data, or return the source instance unchanged when `value` is at its default),
 * - minimal allocation: return the *same* `RasterImage` instance (no copy) when `value` is at its
 *   default so the all-defaults path is a true no-op,
 * - tile-safe: nothing here reads neighbouring pixels, so it composes with the existing
 *   `pixel-local` fusion in `compile.ts` and `executeTiled(image, op, 512, 0)`.
 *
 * None of these functions is wired into `execute.ts` yet. `applyAdjustments` is the single entry point
 * that a step (parsed through `AdjustOptionsSchema`) will call once the formulas are implemented.
 */

/** Brightness: additive offset, `v' = clamp(v + value)`. `value` in −100…+100, default 0. Pixel-local. */
export function applyBrightness(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      // Uint8ClampedArray assignment applies clamps [0,255] and ToUint8Clamp rounding.
      output[offset] = input[offset]! + value;
      output[offset + 1] = input[offset + 1]! + value;
      output[offset + 2] = input[offset + 2]! + value;
      // Alpha is preserved exactly and is never shifted by the brightness offset.
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/** Contrast: pivot-around-mid S-curve. `value` in −100…+100, default 0. Formula implemented later. */
export function applyContrast(image: RasterImage, value: number): RasterImage {
  void value;
  return image;
}

/** Saturation: scale distance from luma. `value` in −100…+100, default 0. Formula implemented later. */
export function applySaturation(image: RasterImage, value: number): RasterImage {
  void value;
  return image;
}

/** Exposure: multiplicative `× 2^value`. `value` in −5…+5 EV, default 0. Formula implemented later. */
export function applyExposure(image: RasterImage, value: number): RasterImage {
  void value;
  return image;
}

/** Gamma: power curve. `value` in 0.1…5.0, default 1.0 (identity). Formula implemented later. */
export function applyGamma(image: RasterImage, value: number): RasterImage {
  void value;
  return image;
}

/** Temperature: blackbody white-point shift. `value` in Kelvin 2000…50000. Formula implemented later. */
export function applyTemperature(image: RasterImage, value: number): RasterImage {
  void value;
  return image;
}

/** Tint: green↔magenta axis. `value` in −150…+150, default 0 (positive = green). Formula later. */
export function applyTint(image: RasterImage, value: number): RasterImage {
  void value;
  return image;
}

/** Highlights: tonal lift/push on high luminance. `value` in −100…+100, default 0. Formula later. */
export function applyHighlights(image: RasterImage, value: number): RasterImage {
  void value;
  return image;
}

/** Shadows: tonal lift/push on low luminance. `value` in −100…+100, default 0. Formula later. */
export function applyShadows(image: RasterImage, value: number): RasterImage {
  void value;
  return image;
}

/**
 * Applies a parsed `AdjustOptions` object to an image, returning a new raster when any adjustment is
 * active and the identical source instance otherwise (defaults are a no-op). `temperature` uses the
 * `'detected'` sentinel only as a placeholder -- resolving it to an actual Kelvin value needs a source
 * ICC/EXIF metadata source that is not wired up yet (see P3-02.2 "detected" integration). Until the
 * formulas are implemented each active adjustment is a pass-through, so this currently returns the
 * source unchanged.
 */
export function applyAdjustments(image: RasterImage, options: AdjustOptions): RasterImage {
  let current = image;
  if (options.brightness !== 0) current = applyBrightness(current, options.brightness);
  if (options.contrast !== 0) current = applyContrast(current, options.contrast);
  if (options.saturation !== 0) current = applySaturation(current, options.saturation);
  if (options.exposure !== 0) current = applyExposure(current, options.exposure);
  if (options.gamma !== 1) current = applyGamma(current, options.gamma);
  if (options.temperature !== 'detected') current = applyTemperature(current, options.temperature);
  if (options.tint !== 0) current = applyTint(current, options.tint);
  if (options.highlights !== 0) current = applyHighlights(current, options.highlights);
  if (options.shadows !== 0) current = applyShadows(current, options.shadows);
  return current;
}
