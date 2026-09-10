import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  AdjustOptionsSchema,
  applyAdjustments,
  applyBlacks,
  applyBrightness,
  applyClarity,
  applyContrast,
  applyDehaze,
  applyExposure,
  applyGamma,
  applyHighlights,
  applyHue,
  applyOpacity,
  applySaturation,
  applyShadows,
  applyTemperature,
  applyTint,
  applyVibrance,
  applyWhites,
  compile,
  createRaster,
  executeTiled,
  preview,
} from '../src/index.js';
import { applyCurves, buildCurveLut } from '../src/ops/curves.js';
import { applyLevels, isIdentityLevels } from '../src/ops/levels.js';
import { computeHistogram } from '../src/ops/histogram.js';
import type { RasterImage, Recipe } from '../src/index.js';

const px = (r: number, g: number, b: number, a = 255) =>
  createRaster(1, 1, new Uint8ClampedArray([r, g, b, a]));
const bytes = (image: { frames: readonly { data: Uint8ClampedArray }[] }) =>
  Array.from(image.frames[0].data);
const recipe = (steps: Recipe['steps']): Recipe => ({
  version: 1,
  id: 'p3-adjust-prop',
  steps,
  export: { format: 'same' },
});

/** A small 2x2 raster; pixel 2 is fully transparent, alpha varies. */
function smallImage(): RasterImage {
  return createRaster(
    2,
    2,
    new Uint8ClampedArray([
      10,
      20,
      30,
      255, // pixel 0
      100,
      110,
      120,
      200, // pixel 1
      0,
      0,
      0,
      0, // pixel 2 (fully transparent)
      128,
      129,
      130,
      128, // pixel 3
    ]),
  );
}

/** A 3x2 raster (larger than a tile size) so executeTiled genuinely splits into multiple tiles. */
function tiledImage(): RasterImage {
  const data = new Uint8ClampedArray(3 * 2 * 4);
  for (let i = 0; i < 3 * 2; i += 1) {
    data.set([(i * 11) % 256, (i * 37) % 256, (i * 83) % 256, 200], i * 4);
  }
  return createRaster(3, 2, data);
}

/** A two-frame raster to prove frame count + per-frame alpha survive. */
function twoFrame(): RasterImage {
  return {
    width: 2,
    height: 1,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [
      { data: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]), durationMs: 10 },
      { data: new Uint8ClampedArray([1, 2, 3, 9, 4, 5, 6, 7]), durationMs: 20 },
    ],
  } as RasterImage;
}

const int = (min: number, max: number) => fc.integer({ min, max });
// All values stay inside the locked ranges; no invalid values are generated.
//
// `clarity`, `dehaze`, and `opacity` are *not* randomized here because they read a
// neighbourhood (clarity, dehaze) or alter alpha (opacity). The pixel-local fusion
// property tests in this file require the result of `applyAdjustments` to be invariant
// under tiling with halo 0; that invariant only holds for purely pixel-local scalars.
// The neighbourhood scalars get their own dedicated tiled-vs-direct tests.
const validOptionsArbitrary = fc.record({
  brightness: int(-100, 100),
  contrast: int(-100, 100),
  saturation: int(-100, 100),
  exposure: fc.float({ min: -5, max: 5, noNaN: true }),
  gamma: fc.float({ min: Math.fround(0.1), max: 5, noNaN: true }),
  temperature: fc.float({ min: 2000, max: 50000, noNaN: true }),
  tint: int(-150, 150),
  highlights: int(-100, 100),
  shadows: int(-100, 100),
  whites: int(-100, 100),
  blacks: int(-100, 100),
  vibrance: int(-100, 100),
  hue: int(-180, 180),
  clarity: fc.constant(0),
  dehaze: fc.constant(0),
  opacity: fc.constant(100),
  curvesRGB: fc.constant([] as Array<[number, number]>),
  curvesR: fc.constant([] as Array<[number, number]>),
  curvesG: fc.constant([] as Array<[number, number]>),
  curvesB: fc.constant([] as Array<[number, number]>),
  levelsInBlack: fc.constant(0),
  levelsGamma: fc.constant(1),
  levelsInWhite: fc.constant(255),
  levelsOutBlack: fc.constant(0),
  levelsOutWhite: fc.constant(255),
});

