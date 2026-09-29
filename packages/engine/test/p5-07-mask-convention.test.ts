import { describe, it, expect } from 'vitest';
import {
  CANONICAL_MASK_BIT_DEPTH,
  createCanonicalMask,
  verifyMaskRange,
  maskPolarity,
  isCanonicalMask,
} from '../src/ai/mask-convention.js';

describe('P5-07 Mask Convention — canonical representation', () => {
  it('canonical bit depth is 8', () => {
    expect(CANONICAL_MASK_BIT_DEPTH).toBe(8);
  });

  it('canonical mask is 8-bit grayscale (bitDepth = 8, colorSpace = gray)', () => {
    const mask = createCanonicalMask(4, 4, new Uint8ClampedArray(16).fill(255));
    expect(mask.bitDepth).toBe(8);
    expect(mask.colorSpace).toBe('gray');
  });

  it('canonical mask enforces positive dimensions', () => {
    expect(() => createCanonicalMask(0, 10, new Uint8ClampedArray(10))).toThrow();
    expect(() => createCanonicalMask(10, -1, new Uint8ClampedArray(10))).toThrow();
  });

  it('canonical mask data length must match width * height', () => {
    expect(() => createCanonicalMask(2, 3, new Uint8ClampedArray(5))).toThrow(/expected 6/);
  });
});

describe('P5-07 Mask Convention — polarity', () => {
  it('0 (black) maps to preserve', () => {
    expect(maskPolarity(0)).toBe('preserve');
  });

  it('255 (white) maps to change', () => {
    expect(maskPolarity(255)).toBe('change');
  });

  it('intermediate grayscale values are neither preserve nor change', () => {
    expect(maskPolarity(128)).toBe('intermediate');
    expect(maskPolarity(1)).toBe('intermediate');
    expect(maskPolarity(254)).toBe('intermediate');
  });

  it('polarity contract holds for a deterministic 2x2 fixture', () => {
    // Black (0) at (0,0), white (255) at (1,0), black at (0,1), white at (1,1)
    const fixture = new Uint8ClampedArray([0, 255, 0, 255]);
    const mask = createCanonicalMask(2, 2, fixture);
    expect(maskPolarity(mask.data[0])).toBe('preserve');
    expect(maskPolarity(mask.data[1])).toBe('change');
    expect(maskPolarity(mask.data[2])).toBe('preserve');
    expect(maskPolarity(mask.data[3])).toBe('change');
  });
});

describe('P5-07 Mask Convention — boundary / internal API behavior', () => {
  it('mask passes through isCanonicalMask without polarity inversion', () => {
    const whiteMask = createCanonicalMask(3, 3, new Uint8ClampedArray(9).fill(255));
    expect(isCanonicalMask(whiteMask)).toBe(true);
    expect(verifyMaskRange(whiteMask)).toBe(true);
    // No adapter conversion applied yet; polarity stays white = change.
    expect(maskPolarity(whiteMask.data[0])).toBe('change');
  });

  it('black mask (all 0) passes through without inversion', () => {
    const blackMask = createCanonicalMask(3, 3, new Uint8ClampedArray(9).fill(0));
    expect(isCanonicalMask(blackMask)).toBe(true);
    expect(verifyMaskRange(blackMask)).toBe(true);
    expect(maskPolarity(blackMask.data[0])).toBe('preserve');
  });

  it('mixed grayscale fixture is accepted by internal API', () => {
    const mixed = new Uint8ClampedArray([0, 64, 128, 192, 255, 0, 128, 255, 0]);
    const mask = createCanonicalMask(3, 3, mixed);
    expect(isCanonicalMask(mask)).toBe(true);
    expect(verifyMaskRange(mask)).toBe(true);
    // Every value stays in original range — no inversion.
    expect(mask.data[0]).toBe(0);
    expect(mask.data[4]).toBe(255);
    expect(mask.data[3]).toBe(192);
  });

  it('canonical contract is unambiguous for adapters that have not been implemented yet', () => {
    // P5-08–P5-12 adapters are pending. This test asserts only the provider-neutral
    // contract that all future adapters must enforce, not any adapter-specific behavior.
    const contractMask = createCanonicalMask(64, 64, new Uint8ClampedArray(4096).fill(255));
    expect(isCanonicalMask(contractMask)).toBe(true);
    expect(verifyMaskRange(contractMask)).toBe(true);
  });
});
