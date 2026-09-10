import type { RasterImage } from '../types.js';
import type { AdjustOptions } from '../schemas/options.js';
import { temperatureGains } from '../codecs/raw/develop.js';
import { applyCurves } from './curves.js';
import { applyLevels, isIdentityLevels } from './levels.js';

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
 * - alpha unchanged (the RGB transform never alters the alpha channel, except `applyOpacity` which
 *   is the explicit, user-requested exception),
 * - preservative: the returned `RasterImage` keeps `width`, `height`, `colorSpace`, `bitDepth`,
 *   `premultipliedAlpha`, `iccProfile`, and `encodedMetadata` (spread the source and replace only the
 *   frame data, or return the source instance unchanged when `value` is at its default),
 * - minimal allocation: return the *same* `RasterImage` instance (no copy) when `value` is at its
 *   default so the all-defaults path is a true no-op,
 * - tile-safe: nothing here reads neighbouring pixels, so it composes with the existing
 *   `pixel-local` fusion in `compile.ts` and `executeTiled(image, op, 512, 0)`.
 *
 * The two exceptions are `applyClarity` and `applyDehaze`, which read a 3×3 / 7×7 neighbourhood
 * and are therefore routed through `executeTiled` in `pipeline/execute.ts` with a halo. They are
 * documented inline.
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

/**
 * Whites: tonal lift/push on the topmost luminance band. `value` in −100…+100, default 0. Pixel-local.
 *
 * Mask: `maskW = smoothstep(0.85, 1.0, luma/255)`. This is the symmetric counterpart of
 * `applyBlacks`. At `luma = 255` the mask is 1.0; at `luma ≤ 217` it is 0.0. The formula is the
 * same as highlights: `v' = v · (1 + (value/100) · maskW)`.
 */
export function applyWhites(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const amount = value / 100;
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const luma =
        0.2126 * input[offset]! + 0.7152 * input[offset + 1]! + 0.0722 * input[offset + 2]!;
      const mask = smoothstep(0.85, 1.0, luma / 255);
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
 * Blacks: tonal lift/push on the lowest luminance band. `value` in −100…+100, default 0. Pixel-local.
 *
 * Mask: `maskB = 1 − smoothstep(0.0, 0.15, luma/255)`. Symmetric counterpart of `applyWhites`. At
 * `luma = 0` the mask is 1.0; at `luma ≥ 38` it is 0.0. Formula mirrors highlights/shadows.
 */
export function applyBlacks(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const amount = value / 100;
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const luma =
        0.2126 * input[offset]! + 0.7152 * input[offset + 1]! + 0.0722 * input[offset + 2]!;
      const mask = 1 - smoothstep(0.0, 0.15, luma / 255);
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
 * Vibrance: intelligent saturation that boosts less-saturated colours more than already-saturated
 * ones. `value` in −100…+100, default 0. Pixel-local.
 *
 * Definition: for each pixel let `c = (max(R,G,B) − min(R,G,B)) / 255` (a 0..1 "colourfulness"
 * proxy) and `s = 1 + value/100`. We apply a per-channel pull toward luma weighted by `(1 − c)`,
 * so already-saturated channels (skin tones, skies) change less. The formula reduces to
 * saturation when `c = 1` and to a near-no-op when `c = 0`.
 */
export function applyVibrance(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const s = value / 100;
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const c = Math.max(0, (maxC - minC) / 255);
      const weight = 1 - c;
      const k = 1 + s * weight;
      output[offset] = luma + (r - luma) * k;
      output[offset + 1] = luma + (g - luma) * k;
      output[offset + 2] = luma + (b - luma) * k;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/**
 * Hue: rotate the chroma vector around the Rec.709 luma axis by `value` degrees. `value` in
 * −180…+180, default 0. Pixel-local.
 *
 * This is the canonical "hue rotation in YIQ" trick. We project (R,G,B) to the (R−Y, B−Y) plane,
 * apply a 2×2 rotation by `θ = value·π/180`, and recombine. Green is left unchanged. Fully-grey
 * pixels are unchanged because the chroma vector is the zero vector.
 */
export function applyHue(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const theta = (value * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const cr = r - y;
      const cb = b - y;
      const newR = y + cr * cos - cb * sin;
      const newB = y + cr * sin + cb * cos;
      output[offset] = newR;
      output[offset + 1] = g;
      output[offset + 2] = newB;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  }) as unknown as RasterImage['frames'];
  return { ...image, frames };
}

/**
 * Clarity: local-contrast boost via a 3×3 box-blur "large-radius" mask subtracted from the
 * original (a.k.a. unsharp mask with radius=1). `value` in −100…+100, default 0.
 *
 * This is a *kernel* op, not pixel-local: each output pixel reads a 3×3 neighbourhood. The
 * pipeline routes it through `executeTiled` with halo = 1 in `execute.ts` (P1-04). The formula is
 *
 *   blurred = (1/9) · Σ_{(dx,dy)∈{-1,0,1}²} input(x+dx, y+dy)
 *   detail  = input − blurred
 *   output  = clamp(input + (value/100) · detail · 2)
 *
 * The `·2` gain on `detail` is a calibration constant chosen so `value = 100` produces a
 * visibly strong (but not destructive) clarity boost on a typical photo. Negative `value` softens
 * the image (a small Gaussian-like blur).
 */
export function applyClarity(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const k = (value / 100) * 2;
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const sy = Math.max(0, Math.min(height - 1, y + dy));
          const off = (sy * width + sx) * 4;
          sumR += source[off]!;
          sumG += source[off + 1]!;
          sumB += source[off + 2]!;
        }
      }
      const blurredR = sumR / 9;
      const blurredG = sumG / 9;
      const blurredB = sumB / 9;
      const target = (y * width + x) * 4;
      const r = source[target]!;
      const g = source[target + 1]!;
      const b = source[target + 2]!;
      output[target] = clampByte(r + (r - blurredR) * k);
      output[target + 1] = clampByte(g + (g - blurredG) * k);
      output[target + 2] = clampByte(b + (b - blurredB) * k);
      output[target + 3] = source[target + 3]!;
    }
  }
  return {
    ...image,
    frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'],
  };
}