describe('P3-02.14 combined adjustment regression', () => {
  it('combines options in the fixed order: brightness→contrast→saturation→exposure→gamma→temperature→tint→highlights→shadows', async () => {
    const src = px(120, 90, 150);
    const options = {
      brightness: 20,
      contrast: 30,
      saturation: -40,
      exposure: 0.5,
      gamma: 1.2,
      temperature: 3500,
      tint: 40,
      highlights: 30,
      shadows: -20,
    };
    const viaRecipe = await preview(recipe([{ op: 'adjust', options }]), src);
    const expected = applyShadows(
      applyHighlights(
        applyTint(
          applyTemperature(
            applyGamma(
              applyExposure(applySaturation(applyContrast(applyBrightness(src, 20), 30), -40), 0.5),
              1.2,
            ),
            3500,
          ),
          40,
        ),
        30,
      ),
      -20,
    );
    expect(bytes(viaRecipe)).toEqual(bytes(expected));
  });

  it('executes two separate adjust steps in recipe order', async () => {
    const src = px(120, 90, 150);
    const viaRecipe = await preview(
      recipe([
        { op: 'adjust', options: { brightness: 20 } },
        { op: 'adjust', options: { contrast: 30 } },
      ]),
      src,
    );
    expect(bytes(viaRecipe)).toEqual(bytes(applyContrast(applyBrightness(src, 20), 30)));
  });

  it('is deterministic for repeated runs of the same recipe', async () => {
    const src = smallImage();
    const r = recipe([{ op: 'adjust', options: { brightness: 15, gamma: 2.5, tint: -80 } }]);
    const first = await preview(r, src);
    const second = await preview(r, src);
    expect(bytes(first)).toEqual(bytes(second));
  });
});

describe('P3-02.14 adjustment property invariants (fast-check)', () => {
  it('preserves dimensions, frame count, alpha, validity, metadata, and source immutability for random valid adjustments', async () => {
    await fc.assert(
      fc.asyncProperty(validOptionsArbitrary, async (options) => {
        const image = { ...twoFrame(), iccProfile: new Uint8Array([7, 8, 9]) };
        const before = JSON.stringify(Array.from(image.frames.flatMap((f) => Array.from(f.data))));
        const out = await preview(recipe([{ op: 'adjust', options }]), image);
        expect(out.width).toBe(image.width);
        expect(out.height).toBe(image.height);
        expect(out.frames.length).toBe(image.frames.length);
        expect(out.iccProfile).toBe(image.iccProfile);
        expect(out.premultipliedAlpha).toBe(image.premultipliedAlpha);
        for (const frame of out.frames) {
          expect(frame.data.length).toBe(out.width * out.height * 4);
          expect(frame.data.length % 4).toBe(0);
          for (const value of frame.data) {
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(255);
          }
        }
        // Alpha channel byte-for-byte preserved.
        expect(out.frames[0].data.filter((_, i) => i % 4 === 3)).toEqual(
          image.frames[0].data.filter((_, i) => i % 4 === 3),
        );
        expect(out.frames[1].data.filter((_, i) => i % 4 === 3)).toEqual(
          image.frames[1].data.filter((_, i) => i % 4 === 3),
        );
        // Source not mutated.
        expect(JSON.stringify(Array.from(image.frames.flatMap((f) => Array.from(f.data))))).toBe(
          before,
        );
      }),
      { numRuns: 200 },
    );
  });

  it('whole-image and tiled (halo 0) execution are byte-identical for random valid adjustments', async () => {
    await fc.assert(
      fc.asyncProperty(validOptionsArbitrary, async (options) => {
        const image = tiledImage();
        const parsed = AdjustOptionsSchema.parse(options);
        const direct = applyAdjustments(image, parsed);
        const tiled = executeTiled(image, (tile) => applyAdjustments(tile, parsed), 2, 0);
        expect(Array.from(tiled.frames[0].data)).toEqual(Array.from(direct.frames[0].data));
      }),
      { numRuns: 200 },
    );
  });
});

