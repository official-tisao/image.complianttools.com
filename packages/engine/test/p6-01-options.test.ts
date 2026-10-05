/**
 * T12 / T21 P6-01 schema tests — PLAN.md STCC item 2 and 3.
 *
 * Two properties matter here and neither is obvious from reading the schema:
 *
 * 1. Every schema is `.strict()`, so a typo'd key is an error rather than a silently ignored
 *    option that leaves the tool running on a default the user never chose.
 * 2. Every default is a no-op. STCC item 3 requires that adopting generated controls cannot change
 *    a default export, so each assertion below is written as "the default equals the value the
 *    previous behaviour used".
 */

import { describe, expect, it } from 'vitest';

import { searchTargetSize } from '../src/pipeline/target-size.js';
import {
  GifMakerToolOptionsSchema,
  gifMakerToolOptionDescriptions,
} from '../src/schemas/options.js';
import {
  T13VideoGifOptionsSchema,
  T15SpritesheetOptionsSchema,
  T18HtmlToImageOptionsSchema,
  T21CompressToSizeOptionsSchema,
  T74FolderWatchOptionsSchema,
  t13VideoGifOptionDescriptions,
  t15SpritesheetOptionDescriptions,
  t18HtmlToImageOptionDescriptions,
  t21CompressToSizeOptionDescriptions,
  t74FolderWatchOptionDescriptions,
} from '../src/schemas/p6-01-options.js';
import type { OptionDescription } from '../src/schemas/options.js';

const schemas = {
  t13: T13VideoGifOptionsSchema,
  t15: T15SpritesheetOptionsSchema,
  t18: T18HtmlToImageOptionsSchema,
  t21: T21CompressToSizeOptionsSchema,
  t74: T74FolderWatchOptionsSchema,
} as const;

