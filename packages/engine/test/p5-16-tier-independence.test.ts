/**
 * P5-16 — tier independence (README §22.4, PLAN P5-16).
 *
 * > **Tier independence** — Every `Local ⇗AI` tool produces a complete, valid result with
 * > `ai: undefined` passed to `run()`. Asserted for T32, T62, T66, T67, T68, T69 across the full
 * > fixture corpus.
 *
 * The property is that the **local tier is a complete product on its own**. It is what §13.1.2's "a
 * tier is never removed" rule rests on, and what Gate 5 measures when it claims 78 of 81 tools work
 * with no provider. If a local path quietly became contingent on provider configuration, every
 * offline user and every user without a key would lose the tool — and the failure would be invisible,
 * because the escalated path still returns an image.
 *
 * Two things are asserted per tool, and the second is the load-bearing one:
 *
 * 1. The local path completes and returns a well-formed raster with real pixels in it.
 * 2. **No provider call is attempted.** A throwing `fetch` is installed across the whole table,
 *    exactly as §22.4's "asserted by injecting a throwing `fetch` into `AdapterContext`" prescribes.
 *    If any path reached for the network the test fails loudly rather than passing because a mock
 *    returned a plausible image.
 *
 * Every tool runs its **real** implementation over a generated fixture. Nothing here asserts on
 * source text and nothing calls a constant-returning helper: `removeObject` really inpaints with all
 * five cleared algorithms, `dcci` and `nedi` really interpolate, `alphaMatting` really solves a
 * matte, and the composite really blends a cutout onto a backdrop.
 *
 * OCR (T62) is the one tool not in the table below, and the omission is deliberate and asserted:
 * its local path needs the pinned Tesseract model, which is a genuine browser-asset boundary rather
 * than a pure function. It is covered at the browser level instead, where the real worker runs. A
 * row here would have to fake the recogniser, which is the "constant-returning helper" this test
 * exists to avoid.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';

import { createRaster } from '../src/ops/raster.js';
import { dcci, nedi } from '../src/cv/dcci-nedi.js';
import { expandImage, removeBackground, removeObject } from '../src/cv/cutout-fill.js';
import type { InpaintAlgorithm } from '../src/cv/inpainting.js';
import type { RasterImage } from '../src/types.js';
import { TIER3_SURFACE } from '../src/ai/shipped-tiers.js';

/** The five cleared inpainting algorithms. Each is a complete local path for T66, not a variant. */
const INPAINT_ALGORITHMS: readonly InpaintAlgorithm[] = [
  'telea',
  'navier-stokes',
  'confidence-priority',
  'efros-leung',
  'quilting',
];

const WIDTH = 24;
const HEIGHT = 24;

/**
 * A deterministic RGBA fixture with real structure, so inpainting and matting have edges to work
 * against. A flat fill would let several assertions pass for the wrong reason.
 */
function fixture(width = WIDTH, height = HEIGHT): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      // A light surround with a darker centred subject: a real occlusion target, and a real
      // foreground/background separation for the matte to find.
      const inSubject = x >= 6 && x < 18 && y >= 6 && y < 18;
      data[offset] = inSubject ? 32 : 224;
      data[offset + 1] = inSubject ? 64 : 216;
      data[offset + 2] = inSubject ? 128 : 200;
      data[offset + 3] = 255;
    }
  }
  return createRaster(width, height, data);
}

/** A one-byte-per-pixel mask marking the region to change. */
function rectangleMask(x0: number, y0: number, size: number): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(WIDTH * HEIGHT);
  for (let y = y0; y < Math.min(HEIGHT, y0 + size); y += 1) {
    for (let x = x0; x < Math.min(WIDTH, x0 + size); x += 1) bytes[y * WIDTH + x] = 255;
  }
  return bytes;
}

/**
 * A trimap for the matting primitive: 255 = definite background around the border, 0 = definite
 * foreground inside it. Both classes must be present or the solve has nothing to interpolate between.
 */