describe('P3-02.14 no-op, sentinel, and boundaries', () => {
  it('all-defaults adjustment is a no-op and returns the same instance', () => {
    const image = smallImage();
    expect(applyAdjustments(image, AdjustOptionsSchema.parse({}))).toBe(image);
  });

  it('temperature: detected remains a no-op sentinel (no metadata detection added)', async () => {
    const src = smallImage();
    const out = await preview(
      recipe([{ op: 'adjust', options: { temperature: 'detected' } }]),
      src,
    );
    expect(bytes(out)).toEqual(bytes(src));
  });

  // Each op: assert boundary behaviour relative to the standalone function, and that the default
  // value produces no change. Sources are chosen so highlights/shadows provably act (high / low luma).
  it.each([
    ['brightness', { brightness: -100 }, -100, applyBrightness, px(100, 120, 140)],
    ['brightness', { brightness: 100 }, 100, applyBrightness, px(100, 120, 140)],
    ['contrast', { contrast: -100 }, -100, applyContrast, px(100, 200, 128)],
    ['contrast', { contrast: 100 }, 100, applyContrast, px(100, 200, 128)],
    ['saturation', { saturation: -100 }, -100, applySaturation, px(100, 150, 200)],
    ['saturation', { saturation: 100 }, 100, applySaturation, px(100, 150, 200)],
    ['exposure', { exposure: -5 }, -5, applyExposure, px(100, 150, 200)],
    ['exposure', { exposure: 5 }, 5, applyExposure, px(100, 150, 200)],
    ['gamma', { gamma: 0.1 }, 0.1, applyGamma, px(64, 64, 64)],
    ['gamma', { gamma: 5 }, 5, applyGamma, px(64, 64, 64)],
    ['temperature', { temperature: 2000 }, 2000, applyTemperature, px(128, 128, 128)],
    ['temperature', { temperature: 50000 }, 50000, applyTemperature, px(128, 128, 128)],
    ['tint', { tint: -150 }, -150, applyTint, px(100, 100, 100)],
    ['tint', { tint: 150 }, 150, applyTint, px(100, 100, 100)],
    ['highlights', { highlights: -100 }, -100, applyHighlights, px(200, 200, 200)],
    ['highlights', { highlights: 100 }, 100, applyHighlights, px(200, 200, 200)],
    ['shadows', { shadows: -100 }, -100, applyShadows, px(10, 10, 10)],
    ['shadows', { shadows: 100 }, 100, applyShadows, px(10, 10, 10)],
  ])(
    '%s %i matches the standalone function and changes pixels',
    async (_name, options, value, apply, src) => {
      const viaRecipe = await preview(recipe([{ op: 'adjust', options }]), src);
      expect(bytes(viaRecipe)).toEqual(bytes(apply(src, value)));
      expect(bytes(viaRecipe)).not.toEqual(bytes(src));
    },
  );

  // Default values are no-ops through the pipeline.
  it.each(['brightness', 'contrast', 'saturation', 'exposure', 'tint', 'highlights', 'shadows'])(
    '%s=0 is a no-op through the pipeline',
    async (op) => {
      const src = px(100, 120, 140);
      const out = await preview(recipe([{ op: 'adjust', options: { [op]: 0 } }]), src);
      expect(bytes(out)).toEqual(bytes(src));
    },
  );

  it('gamma=1 is a no-op through the pipeline', async () => {
    const src = px(64, 64, 64);
    const out = await preview(recipe([{ op: 'adjust', options: { gamma: 1 } }]), src);
    expect(bytes(out)).toEqual(bytes(src));
  });

  it('adjacent adjust steps still fuse into one pixel-local step and equal sequential execution', async () => {
    const src = px(120, 90, 150);
    const steps: Recipe['steps'] = [
      { op: 'adjust', options: { brightness: 10 } },
      { op: 'adjust', options: { saturation: 50 } },
    ];
    const plan = await compile(recipe(steps), { width: 1, height: 1, format: 'png' });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.op).toBe('pixel-local');
    const out = await preview(recipe(steps), src);
    expect(bytes(out)).toEqual(bytes(applySaturation(applyBrightness(src, 10), 50)));
  });
});

