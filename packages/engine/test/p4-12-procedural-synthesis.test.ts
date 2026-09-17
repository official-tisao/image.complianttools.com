import { describe, expect, it } from 'vitest';
import {
  openSimplex2_2D,
  openSimplex2_2D_ImproveXY,
  valueNoise,
  valueNoiseTexture,
  valueNoiseImage,
  worleyNoise,
  domainWarp,
  fbm,
  linearGradient,
  identicon,
} from '../src/cv/index.js';

describe('P4-12 Noise primitives', () => {
  describe('OpenSimplex2', () => {
    it('returns a finite number', () => {
      const v = openSimplex2_2D(1, 10, 20);
      expect(typeof v).toBe('number');
      expect(Number.isFinite(v)).toBe(true);
    });
    it('is deterministic for same input/seed', () => {
      expect(openSimplex2_2D(1, 10, 20)).toBe(openSimplex2_2D(1, 10, 20));
    });
    it('different seed produces different output', () => {
      const a = openSimplex2_2D(1, 10, 20);
      const b = openSimplex2_2D(1, 10, 30);
      expect(a).not.toBe(b);
    });
    it('output is bounded', () => {
      for (let i = 0; i < 10; i++) {
        const v = openSimplex2_2D(i, i * 0.5, i * -0.3);
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThan(2);
      }
    });
    it('ImproveXY produces finite bounded output', () => {
      const v = openSimplex2_2D_ImproveXY(7, 1.2, 3.4);
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThan(2);
    });
  });

  describe('Value noise', () => {
    it('returns deterministic scalar', () => {
      expect(valueNoise({ seed: 123, scale: 1 })).toBe(valueNoise({ seed: 123, scale: 1 }));
    });
    it('different seed changes value', () => {
      expect(valueNoise({ seed: 1 })).not.toBe(valueNoise({ seed: 2 }));
    });
    it('valueNoiseTexture returns valid RasterImage', () => {
      const img = valueNoiseTexture({ width: 32, height: 32, seed: 1 });
      expect(img.width).toBe(32);
      expect(img.height).toBe(32);
      expect(img.frames.length).toBe(1);
      expect(img.frames[0].data.length).toBe(32 * 32 * 4);
      expect(img.premultipliedAlpha).toBe(false);
    });
    it('valueNoiseImage returns same as texture', () => {
      const a = valueNoiseImage({ width: 16, height: 16, seed: 5 });
      const b = valueNoiseTexture({ width: 16, height: 16, seed: 5 });
      expect(a.frames[0].data.toString()).toBe(b.frames[0].data.toString());
    });
  });

  describe('Worley noise', () => {
    it('returns valid RasterImage', () => {
      const img = worleyNoise({ width: 64, height: 48, seed: 5, points: 16 });
      expect(img.width).toBe(64);
      expect(img.height).toBe(48);
      expect(img.frames[0].data.length).toBe(64 * 48 * 4);
    });
    it('is deterministic', () => {
      const a = worleyNoise({ width: 16, height: 16, seed: 7, points: 8 });
      const b = worleyNoise({ width: 16, height: 16, seed: 7, points: 8 });
      expect(a.frames[0].data.toString()).toBe(b.frames[0].data.toString());
    });
    it('different seed produces different output', () => {
      const a = worleyNoise({ width: 16, height: 16, seed: 1, points: 8 });
      const b = worleyNoise({ width: 16, height: 16, seed: 2, points: 8 });
      expect(a.frames[0].data.toString()).not.toBe(b.frames[0].data.toString());
    });
  });

  describe('Domain warping', () => {
    it('returns valid RasterImage', () => {
      const img = domainWarp({ width: 64, height: 64, seed: 3, warpStrength: 0.5, scale: 0.02 });
      expect(img.width).toBe(64);
      expect(img.height).toBe(64);
      expect(img.frames[0].data.length).toBe(64 * 64 * 4);
    });
    it('is deterministic', () => {
      const a = domainWarp({ width: 32, height: 32, seed: 1, warpStrength: 1.0, scale: 0.02 });
      const b = domainWarp({ width: 32, height: 32, seed: 1, warpStrength: 1.0, scale: 0.02 });
      expect(a.frames[0].data.toString()).toBe(b.frames[0].data.toString());
    });
    it('different seed produces different output', () => {
      const a = domainWarp({ width: 32, height: 32, seed: 1, warpStrength: 0.5, scale: 0.02 });
      const b = domainWarp({ width: 32, height: 32, seed: 5, warpStrength: 0.5, scale: 0.02 });
      expect(a.frames[0].data.toString()).not.toBe(b.frames[0].data.toString());
    });
    it('actual warp occurs (not no-op)', () => {
      const zero = domainWarp({ width: 32, height: 32, seed: 42, warpStrength: 0, scale: 0.1 });
      const nonZero = domainWarp({
        width: 32,
        height: 32,
        seed: 42,
        warpStrength: 1.0,
        scale: 0.1,
      });
      expect(nonZero.frames[0].data.toString()).not.toBe(zero.frames[0].data.toString());
    });
  });

  describe('fBm', () => {
    it('returns valid RasterImage', () => {
      const img = fbm({ width: 32, height: 32, seed: 10, octaves: 3, scale: 0.05 });
      expect(img.width).toBe(32);
      expect(img.height).toBe(32);
      expect(img.premultipliedAlpha).toBe(false);
    });
    it('is deterministic', () => {
      const a = fbm({ width: 8, height: 8, seed: 3, octaves: 4 });
      const b = fbm({ width: 8, height: 8, seed: 3, octaves: 4 });
      expect(a.frames[0].data.toString()).toBe(b.frames[0].data.toString());
    });
    it('different seed changes output', () => {
      const a = fbm({ width: 8, height: 8, seed: 3, octaves: 4 });
      const b = fbm({ width: 8, height: 8, seed: 4, octaves: 4 });
      expect(a.frames[0].data.toString()).not.toBe(b.frames[0].data.toString());
    });
    it('multiple octaves produce bounded output', () => {
      const img = fbm({ width: 16, height: 16, seed: 9, octaves: 5, scale: 0.08 });
      for (let i = 0; i < img.frames[0].data.length; i += 4) {
        const r = img.frames[0].data[i];
        const aCh = img.frames[0].data[i + 3];
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(aCh).toBe(255);
      }
    });
  });

  describe('Existing primitives preserved', () => {
    it('linearGradient produces valid output', () => {
      const img = linearGradient({ width: 4, height: 4 });
      expect(img.width).toBe(4);
      expect(img.height).toBe(4);
    });
    it('identicon produces deterministic output', () => {
      const a = identicon({ width: 8, height: 8, seed: 99 });
      const b = identicon({ width: 8, height: 8, seed: 99 });
      expect(a.frames[0].data.toString()).toBe(b.frames[0].data.toString());
    });
  });
});
