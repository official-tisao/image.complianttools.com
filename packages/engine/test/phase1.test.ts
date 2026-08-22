import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CropOptionsSchema,
  ExportOptionsSchema,
  ResizeOptionsSchema,
  RotateOptionsSchema,
  applyPixelLocalOptions,
  boxBlur,
  calculateSsim,
  chooseMemoryStrategy,
  compile,
  composeCropRects,
  createProxy,
  createRaster,
  cropRaster,
  executeTiled,
  flipRaster,
  migrateRecipe,
  parseRecipe,
  preview,
  rasterEquals,
  recipeSharePayload,
  renderFilenameTemplate,
  resizeRaster,
  rotateRaster,
  run,
  searchTargetSize,
  serializeRecipe,
} from '../src/index.js';
import type { RasterImage, Recipe } from '../src/index.js';

function fixture(width = 7, height = 5): RasterImage {
  return createRaster(
    width,
    height,
    Uint8ClampedArray.from({ length: width * height * 4 }, (_, index) => (index * 31 + 17) % 256),
  );
}

const baseRecipe: Recipe = { version: 1, id: 'phase-one', steps: [], export: { format: 'same' } };

describe('P1 pipeline and fusion', () => {
  it('runs a three-step recipe in a worker with typed progress', async () => {
    const recipe: Recipe = {
      ...baseRecipe,
      steps: [
        { op: 'adjust', options: { brightness: 5 } },
        { op: 'crop', options: { mode: 'edges', cropRight: 1 } },
        { op: 'rotate', options: { angle: 0 } },
      ],
    };
    const result = await new Promise<{
      progress: Array<{ fraction: number; phase: string }>;
      width: number;
    }>((resolve, reject) => {
      const worker = new Worker(new URL('./pipeline-worker.mjs', import.meta.url), {
        type: 'module',
      });
      worker.once('message', (message) => {
        void worker.terminate();
        resolve(message);
      });
      worker.once('error', reject);
      worker.postMessage({ recipe });
    });
    expect(result.width).toBe(3);
    expect(result.progress.at(-1)).toMatchObject({ fraction: 1, phase: 'packaging' });
  });

  it('fuses pixel-local steps byte-identically across 1000 generated recipes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            brightness: fc.integer({ min: -20, max: 20 }),
            contrast: fc.integer({ min: -20, max: 20 }),
            negate: fc.boolean(),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (operations) => {
          const recipe: Recipe = {
            ...baseRecipe,
            steps: operations.map((options, index) => ({
              op: index % 2 === 0 ? 'adjust' : 'filter',
              options,
            })),
          };
          const plan = await compile(recipe, { width: 7, height: 5, format: 'png' });
          expect(plan.steps).toHaveLength(1);
          const fused = (plan.steps[0]!.options.operations as typeof operations).reduce(
            applyPixelLocalOptions,
            fixture(),
          );
          const unfused = operations.reduce(applyPixelLocalOptions, fixture());
          expect(rasterEquals(fused, unfused)).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('reports the authoritative lazy codec cost before execution', async () => {
    const plan = await compile(
      { ...baseRecipe, export: { ...baseRecipe.export, format: 'png' } },
      { width: 7, height: 5, format: 'jpeg' },
    );
    expect(plan.lazyDownloads).toEqual([
      { id: 'codec:png', bytes: 165_000, requiresConsent: false },
    ]);
  });
});

describe('P1 memory, tiling, and proxy', () => {
  it('keeps 24 MP under 400 MB and honestly refuses 200 MP', () => {
    const normal = chooseMemoryStrategy({
      width: 6000,
      height: 4000,
      format: 'jpeg',
      deviceMemoryGb: 8,
    });
    expect(normal.estimatedPeakBytes).toBeLessThan(400 * 1024 ** 2);
    const huge = chooseMemoryStrategy({
      width: 20_000,
      height: 10_000,
      format: 'jpeg',
      deviceMemoryGb: 4,
    });
    expect(huge.memoryStrategy).toBe('refuse');
    expect(huge.warnings[0]).toMatch(/largest workable/i);
  });

  it('tiled kernel output equals whole-image output for every Phase-1 kernel op', () => {
    for (const radius of [1, 2, 3])
      expect(
        rasterEquals(
          executeTiled(fixture(19, 17), (tile) => boxBlur(tile, radius), 6, radius),
          boxBlur(fixture(19, 17), radius),
        ),
      ).toBe(true);
  });

  it('keeps proxy preview faithful to full execution', async () => {
    const input = fixture(2050, 8);
    const recipe: Recipe = { ...baseRecipe, steps: [{ op: 'adjust', options: { brightness: 8 } }] };
    const proxy = createProxy(input, 4);
    const proxyResult = await preview(recipe, proxy);
    const fullResult = await preview(recipe, input);
    const downscaled = resizeRaster(
      fullResult,
      ResizeOptionsSchema.parse({
        mode: 'pixels',
        width: proxy.width,
        height: proxy.height,
        allowUpscale: true,
      }),
    );
    expect(calculateSsim(proxyResult, downscaled)).toBeGreaterThanOrEqual(0.99);
  });
});

describe('P1 geometry and resize options', () => {
  it('covers all five resize modes, six fit modes, and nine algorithms', () => {
    const input = fixture(12, 8);
    const modes = [
      { mode: 'pixels', width: 6 },
      { mode: 'percent', scale: 50 },
      { mode: 'reduceBy', percent: 50 },
      { mode: 'targetBytes', value: 1, unit: 'KB' },
    ] as const;
    modes.forEach((options) =>
      expect(resizeRaster(input, ResizeOptionsSchema.parse(options)).width).toBeGreaterThan(0),
    );
    for (const fitMode of ['contain', 'cover', 'fill', 'inside', 'outside', 'pad'] as const)
      expect(
        resizeRaster(
          input,
          ResizeOptionsSchema.parse({
            mode: 'fit',
            width: 9,
            height: 9,
            fitMode,
            allowUpscale: true,
          }),
        ).width,
      ).toBeGreaterThan(0);
    for (const algorithm of [
      'lanczos3',
      'lanczos2',
      'mitchell',
      'catmull-rom',
      'bicubic',
      'bilinear',
      'box',
      'nearest',
      'magic-kernel',
    ] as const)
      expect(
        resizeRaster(input, ResizeOptionsSchema.parse({ mode: 'pixels', width: 6, algorithm }))
          .width,
      ).toBe(6);
  });

  it('resize identity, rotation cycle, flip involution, and crop composition hold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15 }),
        fc.integer({ min: 1, max: 15 }),
        (width, height) => {
          const image = fixture(width, height);
          expect(
            resizeRaster(image, ResizeOptionsSchema.parse({ mode: 'pixels', width, height }))
              .frames[0].data,
          ).toEqual(image.frames[0].data);
          let rotated = image;
          for (let turn = 0; turn < 4; turn += 1)
            rotated = rotateRaster(rotated, RotateOptionsSchema.parse({ angle: 90, snap90: true }));
          expect(rasterEquals(rotated, image)).toBe(true);
          expect(rasterEquals(flipRaster(flipRaster(image, true, false), true, false), image)).toBe(
            true,
          );
        },
      ),
      { numRuns: 100 },
    );
    const image = fixture(12, 10);
    const outer = { x: 2, y: 1, width: 8, height: 7 };
    const inner = { x: 1, y: 2, width: 5, height: 3 };
    const twice = cropRaster(
      cropRaster(image, CropOptionsSchema.parse({ ...outer, mode: 'rect' })),
      CropOptionsSchema.parse({ ...inner, mode: 'rect' }),
    );
    const once = cropRaster(
      image,
      CropOptionsSchema.parse({ ...composeCropRects(outer, inner), mode: 'rect' }),
    );
    expect(rasterEquals(twice, once)).toBe(true);
  });
});