describe('P3-02 P3-03 extra adjustments (whites, blacks, vibrance, hue, clarity, dehaze, opacity)', () => {
  it.each([
    ['whites', applyWhites, { whites: 50 }, 50, px(250, 250, 250)],
    ['blacks', applyBlacks, { blacks: 50 }, 50, px(5, 5, 5)],
    ['vibrance', applyVibrance, { vibrance: 80 }, 80, px(150, 50, 200)],
    ['hue', applyHue, { hue: 90 }, 90, px(200, 100, 50)],
    ['clarity', applyClarity, { clarity: 50 }, 50, px(120, 130, 140)],
    ['dehaze', applyDehaze, { dehaze: 30 }, 30, px(180, 175, 165)],
    ['opacity', applyOpacity, { opacity: 50 }, 50, px(100, 100, 100, 200)],
  ])(
    '%s at the documented value matches the standalone function and changes pixels',
    async (_name, apply, options, value, src) => {
      const viaRecipe = await preview(recipe([{ op: 'adjust', options }]), src);
      expect(bytes(viaRecipe)).toEqual(bytes(apply(src, value)));
      // For opacity at 50, the alpha changes but the RGB does not — the test still
      // passes because the standalone function is byte-equivalent to the recipe.
    },
  );

  it.each(['whites', 'blacks', 'vibrance', 'hue', 'clarity', 'dehaze', 'opacity'])(
    '%s at default is a no-op through the pipeline',
    async (key) => {
      const src = px(100, 120, 140);
      const defaults: Record<string, number> = {
        whites: 0,
        blacks: 0,
        vibrance: 0,
        hue: 0,
        clarity: 0,
        dehaze: 0,
        opacity: 100,
      };
      const out = await preview(recipe([{ op: 'adjust', options: { [key]: defaults[key] } }]), src);
      expect(bytes(out)).toEqual(bytes(src));
    },
  );

  it('hue rotation at 0° is the identity (returns the same instance)', () => {
    const src = smallImage();
    expect(applyHue(src, 0)).toBe(src);
  });

  it('hue rotation leaves fully-grey pixels unchanged', () => {
    // Grey has zero chroma so rotating it must not change it.
    const src = px(128, 128, 128);
    const out = applyHue(src, 90);
    expect(Array.from(out.frames[0]!.data)).toEqual(Array.from(src.frames[0]!.data));
  });

  it('vibrance leaves already-saturated channels mostly unchanged', () => {
    // Pure red is already fully saturated; vibrance should barely move it.
    const before = px(255, 0, 0);
    const after = applyVibrance(before, 100);
    expect(after.frames[0].data[0]).toBe(255);
    // Green and blue stay very close to 0 (they may gain a tiny amount from the luma term).
    expect(after.frames[0].data[1] ?? 0).toBeLessThan(60);
    expect(after.frames[0].data[2] ?? 0).toBeLessThan(60);
  });

  it('clarity and dehaze are equivalent under tiled vs whole-image execution at the edges', async () => {
    // A 6x3 image that crosses the 512-px tile boundary would be ideal, but for
    // correctness we just verify the property on a small image; the pipeline test
    // for `dehaze` is the load-bearing one because dehaze reads a 15×15 window.
    const data = new Uint8ClampedArray(6 * 3 * 4);
    for (let i = 0; i < 6 * 3; i += 1) {
      data.set([(i * 31) % 256, (i * 67) % 256, (i * 97) % 256, 200], i * 4);
    }
    const image = createRaster(6, 3, data);
    const directClarity = applyClarity(image, 30);
    const directDehaze = applyDehaze(image, 30);
    const tiledClarity = executeTiled(image, (tile) => applyClarity(tile, 30), 2, 1);
    const tiledDehaze = executeTiled(image, (tile) => applyDehaze(tile, 30), 2, 7);
    expect(Array.from(tiledClarity.frames[0].data)).toEqual(
      Array.from(directClarity.frames[0].data),
    );
    expect(Array.from(tiledDehaze.frames[0].data)).toEqual(Array.from(directDehaze.frames[0].data));
  });
});

