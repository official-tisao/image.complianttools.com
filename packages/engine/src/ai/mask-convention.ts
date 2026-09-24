/**
 * P5-07 — Mask Convention (canonical internal representation).
 *
 * Providers disagree on mask polarity (README §13.4):
 * - Our internal convention: 8-bit grayscale, white (255) = area to change, black (0) = preserve.
 * - Per-adapter conversion happens in the adapter's `run()` and is unit-tested per adapter (P5-08–P5-12).
 *
 * This module defines the canonical contract only — no provider-specific conversion yet.
 */

/** Valid bit depth for a canonical mask. */
export const CANONICAL_MASK_BIT_DEPTH = 8 as const;

/** Color space for a canonical mask — grayscale only. */
export type CanonicalMaskColorSpace = 'gray';

/** Canonical internal mask representation.
 *
 * Contract:
 * - 8-bit grayscale (`bitDepth` must be 8).
 * - `0` / black = area to preserve.
 * - `255` / white = area to change.
 * - `RasterImage` with a single `Frame` whose `data` is `Uint8ClampedArray`.
 */
export interface CanonicalMask {
  readonly width: number;
  readonly height: number;
  readonly colorSpace: CanonicalMaskColorSpace;
  readonly bitDepth: typeof CANONICAL_MASK_BIT_DEPTH;
  readonly data: Uint8ClampedArray; // length === width * height
}

/** Build a canonical mask from raw grayscale bytes.
 * Enforces 8-bit, grayscale, and exact dimension match.
 */
export function createCanonicalMask(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): CanonicalMask {
  if (width <= 0 || height <= 0) {
    throw new Error(`Canonical mask dimensions must be positive, got ${width}x${height}`);
  }
  const expectedLength = width * height;
  if (data.length !== expectedLength) {
    throw new Error(
      `Canonical mask data length (${data.length}) does not match dimensions ${width}x${height} (expected ${expectedLength})`,
    );
  }
  return {
    width,
    height,
    colorSpace: 'gray',
    bitDepth: CANONICAL_MASK_BIT_DEPTH,
    data: new Uint8ClampedArray(data),
  };
}

/** Verify that every pixel in a canonical mask is within the 0..255 grayscale range.
 * Always true for Uint8ClampedArray, but kept for defensive verification.
 */
export function verifyMaskRange(mask: CanonicalMask): boolean {
  for (let i = 0; i < mask.data.length; i++) {
    const v = mask.data[i];
    if (v < 0 || v > 255) return false;
  }
  return true;
}

/** Read polarity of a pixel:
 * - 0 → preserve (black)
 * - 255 → change (white)
 * Any intermediate value is valid grayscale between the two poles.
 */
export function maskPolarity(pixelValue: number): 'preserve' | 'change' | 'intermediate' {
  if (pixelValue === 0) return 'preserve';
  if (pixelValue === 255) return 'change';
  return 'intermediate';
}

/** Return true if the mask respects the canonical convention:
 * 8-bit grayscale and exactly width*height bytes.
 */
export function isCanonicalMask(mask: CanonicalMask): boolean {
  return (
    mask.colorSpace === 'gray' &&
    mask.bitDepth === CANONICAL_MASK_BIT_DEPTH &&
    mask.width > 0 &&
    mask.height > 0 &&
    mask.data.length === mask.width * mask.height
  );
}
