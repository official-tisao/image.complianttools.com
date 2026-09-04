import type { RasterImage } from '../types.js';
import type { AdjustOptions } from '../schemas/options.js';
import { temperatureGains } from '../codecs/raw/develop.js';

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

/**
 * Contrast: pivot at 128, `v' = clamp(factor·(v − 128) + 128)` with
 * `factor = 259·(value + 255) / (255·(259 − value))`. `value` in −100…+100, default 0. Pixel-local.
 * This matches the authoritative `applyPixelLocalOptions` contrast formula.
 */
export function applyContrast(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const factor = (259 * (value + 255)) / (255 * (259 - value));
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      output[offset] = factor * (input[offset]! - 128) + 128;
      output[offset + 1] = factor * (input[offset + 1]! - 128) + 128;
      output[offset + 2] = factor * (input[offset + 2]! - 128) + 128;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/** Saturation: scale distance from Rec.709 luma. `value` in −100…+100, default 0. Pixel-local. */
export function applySaturation(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const s = 1 + value / 100;
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      // Rec.709 luma of the stored gamma-encoded bytes.
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      output[offset] = luma + (r - luma) * s;
      output[offset + 1] = luma + (g - luma) * s;
      output[offset + 2] = luma + (b - luma) * s;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/** Exposure: multiplicative `× 2^value`. `value` in −5…+5 EV, default 0. Pixel-local. */
export function applyExposure(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const multiplier = Math.pow(2, value);
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      output[offset] = input[offset]! * multiplier;
      output[offset + 1] = input[offset + 1]! * multiplier;
      output[offset + 2] = input[offset + 2]! * multiplier;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/** Gamma: `v' = 255·(v/255)^(1/value)`. `value` in 0.1…5.0, default 1.0 (identity). Pixel-local. */
export function applyGamma(image: RasterImage, value: number): RasterImage {
  if (value === 1) return image;
  const exponent = 1 / value;
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      output[offset] = 255 * Math.pow(input[offset]! / 255, exponent);
      output[offset + 1] = 255 * Math.pow(input[offset + 1]! / 255, exponent);
      output[offset + 2] = 255 * Math.pow(input[offset + 2]! / 255, exponent);
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/**
 * Temperature: white-balance RGB gains from the authoritative Tanner-Helland blackbody
 * approximation (`temperatureGains`, `value` in Kelvin 2000…50000, tint fixed at 0).
 * Applying the [`green/red`, 1, `green/blue`] gains directly shifts R and B; green is left
 * unchanged. Operates on stored gamma-encoded bytes. The `'detected'` sentinel is handled by
 * `applyAdjustments` (skipped) -- resolving it needs an ICC/EXIF temperature source that is not
 * wired up (P3-02.2), so no metadata detection is invented here.
 */
export function applyTemperature(image: RasterImage, value: number): RasterImage {
  const [redGain, , blueGain] = temperatureGains(value, 0);
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      output[offset] = input[offset]! * redGain;
      output[offset + 1] = input[offset + 1]!;
      output[offset + 2] = input[offset + 2]! * blueGain;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/**
 * Tint: green gain `2^(value/150)` (authoritative RAW tintScale). Positive tints greener, negative
 * tints magenta. R and B are left unchanged. `value` in −150…+150, default 0.
 */
export function applyTint(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const greenGain = Math.pow(2, value / 150);
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      output[offset] = input[offset]!;
      output[offset + 1] = input[offset + 1]! * greenGain;
      output[offset + 2] = input[offset + 2]!;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/**
 * Highlights: tonal lift/push on high luminance. `value` in −100…+100, default 0. Pixel-local.
 *
 * Exact mask (deterministic, documented): with `luma = 0.2126R + 0.7152G + 0.0722B` on the stored
 * bytes and `n = luma / 255`, `maskHi = smoothstep(0.55, 0.95, n)` where
 * `smoothstep(e0,e1,x) = clamp(t,0,1)²·(3 − 2·clamp(t,0,1))` with `t = (x−e0)/(e1−e0)`. Then
 * `v' = clamp(v · (1 + (value/100) · maskHi))`. Near zero in shadows, rising through midtones,
 * strongest in highlights.
 */
export function applyHighlights(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const amount = value / 100;
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const luma =
        0.2126 * input[offset]! + 0.7152 * input[offset + 1]! + 0.0722 * input[offset + 2]!;
      const mask = smoothstep(0.55, 0.95, luma / 255);
      const gain = 1 + amount * mask;
      output[offset] = input[offset]! * gain;
      output[offset + 1] = input[offset + 1]! * gain;
      output[offset + 2] = input[offset + 2]! * gain;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/**
 * Shadows: tonal lift/push on low luminance. `value` in −100…+100, default 0. Pixel-local.
 *
 * Exact mask (deterministic, documented): `maskSh = 1 − smoothstep(0.05, 0.45, n)` with `n = luma/255`
 * and the same `smoothstep` as highlights. Then `v' = clamp(v · (1 + (value/100) · maskSh))`.
 * Strongest in shadows, falling through midtones, ~0 in highlights.
 */
export function applyShadows(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const amount = value / 100;
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const luma =
        0.2126 * input[offset]! + 0.7152 * input[offset + 1]! + 0.0722 * input[offset + 2]!;
      const mask = 1 - smoothstep(0.05, 0.45, luma / 255);
      const gain = 1 + amount * mask;
      output[offset] = input[offset]! * gain;
      output[offset + 1] = input[offset + 1]! * gain;
      output[offset + 2] = input[offset + 2]! * gain;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/** Hermite smoothstep on the normalized input; edge0/edge1 on a 0…1 scale. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