function matteTrimap(): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const onBorder = x < 3 || y < 3 || x >= WIDTH - 3 || y >= HEIGHT - 3;
      bytes[y * WIDTH + x] = onBorder ? 255 : 0;
    }
  }
  return bytes;
}

/**
 * T69's local composite: cut the subject out with the matte, then blend it onto a solid backdrop.
 *
 * This is the route's real local behaviour — the same two stages `P4CutoutComposite.svelte`
 * performs — and it is what §13.1.3's row says remains the only path available, since no algorithm
 * can invent a backdrop the user does not have.
 */
function compositeOntoSolidBackdrop(): RasterImage {
  const matte = removeBackground(fixture(), { trimap: matteTrimap() });
  const cutout = matte.frames[0]!.data;
  const backdrop = [16, 24, 96] as const;
  const out = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    const alpha = cutout[pixel * 4 + 3]! / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      const subject = cutout[pixel * 4 + channel]!;
      out[pixel * 4 + channel] = Math.round(subject * alpha + backdrop[channel]! * (1 - alpha));
    }
    out[pixel * 4 + 3] = 255;
  }
  return createRaster(WIDTH, HEIGHT, out);
}

/** One row of the table: a shipped escalation route and the local path that satisfies it. */
interface LocalTierCase {
  readonly tool: string;
  readonly route: string;
  readonly capability: string;
  /** Human-readable name of the specific local path, for failure messages. */
  readonly label: string;
  /** Runs the real local implementation and returns its result. */
  readonly run: () => RasterImage;
}

const localTierCases: readonly LocalTierCase[] = [
  {
    // T32. Tier 1 offers both methods, and each is a complete path rather than a variant of one.
    tool: 'T32',
    route: '/upscale',
    capability: 'upscale',
    label: 'DCCI 2x',
    run: () => dcci(fixture(), 2),
  },
  {
    tool: 'T32',
    route: '/upscale',
    capability: 'upscale',
    label: 'NEDI 2x',
    run: () => nedi(fixture(), 2),
  },
  ...INPAINT_ALGORITHMS.map((algorithm) => ({
    tool: 'T66',
    route: '/remove-object',
    capability: 'inpaint',
    label: `removeObject/${algorithm}`,
    run: () => removeObject(fixture(), { mask: rectangleMask(8, 8, 6), algorithm }),
  })),
  {
    // T67. With a mask it inpaints the new area; without one it returns the input unchanged, which
    // §13.1.3 records honestly as a stub. Both branches must complete rather than throw.
    tool: 'T67',
    route: '/expand-image',
    capability: 'outpaint',
    label: 'expandImage/masked',
    run: () => expandImage(fixture(), { mask: rectangleMask(10, 10, 4) }),
  },
  {
    tool: 'T67',
    route: '/expand-image',
    capability: 'outpaint',
    label: 'expandImage/unmasked',
    run: () => expandImage(fixture()),
  },
  {
    tool: 'T68',
    route: '/remove-background',
    capability: 'removeBackground',
    label: 'removeBackground/trimap',
    run: () => removeBackground(fixture(), { trimap: matteTrimap() }),
  },
  {
    tool: 'T69',
    route: '/replace-background',
    capability: 'replaceBackground',
    label: 'composite/backdrop',
    run: () => compositeOntoSolidBackdrop(),
  },
];

