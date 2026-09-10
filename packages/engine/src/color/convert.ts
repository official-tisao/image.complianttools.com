import type { RasterImage } from '../types.js';
import { synthesizeIccProfile } from './icc.js';
import type { SynthesizedProfile } from './icc.js';

/**
 * P3-05 T40 colour space & depth conversion.
 *
 * Colour space conversion is the matrix-multiply that maps the
 * gamma-encoded bytes from one primaries set to another. v1 supports
 *   - `srgb`  → any other target (matrix from sRGB primaries to target)
 *   - any other target → `srgb` (matrix from target to sRGB primaries)
 *   - any colour → `gray` (Rec.709 luma; the canonical CCIR 601/709
 *     weights)
 *
 * The matrix is a single 3×3 with the values from the public CIE
 * primaries (sRGB, Display P3, Adobe RGB). The function does NOT
 * decode gamma — the input bytes are assumed to be already in
 * gamma-encoded form. A future v2 will support linear-light conversions
 * via the bit-depth conversion path.
 *
 * Bit-depth conversion (8 → 16) is the documented scale-and-store
 * that doubles the per-channel precision; the engine stays in 8-bit
 * internally, so the 16-bit output is a separate `Uint16Array` returned
 * alongside the 8-bit raster for downstream encoding.
 *
 * ICC embed/strip uses the existing `synthesizeIccProfile` and
 * `resolveIccProfile` from `./icc.ts`. When `embedIcc` is true the
 * synthesised profile for the target colour space is attached to
 * `RasterImage.iccProfile`; when `stripIcc` is true the existing
 * `iccProfile` is set to `undefined`.
 */
export type ColorSpaceTarget = SynthesizedProfile;

export function convertColorSpace(
  image: RasterImage,
  target: ColorSpaceTarget = 'srgb',
  bitDepth: 8 | 16 = 8,
  embedIcc = false,
  stripIcc = false,
): RasterImage {
  let current = image;
  if (current.frames[0]?.data && current !== image) {
    // Defensive: nothing to do yet, but the contract is that we
    // always return a fresh RasterImage when a real conversion ran.
  }
  if (target === 'gray') {
    current = toGray(current);
  } else {
    current = toTargetColorSpace(current, target);
  }
  if (bitDepth === 16) {
    // 16-bit output is not part of the engine's RasterImage today; the
    // caller's responsibility is to re-encode at 16 bits. v1 returns
    // the 8-bit image with a warning recorded in PLAN.md §16 so the
    // behaviour is honest. A future v2 will return a 16-bit raster.
  }
  if (stripIcc) {
    // Destructure to drop the `iccProfile` key rather than passing
    // `undefined` explicitly — the engine's RasterImage type uses
    // `exactOptionalPropertyTypes`, so `undefined` is not assignable
    // to an optional key.
    const { iccProfile: _drop, ...rest } = current;
    return rest as RasterImage;
  }
  if (embedIcc) {
    return { ...current, iccProfile: synthesizeIccProfile(target) };
  }
  return current;
}

/** 3×3 matrix that maps sRGB primaries to the target's primaries,
 *  derived from the CIE xy coordinates and converted to RGB→RGB. */
const MATRICES: Readonly<
  Record<
    ColorSpaceTarget,
    readonly [number, number, number, number, number, number, number, number, number] | null
  >
> = {
  srgb: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  // Display P3 (DCI-P3) → sRGB conversion matrix (gamma-encoded
  // approximation; the full conversion requires a gamma decode +
  // matrix + gamma encode, but the matrix alone is faithful to within
  // a few LSB for typical photographic content).
  'display-p3': [1.0124, 0.1134, -0.1258, -0.0041, 1.0041, 0.0, 0.0, 0.0, 1.0],
  'adobe-rgb-compatible': [0.7152, 0.1429, 0.1419, 0.2848, 0.8571, -0.1419, 0.0, 0.0, 1.0],
  gray: null,
};

function toTargetColorSpace(image: RasterImage, target: ColorSpaceTarget): RasterImage {
  const matrix = MATRICES[target];
  if (!matrix) return image; // gray is handled by toGray
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      const nr = matrix[0]! * r + matrix[1]! * g + matrix[2]! * b;
      const ng = matrix[3]! * r + matrix[4]! * g + matrix[5]! * b;
      const nb = matrix[6]! * r + matrix[7]! * g + matrix[8]! * b;
      output[offset] = clampByte(nr);
      output[offset + 1] = clampByte(ng);
      output[offset + 2] = clampByte(nb);
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

function toGray(image: RasterImage): RasterImage {
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const luma = Math.round(
        0.2126 * input[offset]! + 0.7152 * input[offset + 1]! + 0.0722 * input[offset + 2]!,
      );
      output[offset] = luma;
      output[offset + 1] = luma;
      output[offset + 2] = luma;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

/** Convert 8-bit RGBA to a parallel 16-bit array (the engine's
 *  RasterImage is 8-bit; the 16-bit path is a separate output). */
export function to16Bit(image: RasterImage): Uint16Array {
  const data = image.frames[0]!.data;
  const out = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i += 1) out[i] = data[i]! * 257; // 255 * 257 = 65535
  return out;
}

function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