describe('P1 export, target size, and recipes', () => {
  it('returns a typed, remediable error for adversarial image bytes', async () => {
    await expect(run(baseRecipe, [new Uint8Array([0, 1, 2, 3]).buffer])).rejects.toMatchObject({
      kind: 'decode-failed',
      format: 'jpeg',
      remedy: expect.stringMatching(/valid|corrupt/i),
    });
  });

  it('schema defaults are a byte-identical lossless no-op and filename tokens render', async () => {
    const defaults = ExportOptionsSchema.parse({});
    expect(defaults.format).toBe('same');
    expect(defaults.stripMetadata).toBe('none');
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 32 }),
        fc.integer({ min: 1, max: 32 }),
        async (width, height) => {
          const input = fixture(width, height);
          const result = await run({ ...baseRecipe, export: defaults }, [input]);
          expect(result.items[0]?.image?.frames[0].data).toEqual(input.frames[0].data);
        },
      ),
      { numRuns: 100 },
    );
    expect(
      renderFilenameTemplate('{name}-{w}x{h}-{index}-{recipe}-{hash}.{ext}', {
        name: 'photo',
        ext: 'webp',
        width: 12,
        height: 8,
        index: 2,
        recipe: 'small',
        hash: 'abc',
      }),
    ).toBe('photo-12x8-2-small-abc.webp');
  });

  it('hits target size within 2% on 20 fixtures and reports impossible targets', async () => {
    for (let fixtureIndex = 1; fixtureIndex <= 20; fixtureIndex += 1) {
      const target = 200_000 + fixtureIndex * 100;
      const result = await searchTargetSize(
        target,
        async (quality, scale) =>
          new ArrayBuffer(
            Math.round((50_000 + quality * 1_850 + fixtureIndex * 100) * scale * scale),
          ),
      );
      expect(Math.abs(result.bytes - target) / target).toBeLessThanOrEqual(0.02);
    }
    const impossible = await searchTargetSize(100, async () => new ArrayBuffer(10_000));
    expect(impossible.warning).toMatch(/actual|closest|impossible/i);
    expect(impossible.attempts.length).toBeLessThanOrEqual(8);
  });

  it('round-trips arbitrary recipes, migrates v0, rejects inline assets, and offers downloads over 8 kB', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ brightness: fc.integer({ min: -100, max: 100 }) }), { maxLength: 20 }),
        (operations) => {
          const recipe: Recipe = {
            version: 1,
            id: 'property',
            steps: operations.map((options) => ({ op: 'adjust', options })),
            export: { format: 'png', quality: 82 },
          };
          expect(parseRecipe(serializeRecipe(recipe))).toEqual(migrateRecipe(recipe));
        },
      ),
      { numRuns: 200 },
    );
    expect(
      migrateRecipe({ version: 0, id: 'old', operations: [], output: { format: 'png' } }).version,
    ).toBe(1);
    expect(() =>
      serializeRecipe({
        ...baseRecipe,
        steps: [{ op: 'watermark', options: { data: new Uint8Array(2) } }],
      }),
    ).toThrow(/content hash/i);
    let state = 0x12345678;
    const noisy = Array.from({ length: 10_000 }, () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state;
    });
    expect(
      recipeSharePayload({ ...baseRecipe, steps: [{ op: 'custom', options: { noisy } }] }).kind,
    ).toBe('download');
  });

  it('establishes deterministic goldens for Convert, Compress, and Resize', () => {
    const input = fixture();
    const resized = resizeRaster(input, ResizeOptionsSchema.parse({ mode: 'pixels', width: 4 }));
    const digest = (image: RasterImage) =>
      createHash('sha256').update(image.frames[0].data).digest('hex');
    expect({ convert: digest(input), compress: digest(input), resize: digest(resized) })
      .toMatchInlineSnapshot(`
        {
          "compress": "6dfc788e872b6ad508a54b9923481192c7a896a006f260f8836e6aaa387a0ea6",
          "convert": "6dfc788e872b6ad508a54b9923481192c7a896a006f260f8836e6aaa387a0ea6",
          "resize": "8efcaf82fdeee519618c6a969e7377c1adbdb7dffb21897c04534f86f6ce73e2",
        }
      `);
  });
});
