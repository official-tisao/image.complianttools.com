import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import { spectralResidualSaliency, fineGrainedSaliency } from '../src/cv/saliency.js';

describe('P4-02 — Spectral residual saliency', () => {
  it('returns correct dimensions (width * height)', () => {
    const src = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 128, 128, 128, 255]);
    const image = createRaster(3, 1, src);
    const result = spectralResidualSaliency(image);
    expect(result.length).toBe(3);
    expect(result.every((v) => v >= 0 && v <= 255)).toBe(true);
  });

  it('normalized output (values in [0, 255])', () => {
    const src = new Uint8ClampedArray(new Array(4 * 8 * 4).fill(200));
    const image = createRaster(8, 4, src);
    const result = spectralResidualSaliency(image);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
      expect(result[i]).toBeLessThanOrEqual(255);
    }
  });

  it('deterministic output', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 255, 50, 60, 70, 255, 90, 100, 110, 255]);
    const image = createRaster(3, 1, src);
    const a = spectralResidualSaliency(image);
    const b = spectralResidualSaliency(image);
    expect(a).toEqual(b);
  });

  it('uniform/small image does not corrupt', () => {
    const src = new Uint8ClampedArray(new Array(2 * 2 * 4).fill(128));
    const image = createRaster(2, 2, src);
    const result = spectralResidualSaliency(image);
    expect(result.length).toBe(4);
    for (let i = 0; i < result.length; i++) {
      expect(Number.isFinite(result[i]!)).toBe(true);
    }
  });

  it('does not corrupt non-uniform image', () => {
    const data = new Uint8ClampedArray(4 * 6 * 4);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 4; x++) {
        const off = (y * 4 + x) * 4;
        data[off] = x * 40 + y * 30;
        data[off + 1] = (x * 15 + y * 50) % 256;
        data[off + 2] = (x * 70 + y * 20) % 256;
        data[off + 3] = 255;
      }
    }
    const image = createRaster(4, 6, data);
    const result = spectralResidualSaliency(image);
    expect(result.length).toBe(24);
    expect(result.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(true);
  });
});

describe('P4-02 — Fine-grained saliency', () => {
  it('returns correct dimensions', () => {
    const src = new Uint8ClampedArray([255, 255, 255, 255, 0, 255, 0, 255, 128, 128, 128, 255]);
    const image = createRaster(3, 1, src);
    const result = fineGrainedSaliency(image);
    expect(result.length).toBe(3);
    expect(result.every((v) => v >= 0 && v <= 255)).toBe(true);
  });

  it('normalized output', () => {
    const src = new Uint8ClampedArray(new Array(4 * 5 * 4).fill(100));
    const image = createRaster(4, 5, src);
    const result = fineGrainedSaliency(image);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
      expect(result[i]).toBeLessThanOrEqual(255);
    }
  });

  it('deterministic output', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const image = createRaster(2, 1, src);
    const a = fineGrainedSaliency(image);
    const b = fineGrainedSaliency(image);
    expect(a).toEqual(b);
  });

  it('uniform/small image does not corrupt', () => {
    const src = new Uint8ClampedArray(new Array(2 * 2 * 4).fill(200));
    const image = createRaster(2, 2, src);
    const result = fineGrainedSaliency(image);
    expect(result.length).toBe(4);
    expect(result.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(true);
  });

  it('non-corruption on varied image', () => {
    const image = createRaster(
      3,
      3,
      new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      ]),
    );
    const result = fineGrainedSaliency(image);
    expect(result.length).toBe(9);
    expect(result.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(true);
  });
});