describe('P6-01 option schemas reject unknown keys', () => {
  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name} is strict`, () => {
      // A misspelled option that parsed would leave the tool silently running a default the
      // user never chose, which is exactly the failure `.strict()` exists to prevent.
      expect(schema.safeParse({ notAnOption: 1 }).success).toBe(false);
    });
  }

  it('the T12 GIF schema does NOT reject unknown keys', () => {
    // Recorded, not endorsed. `GifMakerToolOptionsSchema` predates this phase and is the one
    // P6-01 option schema that is not `.strict()`, so an unrecognised key is silently dropped
    // rather than reported. Every schema introduced in P6-01 is strict; making this one strict
    // too is a behaviour change to an existing route and is left out of this phase's scope.
    expect(GifMakerToolOptionsSchema.safeParse({ notAnOption: 1 }).success).toBe(true);
    expect(GifMakerToolOptionsSchema.safeParse({ delayMs: 'not a number' }).success).toBe(false);
  });
});

describe('P6-01 option defaults are no-ops', () => {
  it('T13 samples a bounded range at a bounded size', () => {
    const options = T13VideoGifOptionsSchema.parse({});
    expect(options).toEqual({
      trimStart: 0,
      trimEnd: 5,
      frameRate: 10,
      skipFrames: 1,
      maxFrames: 300,
      scaleWidth: 320,
    });
  });

  it('T15 packs with a derived grid and no trimming', () => {
    // 0 columns means "derive from the frame count", so the default does not impose a layout.
    expect(T15SpritesheetOptionsSchema.parse({})).toEqual({
      mode: 'pack',
      columns: 0,
      rows: 0,
      padding: 0,
      trim: 'none',
      emitAtlas: true,
    });
  });

  it('T18 reproduces the geometry the previous shell hard-coded', () => {
    expect(T18HtmlToImageOptionsSchema.parse({})).toEqual({
      width: 1200,
      padding: 64,
      fontSize: 18,
      background: '#ffffff',
      color: '#1c1a17',
    });
  });

  it('T21 searches quality then dimensions, matching the documented strategy', () => {
    expect(T21CompressToSizeOptionsSchema.parse({})).toEqual({
      targetValue: 200,
      targetUnit: 'KB',
      format: 'jpeg',
      strategy: 'quality-then-scale',
      tolerancePercent: 2,
      background: '#ffffff',
    });
  });

  it('T74 watches at 200 KB-equivalent quality and one-second polling', () => {
    expect(T74FolderWatchOptionsSchema.parse({})).toEqual({
      format: 'webp',
      quality: 82,
      recursive: false,
      pollIntervalMs: 1000,
      skipExisting: false,
    });
  });

  it('T12 defaults match the values the route previously hard-coded', () => {
    const options = GifMakerToolOptionsSchema.parse({});
    expect(options.delayMs).toBe(100);
    expect(options.loopCount).toBe(0);
    expect(options.frameGenerator).toBe('forward');
    expect(options.paletteMode).toBe('adaptive');
    expect(options.quantizer).toBe('median-cut');
    expect(options.dither).toBe('floyd-steinberg');
  });
});

describe('P6-01 option ranges reject adversarial values', () => {
  it('T13 rejects a negative trim and a frame rate above the documented ceiling', () => {
    expect(T13VideoGifOptionsSchema.safeParse({ trimStart: -1 }).success).toBe(false);
    expect(T13VideoGifOptionsSchema.safeParse({ frameRate: 61 }).success).toBe(false);
    expect(T13VideoGifOptionsSchema.safeParse({ frameRate: 2.5 }).success).toBe(false);
    expect(T13VideoGifOptionsSchema.safeParse({ maxFrames: 0 }).success).toBe(false);
  });

  it('T15 rejects a negative column count and out-of-range padding', () => {
    expect(T15SpritesheetOptionsSchema.safeParse({ columns: -1 }).success).toBe(false);
    expect(T15SpritesheetOptionsSchema.safeParse({ padding: 513 }).success).toBe(false);
    expect(T15SpritesheetOptionsSchema.safeParse({ trim: 'diagonal' }).success).toBe(false);
  });

  it('T18 rejects a non-hex colour and an out-of-range width', () => {
    expect(T18HtmlToImageOptionsSchema.safeParse({ background: 'white' }).success).toBe(false);
    expect(T18HtmlToImageOptionsSchema.safeParse({ color: '#12345' }).success).toBe(false);
    expect(T18HtmlToImageOptionsSchema.safeParse({ width: 63 }).success).toBe(false);
    expect(T18HtmlToImageOptionsSchema.safeParse({ fontSize: 1 }).success).toBe(false);
  });

  it('T21 rejects a zero target and an unknown unit', () => {
    expect(T21CompressToSizeOptionsSchema.safeParse({ targetValue: 0 }).success).toBe(false);
    expect(T21CompressToSizeOptionsSchema.safeParse({ targetUnit: 'GB' }).success).toBe(false);
    expect(T21CompressToSizeOptionsSchema.safeParse({ tolerancePercent: 0 }).success).toBe(false);
  });

  it('T74 rejects an out-of-range quality and poll interval', () => {
    expect(T74FolderWatchOptionsSchema.safeParse({ quality: 0 }).success).toBe(false);
    expect(T74FolderWatchOptionsSchema.safeParse({ quality: 101 }).success).toBe(false);
    expect(T74FolderWatchOptionsSchema.safeParse({ pollIntervalMs: 10 }).success).toBe(false);
  });
});

describe('P6-01 option metadata matches its schema', () => {
  const cases = [
    ['t13', T13VideoGifOptionsSchema, t13VideoGifOptionDescriptions, 't13'],
    ['t15', T15SpritesheetOptionsSchema, t15SpritesheetOptionDescriptions, 't15'],
    ['t18', T18HtmlToImageOptionsSchema, t18HtmlToImageOptionDescriptions, 't18'],
    ['t21', T21CompressToSizeOptionsSchema, t21CompressToSizeOptionDescriptions, 't21'],
    ['t74', T74FolderWatchOptionsSchema, t74FolderWatchOptionDescriptions, 't74'],
    ['gifMaker', GifMakerToolOptionsSchema, gifMakerToolOptionDescriptions, 'gifMaker'],
  ] as const;

  for (const [label, schema, table, prefix] of cases) {
    it(`${label} declares every option and keeps its defaults in step`, () => {
      const parsed = schema.parse({}) as Record<string, unknown>;

      // Every schema key must have a control, and every control must name a schema key: a control
      // with no schema field would silently do nothing, and a schema field with no control would
      // be unreachable from the UI.
      for (const key of Object.keys(parsed))
        expect(Object.keys(table), `${label}.${key} has metadata`).toContain(`${prefix}.${key}`);
      for (const path of Object.keys(table))
        expect(path.startsWith(`${prefix}.`), `${path} is namespaced`).toBe(true);

      for (const [key, value] of Object.entries(parsed)) {
        const entry = Object.entries(table).find(([path]) => path === `${prefix}.${key}`)?.[1] as
          OptionDescription | undefined;
        expect(entry, `${key} metadata`).toBeDefined();
        // A mismatch here is how a control ends up displaying one value while the schema holds
        // another, so the two must never drift apart silently.
        expect(entry!.defaultValue, `${key} default`).toEqual(value);
      }
    });
  }
});

describe('searchTargetSize reports what it actually achieved', () => {
  /** A stand-in encoder whose size falls as quality rises, so the search has something to find. */
  const encoder =
    (sizes: Readonly<Record<number, number>>) =>
    async (quality: number): Promise<ArrayBuffer> => {
      const size = sizes[quality] ?? 1000;
      return new ArrayBuffer(size);
    };

  it('returns the closest result when the target is unreachable', async () => {
    // Every encoding here is far above the 10-byte target, so no attempt can hit it.
    const result = await searchTargetSize(10, encoder({ 82: 50_000, 50: 90_000, 20: 140_000 }));
    expect(result.bytes).toBeGreaterThan(10);
    expect(result.warning).toMatch(/Closest result/iu);
    // The warning must state the real size, not claim the target was met.
    expect(result.warning).toContain(String(result.bytes));
  });

  it('stops early once it lands within tolerance', async () => {
    const calls: number[] = [];
    const result = await searchTargetSize(
      100_000,
      async (quality) => {
        calls.push(quality);
        return new ArrayBuffer(100_500);
      },
      { tolerance: 0.02 },
    );
    expect(result.warning).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('scales down when quality alone cannot reach the budget', async () => {
    const scales: number[] = [];
    await searchTargetSize(
      1_000,
      async (_quality, scale) => {
        scales.push(scale);
        return new ArrayBuffer(Math.round(100_000 * scale));
      },
      { strategy: 'quality-then-scale', tolerance: 0.001 },
    );
    // The documented dimension search: after a full quality pass, the encoder is asked again
    // at a reduced scale.
    expect(scales.some((scale) => scale < 1)).toBe(true);
  });

  it('reports every attempt for the progress readout', async () => {
    const result = await searchTargetSize(100_000, encoder({}), { tolerance: 0.0001 });
    expect(result.attempts.length).toBeGreaterThan(1);
    expect(result.attempts.every((attempt) => typeof attempt.iteration === 'number')).toBe(true);
  });

  it('honours an abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      searchTargetSize(1000, encoder({}), { signal: controller.signal }),
    ).rejects.toThrowError(/cancelled/iu);
  });
});
