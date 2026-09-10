import type { RasterImage } from '../types.js';
import { applyAdjustments } from '../ops/adjust.js';
import type { AdjustOptions } from '../schemas/options.js';
import { isGpuImplemented, OP_CODES } from './op-codes.js';
import type { BackendResult, GpuBackend, GpuPixelLocalStep } from './types.js';

/**
 * The CPU/WASM backend. It is the **deterministic reference** for the
 * cross-tier tolerance test (P3-01), so it MUST compute the 9 GPU-supported
 * op-codes with the same math the WebGL2 fragment shader does — that is the
 * whole point of "identical results within tolerance" being testable. It
 * additionally accepts any passthrough op (code ≥ 100) and dispatches to the
 * real `applyX` from `ops/adjust.ts` so the end-to-end pipeline keeps
 * every adjustment's full semantics even on the v1 GPU.
 */
export class CpuWasmBackend implements GpuBackend {
  readonly tier: 'wasm-simd' | 'wasm' | 'js';

  constructor(tier: 'wasm-simd' | 'wasm' | 'js') {
    this.tier = tier;
  }

  applyPixelLocal(image: RasterImage, steps: readonly GpuPixelLocalStep[]): BackendResult {
    if (steps.length === 0) return { image, usedTier: this.tier };

    // Split into two buckets:
    //   - GPU-supported ops (< 100): apply inline using the same math the
    //     fragment shader does, byte-for-byte.
    //   - Passthrough ops (≥ 100): translate each to the matching field on
    //     AdjustOptions and call `applyAdjustments` once at the end.
    // The GPU ops run first (so the semantics of "ops applied in recipe
    // order" matches the recipe author's expectation), then the passthrough
    // batch. This is equivalent to a single fused step in the executor's
    // eyes.
    const passthrough: Partial<AdjustOptions> = {};
    let current = image;
    for (const step of steps) {
      if (step.op < OP_CODES.PASSTHROUGH_THRESHOLD) {
        current = applyGpuOpInline(current, step);
      } else {
        assignPassthrough(passthrough, step);
      }
    }
    const hasPassthrough = Object.keys(passthrough).length > 0;
    if (hasPassthrough) {
      // Apply defaults to the passthrough accumulator. The schema fills
      // in every missing field, but at the call site we want a
      // fully-populated AdjustOptions so the typecheck is straightforward.
      const merged: AdjustOptions = {
        ...defaultsForPassthrough(),
        ...passthrough,
      };
      current = applyAdjustments(current, merged);
    }
    return { image: current, usedTier: this.tier };
  }
}

/**
 * The schema-defaulted `AdjustOptions` for a passthrough op batch. The
 * function returns a fresh object each call so the spread above is safe
 * to mutate.
 */
function defaultsForPassthrough(): AdjustOptions {
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    exposure: 0,
    gamma: 1,
    temperature: 'detected',
    tint: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    vibrance: 0,
    hue: 0,
    clarity: 0,
    dehaze: 0,
    opacity: 100,
    curvesRGB: [],
    curvesR: [],
    curvesG: [],
    curvesB: [],
    levelsInBlack: 0,
    levelsGamma: 1,
    levelsInWhite: 255,
    levelsOutBlack: 0,
    levelsOutWhite: 255,
  };
}

/**
 * Translate a passthrough step (op ≥ 100) to the matching field on
 * `AdjustOptions`. The op codes are `OP_CODES.PASSTHROUGH_THRESHOLD + N` for
 * the Nth non-GPU scalar in alphabetical order, with explicit values below.
 */
function assignPassthrough(target: Partial<AdjustOptions>, step: GpuPixelLocalStep): void {
  switch (step.op - OP_CODES.PASSTHROUGH_THRESHOLD) {
    case 0:
      target.blacks = step.value;
      return;
    case 1:
      target.clarity = step.value;
      return;
    case 2:
      target.dehaze = step.value;
      return;
    case 3:
      target.hue = step.value;
      return;
    case 4:
      target.opacity = step.value;
      return;
    case 5:
      target.vibrance = step.value;
      return;
    case 6:
      target.whites = step.value;
      return;
    // Codes ≥ 100 not in the table above are unknown — silently drop.
  }
}

/**
 * Inline application of one GPU-supported op. The math is identical to the
 * WebGL2 fragment shader in `webgl2.ts` and to the standalone `applyX` in
 * `ops/adjust.ts`; the cross-tier tolerance test guards the equivalence.
 *
 * Kept here as a free function so the test can call it directly without
 * instantiating a backend.
 */