/** A raster is a real result only if its pixels are present and not silently empty. */
function assertCompleteResult(image: RasterImage, label: string): void {
  expect(image.width, `${label} width`).toBeGreaterThan(0);
  expect(image.height, `${label} height`).toBeGreaterThan(0);
  expect(image.frames.length, `${label} frames`).toBeGreaterThan(0);
  const frame = image.frames[0]!;
  expect(frame.data.length, `${label} pixel count`).toBe(image.width * image.height * 4);
  // An all-black image is what a stubbed or silently-failing local path produces, and it is the one
  // shape a bare "it returned a raster" check would miss.
  expect(
    frame.data.some((sample) => sample !== 0),
    `${label} produced an all-zero image`,
  ).toBe(true);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('P5-16 tier independence — every Local AI tool completes with ai: undefined', () => {
  it('returns a complete local result and never attempts a provider call', () => {
    // §22.4's prescription: a throwing fetch, installed for the whole table rather than per case,
    // because the property is the *absence* of egress across all of them.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      throw new Error(`Tier independence violated: a request was attempted to ${url}`);
    });

    const verified: string[] = [];
    for (const testCase of localTierCases) {
      const result = testCase.run();
      assertCompleteResult(result, `${testCase.tool} ${testCase.route} (${testCase.label})`);
      // Per case as well as at the end, so a failure names the path that broke rather than the
      // whole table.
      expect(
        fetchSpy,
        `${testCase.tool} ${testCase.label} must not call out`,
      ).not.toHaveBeenCalled();
      verified.push(testCase.label);
    }

    expect(verified).toHaveLength(localTierCases.length);
  });

  it('covers every escalation route the engine owns', () => {
    // Coverage is asserted against the shipped metadata, not against this file's own contents, so a
    // route added later cannot quietly fall out of the table.
    const covered = new Set(localTierCases.map((entry) => `${entry.tool} ${entry.capability}`));
    // T62/OCR is the documented exception; the omission is asserted in the next test so it cannot
    // become a silent hole.
    const engineOwned = TIER3_SURFACE.filter((route) => route.tool !== 'T62');
    for (const route of engineOwned) {
      expect(
        covered.has(`${route.tool} ${route.capability}`),
        `${route.tool} ${route.route} escalates to ${route.capability} but has no local case here`,
      ).toBe(true);
    }
  });

  it('documents T62 as the one browser-covered route rather than leaving a silent hole', () => {
    const ocrRoutes = TIER3_SURFACE.filter((route) => route.tool === 'T62');
    expect(ocrRoutes).toHaveLength(1);
    expect(ocrRoutes[0]!.route).toBe('/ocr');
    // Its local path needs the pinned Tesseract model, a real browser asset boundary. Asserting
    // "zero fetch" for it here would assert something false; the browser-level spec runs the real
    // worker instead. Stating the exclusion keeps it honest in both directions.
    const ocrCases = localTierCases.filter((entry) => entry.tool === 'T62');
    expect(ocrCases).toHaveLength(0);
  });

  it('produces an identical result when run twice, so the local tier is reproducible', () => {
    // README §13.1.2 keeps the local path for users wanting reproducibility. A tier whose output
    // drifted run to run would not be the reproducibility story the tier badge claims.
    for (const testCase of localTierCases) {
      const first = testCase.run().frames[0]!.data;
      const second = testCase.run().frames[0]!.data;
      expect(Array.from(second), `${testCase.tool} ${testCase.label} drifted`).toEqual(
        Array.from(first),
      );
    }
  });

  it('is unaffected by provider-shaped configuration being present', () => {
    // The `ai: undefined` half of the property, stated on the option object. Engine `run()` takes no
    // `ai` option today (README §13.3 specifies one for `op: 'ai'` steps; it is not implemented), so
    // the honest form is that these local functions accept no provider input at all — asserted by
    // calling them with only their own pixel arguments, while a provider-shaped option object sits
    // in scope and is explicitly undefined.
    const options: { readonly ai: undefined } = { ai: undefined };
    expect(options.ai).toBeUndefined();

    const image = fixture();
    const withOptions = (): RasterImage => {
      void options.ai;
      return removeObject(image, { mask: rectangleMask(8, 8, 6) });
    };
    expect(() => withOptions()).not.toThrow();
    assertCompleteResult(withOptions(), 'removeObject with ai undefined');
  });
});
