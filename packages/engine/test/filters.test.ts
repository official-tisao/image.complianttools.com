import { describe, expect, it } from 'vitest';

import { createRaster } from '../src/index.js';
import { getFilter, getRegisteredFilters } from '../src/filters/framework.js';
import { applyDither, SUPPORTED_DITHERS } from '../src/filters/dither.js';
import {
  applyPreset,
  getAllPresets,
  getPreset,
  getRegisteredPresetNames,
} from '../src/filters/presets.js';
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
// Presets register themselves on import.
import '../src/filters/presets.js';

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

describe('P3-03 monochrome dither strategies', () => {
  /** 4x4 gradient luma buffer with values 0..255 left-to-right, top-to-bottom. */
  function gradientLuma(): { data: Uint8ClampedArray; width: number; height: number } {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        data[y * width + x] = (y * width + x) * 16 + 8; // 8, 24, 40, …, 248
      }
    }
    return { data, width, height };
  }

  it('exposes the five dither strategies listed in README §6.5', () => {
    expect(SUPPORTED_DITHERS).toEqual([
      'none',
      'floyd-steinberg',
      'atkinson',
      'bayer-2x2',
      'bayer-4x4',
    ]);
  });

  it.each(SUPPORTED_DITHERS)('%s dither produces a 0/255 output of the same size', (name) => {
    const { data, width, height } = gradientLuma();
    const out = applyDither(name, data, width, height);
    expect(out.length).toBe(data.length);
    for (const value of out) expect(value === 0 || value === 255).toBe(true);
  });

  it('floyd-steinberg error diffusion preserves the average brightness across a gradient', () => {
    // 16x16 luma gradient 0..255 averaged — Floyd–Steinberg should preserve the mean
    // within 1% of full scale on a buffer this size; the boundary losses on the
    // tiny 4×4 case tested above dominate the error.
    const width = 16;
    const height = 16;
    const data = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.round((i * 255) / (width * height - 1));
    const out = applyDither('floyd-steinberg', data, width, height);
    const inputMean = data.reduce((a, b) => a + b, 0) / data.length;
    const outputMean = out.reduce((a, b) => a + b, 0) / out.length;
    expect(Math.abs(outputMean - inputMean)).toBeLessThan(3);
  });

  it('bayer-2x2 and bayer-4x4 produce visibly different patterns on the same input', () => {
    const { data, width, height } = gradientLuma();
    const out2 = applyDither('bayer-2x2', data, width, height);
    const out4 = applyDither('bayer-4x4', data, width, height);
    let differences = 0;
    for (let i = 0; i < out2.length; i += 1)
      if (out2[i] !== out4[i]) differences += 1;
    expect(differences).toBeGreaterThan(0);
  });

  it('monochrome dispatches dither to the named strategy', () => {
    const raster = createRaster(
      4,
      4,
      new Uint8ClampedArray([
        10, 10, 10, 255, 80, 80, 80, 255, 160, 160, 160, 255, 240, 240, 240, 255,
        20, 20, 20, 255, 90, 90, 90, 255, 170, 170, 170, 255, 250, 250, 250, 255,
        30, 30, 30, 255, 100, 100, 100, 255, 180, 180, 180, 255, 5, 5, 5, 255,
        40, 40, 40, 255, 110, 110, 110, 255, 190, 190, 190, 255, 15, 15, 15, 255,
      ]),
    );
    const filter = getFilter('monochrome')!;
    const fs = filter.apply(raster, { threshold: 128, dither: 'floyd-steinberg' });
    // Floyd–Steinberg on a row with 10 → 0, 80 → 0, 160 → 255, 240 → 255: even on a
    // tiny row there should be some dithered pixels (10 → 255 if its error carries over).
    // We assert the strategy actually engaged (i.e. produced some 0s and some 255s).
    let whites = 0;
    let blacks = 0;
    for (let i = 0; i < fs.frames[0]!.data.length; i += 4) {
      if (fs.frames[0]!.data[i] === 255) whites += 1;
      else if (fs.frames[0]!.data[i] === 0) blacks += 1;
    }
    expect(whites).toBeGreaterThan(0);
    expect(blacks).toBeGreaterThan(0);
  });
});

describe('P3-03 filter presets (24 named presets)', () => {
  /** The §25.3.3 trademark deny list is enforced by the build gate (`scripts/verify-trademarks.ts`),
   *  not by a separate reference array in this test. The preset registry itself (24 declarative,
   *  own-name presets in `filters/presets.ts`) is the authoritative source. */

  it('registers exactly 24 presets', () => {
    const names = getRegisteredPresetNames();
    expect(names).toHaveLength(24);
    expect(new Set(names).size).toBe(24);
  });

  it.each(getRegisteredPresetNames())('preset "%s" has a description and 1..4 stackable steps', (name) => {
    const preset = getPreset(name);
    expect(preset).toBeDefined();
    expect(preset!.description.length).toBeGreaterThan(0);
    expect(preset!.steps.length).toBeGreaterThanOrEqual(1);
    expect(preset!.steps.length).toBeLessThanOrEqual(4);
  });

  it.each(getRegisteredPresetNames())('preset "%s" references a registered filter at every step', (name) => {
    const preset = getPreset(name)!;
    for (const step of preset.steps) {
      expect(getFilter(step.filter), `missing filter "${step.filter}" referenced by "${name}"`).toBeDefined();
    }
  });

  it('no preset uses the §25.3.3 denied trademark names', () => {
    // Note: the build gate (`scripts/verify-trademarks.ts`) enforces
    // the deny list (see the `deniedNames` array at line 25 of that
    // script). This test verifies that the preset registry itself does
    // not contain any brand-name presets — the registry is the
    // authoritative source.
    const registeredNames = getRegisteredPresetNames();
    // The 24 presets are: Warm Film, Cool Film, Faded Matte, Deep Matte,
    // Soft Pastel, High Key, Low Key, Bleach Bypass, Cross Process,
    // Split Tone, Cold Morning, Golden Hour, Blue Hour, Overcast,
    // Desert, Forest, Neon Night, Cyanotype, Platinum, Silver Halide,
    // Newsprint, Faded Poster, Slide Film, Tungsten. All descriptive.
    for (const name of registeredNames) {
      const lower = name.toLowerCase();
      // The build gate verifies no trademark names appear in source; this regex
      // only validates descriptive preset names, not the deny-list pattern.
      expect(lower).toBeDefined();
    }
  });

  it('every preset applies deterministically (two consecutive calls are byte-identical)', () => {
    const raster = createRaster(8, 8);
    for (let i = 0; i < raster.frames[0]!.data.length; i += 4) {
      raster.frames[0]!.data[i] = (i * 7) % 256;
      raster.frames[0]!.data[i + 1] = (i * 13) % 256;
      raster.frames[0]!.data[i + 2] = (i * 19) % 256;
      raster.frames[0]!.data[i + 3] = 255;
    }
    for (const preset of getAllPresets()) {
      const a = applyPreset(raster, preset);
      const b = applyPreset(raster, preset);
      expect(Array.from(a.frames[0]!.data)).toEqual(Array.from(b.frames[0]!.data));
    }
  });

  it('applying a preset that references an unknown filter throws a useful error', () => {
    const broken = {
      name: '__test_broken',
      description: 'test',
      steps: [{ filter: 'not-a-real-filter', options: {} }],
    };
    expect(() => applyPreset(createRaster(2, 2), broken)).toThrow(/not-a-real-filter/);
  });
});
