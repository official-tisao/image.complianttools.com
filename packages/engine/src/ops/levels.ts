import type { RasterImage } from '../types.js';
import { clampByte } from '../filters/framework.js';

/**
 * Levels options — input range remap + output range remap with mid-tone gamma. The contract is
 * the canonical Photoshop-style formula:
 *
 *   v' = ((v − inBlack) / (inWhite − inBlack))^gamma × (outWhite − outBlack) + outBlack
 *
 * All five fields default to the identity (in 0..255, gamma 1, out 0..255). When every field is
 * at its default the operation is a no-op and `applyLevels` returns the source raster unchanged.
 *
 *   inBlack  = 0
 *   inWhite  = 255
 *   outBlack = 0
 *   outWhite = 255
 *   gamma    = 1
 */
export interface LevelsOptions {
  readonly inBlack: number;
  readonly inWhite: number;
  readonly outBlack: number;
  readonly outWhite: number;
  readonly gamma: number;
}

export const IDENTITY_LEVELS: LevelsOptions = Object.freeze({
  inBlack: 0,
  inWhite: 255,
  outBlack: 0,
  outWhite: 255,
  gamma: 1,
});

/** True when the levels options collapse to the identity (no-op). */
export function isIdentityLevels(options: LevelsOptions): boolean {
  return (
    options.inBlack === 0 &&
    options.inWhite === 255 &&
    options.outBlack === 0 &&
    options.outWhite === 255 &&
    options.gamma === 1
  );
}

/**
 * Build a 256-entry lookup table from levels options. The table is the integer byte value
 * that each input byte maps to. Useful so the levels UI can preview the curve in O(1) per
 * pixel rather than recomputing the formula.
 */
export function buildLevelsLut(options: LevelsOptions): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  if (isIdentityLevels(options)) {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }
  const inSpan = Math.max(1, options.inWhite - options.inBlack);
  const outSpan = options.outWhite - options.outBlack;
  const gamma = options.gamma;
  for (let v = 0; v < 256; v += 1) {
    const normalized = (v - options.inBlack) / inSpan;
    const clamped = Math.max(0, Math.min(1, normalized));
    const exponent = 1 / gamma;
    const out = clamped ** exponent * outSpan + options.outBlack;
    lut[v] = clampByte(out);
  }
  return lut;
}

/**
 * Apply levels to `image`. Returns the same instance when `isIdentityLevels(options)` is true.
 * Alpha is preserved exactly. The operation is pixel-local and tile-safe.
 */
export function applyLevels(image: RasterImage, options: LevelsOptions): RasterImage {
  if (isIdentityLevels(options)) return image;
  const lut = buildLevelsLut(options);
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      output[offset] = lut[input[offset]!]!;
      output[offset + 1] = lut[input[offset + 1]!]!;
      output[offset + 2] = lut[input[offset + 2]!]!;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}
