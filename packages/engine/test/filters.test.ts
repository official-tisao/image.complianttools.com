import { describe, expect, it } from 'vitest';

import { createRaster } from '../src/index.js';
import { getFilter, getRegisteredFilters } from '../src/filters/framework.js';
// Importing the filter module registers them as a side effect.
import '../src/filters/posterize.js';
import '../src/filters/solarize.js';
import '../src/filters/vignette.js';
import '../src/filters/grain.js';
import '../src/filters/gradient-map.js';
import '../src/filters/lut.js';
import '../src/filters/grayscale.js';
import '../src/filters/sepia.js';
import '../src/filters/negate.js';
import '../src/filters/retro.js';
import '../src/filters/duotone.js';
import '../src/filters/monochrome.js';

const sampleRaster = () =>
  createRaster(
    4,
    4,
    new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 128, 128, 128, 255, 64, 64,
      64, 255, 192, 192, 192, 255, 32, 32, 32, 255, 100, 200, 50, 255, 200, 100, 50, 255, 50, 100,
      200, 255, 150, 75, 25, 255, 25, 50, 100, 255, 75, 150, 200, 255, 200, 25, 75, 255, 100, 50,
      200, 255,
    ]),
  );

describe('P3-03 filter framework registration', () => {
  it('registers every primitive the plan requires', () => {
    const registered = new Set(getRegisteredFilters());
    for (const name of [
      'grayscale',
      'monochrome',
      'negate',
      'retro',
      'sepia',
      'duotone',
      'gradient-map',
      'posterize',
      'solarize',
      'vignette',
      'grain',
      'lut',
    ]) {
      expect(registered.has(name), `missing filter: ${name}`).toBe(true);
      expect(getFilter(name)).toBeDefined();
    }
  });
});

describe('P3-03 primitive filter behaviour', () => {
  it('posterize reduces the number of distinct colour values per channel', () => {
    const filter = getFilter('posterize')!;
    const result = filter.apply(sampleRaster(), { levels: 2 });
    const values = new Set<number>();
    for (let i = 0; i < result.frames[0]!.data.length; i += 4) {
      values.add(result.frames[0]!.data[i]!);
    }
    expect(values.size).toBeLessThanOrEqual(2);
  });

  it('solarize inverts only pixels above the threshold', () => {
    const filter = getFilter('solarize')!;
    const raster = createRaster(
      1,
      4,
      new Uint8ClampedArray([
        0, 0, 0, 255, 50, 50, 50, 255, 200, 200, 200, 255, 250, 250, 250, 255,
      ]),
    );
    const result = filter.apply(raster, { threshold: 128 });
    // Below threshold: unchanged.
    expect(result.frames[0]!.data[0]).toBe(0);
    expect(result.frames[0]!.data[4]).toBe(50);
    // Above threshold: inverted.
    expect(result.frames[0]!.data[8]).toBe(55);
    expect(result.frames[0]!.data[12]).toBe(5);
  });

  it('vignette darkens the corners relative to the centre', () => {
    const filter = getFilter('vignette')!;
    const raster = createRaster(8, 8, new Uint8ClampedArray(8 * 8 * 4).fill(200));
    // Force alpha to 255.
    for (let i = 3; i < raster.frames[0]!.data.length; i += 4) raster.frames[0]!.data[i] = 255;
    const result = filter.apply(raster, { intensity: -0.8, size: 0.5 });
    // Corner pixel should be darker than the centre.
    const corner = result.frames[0]!.data[0]!;
    const centreOffset = (4 * 8 + 4) * 4;
    const centre = result.frames[0]!.data[centreOffset]!;
    expect(corner).toBeLessThan(centre);
  });

  it('grain changes pixels but is deterministic for the same input', () => {
    const filter = getFilter('grain')!;
    const raster = createRaster(2, 2, new Uint8ClampedArray(16).fill(128));
    const a = filter.apply(raster, { amount: 50, monochromatic: true });
    const b = filter.apply(raster, { amount: 50, monochromatic: true });
    for (let i = 0; i < a.frames[0]!.data.length; i += 1) {
      expect(a.frames[0]!.data[i]).toBe(b.frames[0]!.data[i]!);
    }
    // Grain must actually change the input.
    expect(a.frames[0]!.data[0]).not.toBe(128);
  });

  it('gradient-map with black/white extremes produces a grayscale image', () => {
    const filter = getFilter('gradient-map')!;
    const raster = createRaster(2, 2, new Uint8ClampedArray(16).fill(180));
    const result = filter.apply(raster, {
      stops: [
        { stop: 0, color: '#000000' },
        { stop: 1, color: '#FFFFFF' },
      ],
    });
    const r = result.frames[0]!.data[0]!;
    const g = result.frames[0]!.data[1]!;
    const b = result.frames[0]!.data[2]!;
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('lut identity map preserves the input pixel values', () => {
    const filter = getFilter('lut')!;
    // A 2x2x2 LUT where index (i,j,k) holds (i,j,k)/1 in RGB.
    const data = new Float32Array(2 * 2 * 2 * 3);
    for (let r = 0; r < 2; r += 1) {
      for (let g = 0; g < 2; g += 1) {
        for (let b = 0; b < 2; b += 1) {
          const i = (r + g * 2 + b * 4) * 3;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
      }
    }
    const raster = createRaster(1, 1, new Uint8ClampedArray([255, 255, 255, 255]));
    const result = filter.apply(raster, { size: 2, data });
    // 255 should map to index 1, which is white.
    expect(result.frames[0]!.data[0]).toBe(255);
    expect(result.frames[0]!.data[1]).toBe(255);
    expect(result.frames[0]!.data[2]).toBe(255);
  });

  it('lut rejects truncated data with a hard error', () => {
    const filter = getFilter('lut')!;
    const raster = createRaster(1, 1, new Uint8ClampedArray([128, 128, 128, 255]));
    expect(() => filter.apply(raster, { size: 4, data: new Float32Array(3) })).toThrow(
      /LUT data is shorter/,
    );
  });
});