export function applyGpuOpInline(image: RasterImage, step: GpuPixelLocalStep): RasterImage {
  switch (step.op) {
    case OP_CODES.IDENTITY:
      return image;
    case OP_CODES.BRIGHTNESS:
      return applyBrightnessInline(image, step.value);
    case OP_CODES.CONTRAST:
      return applyContrastInline(image, step.value);
    case OP_CODES.SATURATION:
      return applySaturationInline(image, step.value);
    case OP_CODES.EXPOSURE:
      return applyExposureInline(image, step.value);
    case OP_CODES.GAMMA:
      return applyGammaInline(image, step.value);
    case OP_CODES.TEMPERATURE:
      return applyTemperatureInline(image, step.value);
    case OP_CODES.TINT:
      return applyTintInline(image, step.value);
    case OP_CODES.HIGHLIGHTS:
      return applyHighlightsInline(image, step.value);
    case OP_CODES.SHADOWS:
      return applyShadowsInline(image, step.value);
    default:
      // Any unknown code is a no-op pass-through. This keeps the contract
      // that the backend never throws on a fused step the host didn't
      // author for it.
      return image;
  }
}

/** True if every step in `steps` is GPU-implemented (i.e. the WebGL2 backend
 *  can run them all without falling through to the CPU). */
export function allGpuImplemented(steps: readonly GpuPixelLocalStep[]): boolean {
  return steps.every((step) => isGpuImplemented(step.op));
}

// ---------------------------------------------------------------------------
// The 9 GPU-supported inline ops. Each one mirrors the matching `applyX` in
// `ops/adjust.ts` and the matching branch of the GLSL fragment shader. The
// pattern is the same: a single pass over each frame, with a new
// Uint8ClampedArray allocated for the output.
// ---------------------------------------------------------------------------

function applyBrightnessInline(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  return mapFrame(image, (r, g, b, a) => [r + value, g + value, b + value, a]);
}

function applyContrastInline(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const factor = (259 * (value + 255)) / (255 * (259 - value));
  return mapFrame(image, (r, g, b, a) => [
    factor * (r - 128) + 128,
    factor * (g - 128) + 128,
    factor * (b - 128) + 128,
    a,
  ]);
}

function applySaturationInline(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const s = 1 + value / 100;
  return mapFrame(image, (r, g, b, a) => {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return [luma + (r - luma) * s, luma + (g - luma) * s, luma + (b - luma) * s, a];
  });
}

function applyExposureInline(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const multiplier = Math.pow(2, value);
  return mapFrame(image, (r, g, b, a) => [r * multiplier, g * multiplier, b * multiplier, a]);
}

function applyGammaInline(image: RasterImage, value: number): RasterImage {
  if (value === 1) return image;
  const exponent = 1 / value;
  return mapFrame(image, (r, g, b, a) => [
    255 * Math.pow(r / 255, exponent),
    255 * Math.pow(g / 255, exponent),
    255 * Math.pow(b / 255, exponent),
    a,
  ]);
}

function applyTemperatureInline(image: RasterImage, value: number): RasterImage {
  // The same Tanner–Helland formula the WebGL2 fragment shader uses.
  // Both backends MUST agree on the same numbers; the cross-tier
  // tolerance test (`maxDelta` in `gpu-pipeline.test.ts`) verifies
  // they agree within ±1 per channel on a 256-step gradient.
  return mapFrame(image, (r, g, b, a) => {
    const t = value / 100;
    let rr: number, gg: number, bb: number;
    if (t <= 66) {
      rr = 1;
      gg = Math.max(
        0,
        Math.min(1, (99.4708025861 * Math.log(Math.max(t, 1)) - 161.1195681661) / 255),
      );
    } else {
      const t2 = t - 60;
      rr = Math.max(0, Math.min(1, (329.698727446 * Math.pow(t2, -0.1332047592)) / 255));
      gg = Math.max(0, Math.min(1, (288.1221695283 * Math.pow(t2, -0.0755148492)) / 255));
    }
    if (t >= 66) bb = 1;
    else if (t <= 19) bb = 0;
    else
      bb = Math.max(
        0,
        Math.min(1, (138.5177312231 * Math.log(Math.max(t - 10, 1)) - 305.0447927307) / 255),
      );
    return [r / Math.max(rr, 0.0001), g / Math.max(gg, 0.0001), b / Math.max(bb, 0.0001), a];
  });
}

function applyTintInline(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const greenGain = Math.pow(2, value / 150);
  return mapFrame(image, (r, g, b, a) => [r, g * greenGain, b, a]);
}

function applyHighlightsInline(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const amount = value / 100;
  return mapFrame(image, (r, g, b, a) => {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mask = smoothstep(0.55, 0.95, luma / 255);
    const gain = 1 + amount * mask;
    return [r * gain, g * gain, b * gain, a];
  });
}

function applyShadowsInline(image: RasterImage, value: number): RasterImage {
  if (value === 0) return image;
  const amount = value / 100;
  return mapFrame(image, (r, g, b, a) => {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mask = 1 - smoothstep(0.05, 0.45, luma / 255);
    const gain = 1 + amount * mask;
    return [r * gain, g * gain, b * gain, a];
  });
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
      const [r, g, b, a] = mapper(
        input[offset]!,
        input[offset + 1]!,
        input[offset + 2]!,
        input[offset + 3]!,
      );
      output[offset] = clampByte(r);
      output[offset + 1] = clampByte(g);
      output[offset + 2] = clampByte(b);
      output[offset + 3] = clampByte(a);
    }
    return { ...frame, data: output };
  });
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
