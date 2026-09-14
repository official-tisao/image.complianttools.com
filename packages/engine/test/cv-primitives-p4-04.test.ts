import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import { dcci, nedi } from '../src/cv/index.js';

describe('P4-04 edge-directed interpolation', () => {
  it('dcci upscales by factor 2 and returns larger dimensions', () => {
    const image = createRaster(
      2,
      2,
      new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 128, 128, 128, 255]),
    );
    const result = dcci(image, 2);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.frames[0]!.data.length).toBe(4 * 4 * 4);
  });

  it('nedi upscales by factor 2 and produces output within latency budget (instant)', () => {
    const image = createRaster(4, 4, new Uint8ClampedArray(new Array(4 * 4 * 4).fill(200)));
    const start = Date.now();
    const result = nedi(image, 2);
    const elapsed = Date.now() - start;
    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
    expect(elapsed).toBeLessThan(100); // instant / deterministic
  });

  it('nedi uses edge-weighting so uniform regions stay smooth', () => {
    const uniform = createRaster(3, 3, new Uint8ClampedArray(new Array(3 * 3 * 4).fill(128)));
    const up = nedi(uniform, 2);
    expect(up.width).toBe(6);
    expect(up.height).toBe(6);
    // Uniform input should stay near uniform; no extreme outliers.
    for (let i = 0; i < up.frames[0]!.data.length; i += 4) {
      expect(up.frames[0]!.data[i]!).toBeGreaterThanOrEqual(110);
      expect(up.frames[0]!.data[i]!).toBeLessThanOrEqual(150);
    }
  });
});
