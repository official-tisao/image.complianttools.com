import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  AdjustOptionsSchema,
  applyAdjustments,
  applyBrightness,
  applyContrast,
  applyExposure,
  applyGamma,
  applyHighlights,
  applySaturation,
  applyShadows,
  applyTemperature,
  applyTint,
  compile,
  createRaster,
  executeTiled,
  preview,
} from '../src/index.js';
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