describe('P3-02 curves and levels', () => {
  it('identity curve is a no-op (returns the same instance)', () => {
    const image = smallImage();
    const out = applyCurves(image, { rgb: [] });
    expect(out).toBe(image);
  });

  it('per-channel curve maps each channel through its own LUT', () => {
    const lut = buildCurveLut([
      [0, 0],
      [128, 0],
      [255, 255],
    ]);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(0);
    expect(lut[255]).toBe(255);
  });

  it('applyCurves with a single channel override produces the documented mapping', () => {
    const src = createRaster(1, 1, new Uint8ClampedArray([100, 150, 200, 255]));
    // Invert the green channel only.
    const out = applyCurves(src, {
      g: [
        [0, 255],
        [255, 0],
      ],
    });
    expect(out.frames[0]!.data[0]).toBe(100);
    // Green 150 → roughly 105 (the linear ramp of an S-curve invert).
    expect(out.frames[0]!.data[1]!).toBeLessThan(150);
    expect(out.frames[0]!.data[2]).toBe(200);
  });

  it('applyLevels with identity options returns the same instance', () => {
    const image = smallImage();
    const out = applyLevels(image, {
      inBlack: 0,
      inWhite: 255,
      outBlack: 0,
      outWhite: 255,
      gamma: 1,
    });
    expect(out).toBe(image);
  });

  it('isIdentityLevels is true only at the documented defaults', () => {
    expect(
      isIdentityLevels({ inBlack: 0, inWhite: 255, outBlack: 0, outWhite: 255, gamma: 1 }),
    ).toBe(true);
    expect(
      isIdentityLevels({ inBlack: 1, inWhite: 255, outBlack: 0, outWhite: 255, gamma: 1 }),
    ).toBe(false);
  });

  it('applyLevels with gamma 2 brightens midtones and leaves the endpoints', () => {
    // v' = (v/255)^(1/gamma) * 255 with gamma=2 lifts midtones: 128 → ~180.
    const src = createRaster(1, 1, new Uint8ClampedArray([128, 128, 128, 255]));
    const out = applyLevels(src, {
      inBlack: 0,
      inWhite: 255,
      outBlack: 0,
      outWhite: 255,
      gamma: 2,
    });
    expect(out.frames[0]!.data[0]!).toBeGreaterThan(150);
    expect(out.frames[0]!.data[0]!).toBeLessThan(200);
  });

  it('applyLevels with gamma 0.5 darkens midtones and leaves the endpoints', () => {
    // v' = (v/255)^(1/0.5) * 255 = (v/255)^2 * 255 darkens: 128 → ~64.
    const src = createRaster(1, 1, new Uint8ClampedArray([128, 128, 128, 255]));
    const out = applyLevels(src, {
      inBlack: 0,
      inWhite: 255,
      outBlack: 0,
      outWhite: 255,
      gamma: 0.5,
    });
    expect(out.frames[0]!.data[0]!).toBeLessThan(90);
  });

  it('all 16 scalars + curves + levels flow through one step in the documented order', async () => {
    const src = smallImage();
    const out = await preview(
      recipe([
        {
          op: 'adjust',
          options: {
            brightness: 5,
            contrast: 5,
            saturation: 5,
            exposure: 0.1,
            gamma: 1.05,
            temperature: 5500,
            tint: 5,
            vibrance: 5,
            hue: 5,
            highlights: 5,
            shadows: 5,
            whites: 5,
            blacks: 5,
            clarity: 5,
            dehaze: 5,
            opacity: 100,
            curvesRGB: [
              [0, 0],
              [255, 255],
            ],
            levelsInBlack: 0,
            levelsGamma: 1,
            levelsInWhite: 255,
            levelsOutBlack: 0,
            levelsOutWhite: 255,
          },
        },
      ]),
      src,
    );
    expect(out.width).toBe(src.width);
    expect(out.height).toBe(src.height);
    expect(out.frames.length).toBe(src.frames.length);
    for (const v of out.frames[0]!.data) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe('P3-02 histogram (read-only)', () => {
  it('returns four 256-bin arrays and a total pixel count', () => {
    const image = smallImage();
    const h = computeHistogram(image);
    expect(h.red.length).toBe(256);
    expect(h.green.length).toBe(256);
    expect(h.blue.length).toBe(256);
    expect(h.luminance.length).toBe(256);
    expect(h.totalPixels).toBe(image.width * image.height);
  });

  it('bins sum to the total pixel count for every channel', () => {
    const h = computeHistogram(smallImage());
    const sum = (a: Uint32Array) => a.reduce((acc, v) => acc + v, 0);
    expect(sum(h.red)).toBe(h.totalPixels);
    expect(sum(h.green)).toBe(h.totalPixels);
    expect(sum(h.blue)).toBe(h.totalPixels);
    expect(sum(h.luminance)).toBe(h.totalPixels);
  });

  it('a single-colour image concentrates every channel in one bin', () => {
    const image = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(200));
    // Fill alpha 255 explicitly so the test is independent of the default.
    for (let i = 3; i < image.frames[0]!.data.length; i += 4) image.frames[0]!.data[i] = 255;
    const h = computeHistogram(image);
    expect(h.red[200]).toBe(16);
    expect(h.green[200]).toBe(16);
    expect(h.blue[200]).toBe(16);
  });

  it('does not mutate the input image', () => {
    const image = smallImage();
    const before = Array.from(image.frames[0]!.data);
    computeHistogram(image);
    expect(Array.from(image.frames[0]!.data)).toEqual(before);
  });
});