/** Radius used by `applyDehaze`. The pipeline uses this in the halo argument of `executeTiled`. */
export const DEHAZE_RADIUS = 7;

/**
 * Dehaze: subtract the local mean (a small-radius box blur) from the pixel, scaled by `value`.
 * This is a *local-mean-subtraction* filter, **not** the He et al. dark-channel-prior algorithm
 * (which is excluded pending clearance — see README §25.3.2). `value` in −100…+100, default 0.
 *
 *   localMean = (1/N) · Σ input in a (2R+1)×(2R+1) window
 *   detail    = input − localMean
 *   output    = clamp(input + (value/100) · detail)
 *
 * The kernel radius is fixed at 7 px; positive `value` sharpens local contrast (a "dehaze"
 * effect on hazy photos), negative `value` softens.
 */
export function applyDehaze(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const radius = DEHAZE_RADIUS;
  const k = value / 100;
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
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const sy = Math.max(0, Math.min(height - 1, y + dy));
          const off = (sy * width + sx) * 4;
          sumR += source[off]!;
          sumG += source[off + 1]!;
          sumB += source[off + 2]!;
          count += 1;
        }
      }
      const meanR = sumR / count;
      const meanG = sumG / count;
      const meanB = sumB / count;
      const target = (y * width + x) * 4;
      const r = source[target]!;
      const g = source[target + 1]!;
      const b = source[target + 2]!;
      output[target] = clampByte(r + (r - meanR) * k);
      output[target + 1] = clampByte(g + (g - meanG) * k);
      output[target + 2] = clampByte(b + (b - meanB) * k);
      output[target + 3] = source[target + 3]!;
    }
  }
  return {
    ...image,
    frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'],
  };
}

/** Local byte clamp; duplicated from `filters/framework.ts` to avoid a one-line dependency. */
function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Opacity: scale the alpha channel by `value / 100`. `value` in 0…100, default 100 (identity).
 * The default returns the source raster unchanged. This is the only adjustment that touches
 * alpha; it is the user's explicit request, not a side effect of the RGB transform.
 */
export function applyOpacity(image: RasterImage, value: number): RasterImage {
  if (value === 100) return image;
  const scale = value / 100;
  const frames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      output[offset] = input[offset]!;
      output[offset + 1] = input[offset + 1]!;
      output[offset + 2] = input[offset + 2]!;
      output[offset + 3] = Math.round(input[offset + 3]! * scale);
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
 * Applies a parsed `AdjustOptions` object to an image, returning a new raster when any adjustment
 * is active and the identical source instance otherwise (all defaults are a no-op). The fixed
 * evaluation order is documented in README §6.7:
 *
 *   brightness → contrast → saturation → exposure → gamma → temperature → tint → vibrance →
 *   hue → highlights → shadows → whites → blacks → clarity → dehaze → opacity → curves → levels
 *
 * `temperature` uses the `'detected'` sentinel only as a placeholder — resolving it to an actual
 * Kelvin value needs a source ICC/EXIF metadata source that is not wired up yet (see P3-02.2
 * "detected" integration). Curves and levels are last so they layer on top of the scalar
 * adjustments; the UI exposes them as separate controls in the same `AdjustOptions` step.
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
  if (options.vibrance !== 0) current = applyVibrance(current, options.vibrance);
  if (options.hue !== 0) current = applyHue(current, options.hue);
  if (options.highlights !== 0) current = applyHighlights(current, options.highlights);
  if (options.shadows !== 0) current = applyShadows(current, options.shadows);
  if (options.whites !== 0) current = applyWhites(current, options.whites);
  if (options.blacks !== 0) current = applyBlacks(current, options.blacks);
  if (options.clarity !== 0) current = applyClarity(current, options.clarity);
  if (options.dehaze !== 0) current = applyDehaze(current, options.dehaze);
  if (options.opacity !== 100) current = applyOpacity(current, options.opacity);
  if (
    options.curvesRGB.length > 0 ||
    options.curvesR.length > 0 ||
    options.curvesG.length > 0 ||
    options.curvesB.length > 0
  ) {
    current = applyCurves(current, {
      rgb: options.curvesRGB,
      r: options.curvesR,
      g: options.curvesG,
      b: options.curvesB,
    });
  }
  const levelsOptions = {
    inBlack: options.levelsInBlack,
    inWhite: options.levelsInWhite,
    outBlack: options.levelsOutBlack,
    outWhite: options.levelsOutWhite,
    gamma: options.levelsGamma,
  };
  if (!isIdentityLevels(levelsOptions)) current = applyLevels(current, levelsOptions);
  return current;
}
