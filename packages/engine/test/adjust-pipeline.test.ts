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
import type { Recipe } from '../src/index.js';

const px = (r: number, g: number, b: number, a = 255) =>
  createRaster(1, 1, new Uint8ClampedArray([r, g, b, a]));
const bytes = (image: { frames: readonly { data: Uint8ClampedArray }[] }) =>
  Array.from(image.frames[0].data);
const adjust = (options: Record<string, unknown>): Recipe => ({
  version: 1,
  id: 'p3-adjust',
  steps: [{ op: 'adjust', options }],
  export: { format: 'same' },
});

describe('adjust pipeline integration (P3-02.13)', () => {
  it.each([
    ['brightness', [100, 120, 140, 255], { brightness: 25 }, applyBrightness, 25],
    ['contrast', [100, 120, 140, 255], { contrast: 20 }, applyContrast, 20],
    ['saturation', [100, 120, 140, 255], { saturation: 30 }, applySaturation, 30],
    ['exposure', [100, 120, 140, 255], { exposure: 1 }, applyExposure, 1],
    ['gamma', [100, 120, 140, 255], { gamma: 1.5 }, applyGamma, 1.5],
    ['temperature', [100, 120, 140, 255], { temperature: 6500 }, applyTemperature, 6500],
    ['tint', [100, 120, 140, 255], { tint: 100 }, applyTint, 100],
    ['highlights', [230, 230, 230, 255], { highlights: 30 }, applyHighlights, 30],
    ['shadows', [10, 10, 10, 255], { shadows: 30 }, applyShadows, 30],
  ] as const)(
    'recipe with %s step changes pixels',
    async (_name, srcRgb, options, apply, rawValue) => {
      const src = px(srcRgb[0], srcRgb[1], srcRgb[2], srcRgb[3]);
      const viaRecipe = await preview(adjust(options), src);
      const viaDirect = apply(src, rawValue);
      expect(bytes(viaRecipe)).toEqual(bytes(viaDirect));
      expect(bytes(viaRecipe)).not.toEqual(bytes(src));
    },
  );

  it('multiple adjustment options in one step apply in the documented fixed order', async () => {
    const src = px(100, 120, 140);
    const out = await preview(adjust({ brightness: 10, saturation: 50 }), src);
    expect(bytes(out)).toEqual(bytes(applySaturation(applyBrightness(src, 10), 50)));
  });

  it('multiple adjustment steps apply in recipe order', async () => {
    const src = px(100, 120, 140);
    const recipe: Recipe = {
      version: 1,
      id: 'p3-order',
      steps: [
        { op: 'adjust', options: { brightness: 10 } },
        { op: 'adjust', options: { contrast: 20 } },
      ],
      export: { format: 'same' },
    };
    const out = await preview(recipe, src);
    expect(bytes(out)).toEqual(bytes(applyContrast(applyBrightness(src, 10), 20)));
  });

  it('a default/no-op adjustment does not alter pixels', async () => {
    const src = px(100, 120, 140);
    const out = await preview(adjust({ brightness: 0 }), src);
    expect(bytes(out)).toEqual(bytes(src));
    const empty = await preview(adjust({}), src);
    expect(bytes(empty)).toEqual(bytes(src));
  });

  it('leaves alpha unchanged through pipeline execution', async () => {
    const out = await preview(adjust({ brightness: 40 }), px(100, 120, 140, 77));
    expect(out.frames[0].data[3]).toBe(77);
  });

  it('processes transparent RGB pixels', async () => {
    const src = px(100, 120, 140, 0);
    const out = await preview(adjust({ brightness: 25 }), src);
    expect(bytes(out)).toEqual(bytes(applyBrightness(src, 25)));
    expect(out.frames[0].data[3]).toBe(0);
  });

  it('preserves RasterImage metadata through pipeline execution', async () => {
    const iccProfile = new Uint8Array([1, 2, 3]);
    const src = { ...px(100, 120, 140), iccProfile };
    const out = await preview(adjust({ brightness: 10 }), src);
    expect(out.iccProfile).toBe(iccProfile);
    expect(out.colorSpace).toBe(src.colorSpace);
    expect(out.bitDepth).toBe(src.bitDepth);
    expect(out.premultipliedAlpha).toBe(src.premultipliedAlpha);
  });

  it('rejects invalid adjustment options', async () => {
    await expect(preview(adjust({ brightness: 999 }), px(100, 120, 140))).rejects.toThrow();
  });

  it('still fuses adjacent adjustment steps into one pixel-local step', async () => {
    const recipe: Recipe = {
      version: 1,
      id: 'p3-fusion',
      steps: [
        { op: 'adjust', options: { brightness: 10 } },
        { op: 'adjust', options: { contrast: 20 } },
      ],
      export: { format: 'same' },
    };
    const plan = await compile(recipe, { width: 1, height: 1, format: 'png' });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.op).toBe('pixel-local');
  });

  it('tiled and non-tiled execution produce equivalent results for adjustments', async () => {
    const src = px(100, 120, 140);
    const opts = AdjustOptionsSchema.parse({ brightness: 25, contrast: 10 });
    const direct = applyAdjustments(src, opts);
    const tiled = executeTiled(src, (tile) => applyAdjustments(tile, opts), 512, 0);
    expect(bytes(tiled)).toEqual(bytes(direct));
    expect(bytes(tiled)).not.toEqual(bytes(src));
  });
});
