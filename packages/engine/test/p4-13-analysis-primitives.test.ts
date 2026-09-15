import { describe, expect, it } from 'vitest';
import {
  perceptualHash,
  pHash,
  approximateSSIM,
  approximateMS_SSIM,
  approximatePSNR,
  nearestHash,
  approximateButteraugli,
  butteraugliVerdict,
} from '../src/cv/index.js';
import type { RasterImage } from '../src/types.js';

function makeImage(w = 32, h = 32, seed = 1): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const v = Math.round(((Math.sin(x * 0.1 + seed) + 1) / 2) * 255);
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
  }
  return {
    width: w,
    height: h,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

describe('P4-13 Analysis primitives', () => {
  describe('Perceptual hash', () => {
    it('pHash returns 16 bits', () => {
      const img = makeImage();
      const hash = pHash(img);
      expect(hash.length).toBe(16);
      expect(hash.every((b) => b === 0 || b === 1)).toBe(true);
    });
    it('same image produces same pHash', () => {
      const img = makeImage();
      expect(pHash(img)).toEqual(pHash(img));
    });
  });

  describe('SSIM approximations', () => {
    it('approximateSSIM returns high value for identical images', () => {
      const img = makeImage();
      expect(approximateSSIM(img, img)).toBeGreaterThanOrEqual(0.99);
    });
    it('approximateMS_SSIM is finite', () => {
      const a = makeImage();
      const b = makeImage(32, 32, 5);
      const ms = approximateMS_SSIM(a, b);
      expect(Number.isFinite(ms)).toBe(true);
    });
  });

  describe('PSNR', () => {
    it('approximatePSNR is Infinity for identical images', () => {
      const img = makeImage();
      expect(approximatePSNR(img, img)).toBe(Infinity);
    });
    it('approximatePSNR is -Infinity for mismatched dimensions', () => {
      const a = makeImage(32, 32);
      const b = makeImage(64, 32);
      expect(approximatePSNR(a, b)).toBe(-Infinity);
    });
  });

  describe('Butteraugli approximation', () => {
    it('approximateButteraugli returns finite number', () => {
      const a = makeImage();
      const b = makeImage();
      const d = approximateButteraugli(a, b);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    });
    it('approximateButteraugli is Infinity for mismatched dimensions', () => {
      const a = makeImage(32, 32);
      const b = makeImage(64, 32);
      expect(approximateButteraugli(a, b)).toBe(Infinity);
    });
  });

  describe('Verdict', () => {
    it('butteraugliVerdict covers thresholds', () => {
      expect(butteraugliVerdict(0.5)).toBe('Visually identical');
      expect(butteraugliVerdict(2)).toBe('Differences visible on close inspection');
      expect(butteraugliVerdict(10)).toBe('Clearly degraded');
    });
  });

  describe('Nearest hash clustering', () => {
    it('nearestHash finds closest', () => {
      const img = makeImage();
      const refs = [perceptualHash(img), perceptualHash(img)];
      const result = nearestHash(perceptualHash(img), refs);
      expect(result).not.toBeNull();
      expect(result!.distance).toBe(0);
    });
    it('nearestHash returns null for empty references', () => {
      expect(nearestHash([1, 0], [])).toBeNull();
    });
  });
});
