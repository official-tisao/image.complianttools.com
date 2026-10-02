/**
 * P5-11 — the Stability / BFL / fal.ai adapter surface (README §14.4–§14.6).
 *
 * ## Why this file was rewritten rather than repaired
 *
 * It previously existed as `p5-11-contract.test.mjs`. That extension is excluded from the engine's
 * vitest run by design, and it was not imported by `test/all.test.mjs` either, so **it had never
 * executed** — `pnpm test` reported success while running none of it. It also imported from
 * `vitest`, so even running it directly could not have worked. The tests below are the `.ts`
 * equivalent, which vitest does collect.
 *
 * ## What these tests do and do not claim
 *
 * They assert on the *request description* these three adapters return. That is the correct thing
 * to pin here, because it is genuinely all the behaviour that exists: none of these three adapters
 * has a `run()` that performs its capability (see `adapter-contracts.ts`, whose allowlist is
 * `openai` and `anthropic` only). The tests therefore verify two separate claims:
 *
 * 1. the documented request shape is what §14.4–§14.6 specify, and
 * 2. the adapter is not silently offered to a user as if it worked — which is the property that
 *    actually protects a user, and the reason the allowlist exists at all.
 *
 * Asserting (1) without (2) is how a stub gets mistaken for a working provider, so both are here.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerProvider,
  clearRegistry,
  getProvider,
  registeredCount,
} from '../src/ai/registry.js';
import { stabilityAdapter } from '../src/ai/adapters/stability.js';
import { bflAdapter } from '../src/ai/adapters/bfl.js';
import { falAdapter } from '../src/ai/adapters/fal.js';
import {
  adapterIsImplemented,
  adapterImplementsCapability,
  implementedAdapterIds,
  resultIsUsable,
} from '../src/ai/adapter-contracts.js';
import type { AdapterContext, AiResult, ProviderAdapter } from '../src/ai/types.js';
import type { RasterImage } from '../src/types.js';

const CREDENTIAL = 'sk-p5-11-must-never-be-echoed';

function ctxFor(adapter: ProviderAdapter): AdapterContext {
  return {
    credentials: { apiKey: CREDENTIAL },
    baseUrl: adapter.descriptor.defaultBaseUrl,
    fetch: globalThis.fetch,
  };
}

/** `AiResult.raw` is typed `unknown`; every assertion goes through this. */
function rawOf(result: AiResult): Record<string, unknown> {
  return (result.raw ?? {}) as Record<string, unknown>;
}

/**
 * A minimal 2×2 opaque image, so a request that carries a mask is genuinely a masked request.
 *
 * These adapters only inspect the request's *shape* — none decodes the frame — so the pixels are
 * arbitrary; what matters is that a mask is present, because that is the branch whose polarity is
 * being asserted.
 */
function maskImage(): RasterImage {
  return {
    width: 2,
    height: 2,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: new Uint8ClampedArray(2 * 2 * 4).fill(255), durationMs: 0 }],
  };
}

describe('P5-11 — adapter registration (§14.4–§14.6)', () => {
  beforeEach(() => clearRegistry());
  afterEach(() => clearRegistry());

  it('registers each of the three adapters', () => {
    registerProvider(stabilityAdapter);
    registerProvider(bflAdapter);
    registerProvider(falAdapter);

    expect(getProvider('stability')).toBeDefined();
    expect(getProvider('bfl')).toBeDefined();
    expect(getProvider('fal')).toBeDefined();
    expect(registeredCount()).toBe(3);
  });

  it('registers all three without an id collision', () => {
    registerProvider(stabilityAdapter);
    registerProvider(bflAdapter);
    registerProvider(falAdapter);
    expect(registeredCount()).toBe(3);
  });
});

describe('P5-11 — these three adapters are documented, not implemented', () => {
  /**
   * The load-bearing honesty check for this file.
   *
   * Each adapter's descriptor declares real capabilities, and each `run()` returns a description of
   * the request it would make. If a future change adds one to the allowlist without giving it a real
   * `run()`, this fails — which is the point: §4.9 forbids reporting a placeholder as a success.
   */
  it('none of the three is in the implemented allowlist', () => {
    for (const adapter of [stabilityAdapter, bflAdapter, falAdapter]) {
      expect(adapterIsImplemented(adapter), adapter.descriptor.id).toBe(false);
    }
    expect(implementedAdapterIds()).not.toContain('stability');
    expect(implementedAdapterIds()).not.toContain('bfl');
    expect(implementedAdapterIds()).not.toContain('fal');
  });

  it('each adapter claims every capability it declares is unimplemented', () => {
    for (const adapter of [stabilityAdapter, bflAdapter, falAdapter]) {
      for (const capability of adapter.descriptor.capabilities) {
        expect(
          adapterImplementsCapability(adapter, capability),
          `${adapter.descriptor.id}/${capability}`,
        ).toBe(false);
      }
    }
  });

  it('run() returns a description that is not usable as a result', () => {
    // The concrete failure mode: an image capability returning no pixels still "succeeds" as a
    // promise. `resultIsUsable` is what the UI consults, and it must reject all of these.
    for (const [adapter, capability] of [
      [stabilityAdapter, 'inpaint'],
      [bflAdapter, 'generate'],
      [falAdapter, 'removeBackground'],
    ] as const) {
      return adapter
        .run(
          { capability, model: adapter.descriptor.models[0]?.id ?? 'test-model' },
          ctxFor(adapter),
        )
        .then((result) => {
          expect(resultIsUsable(result, capability)).toBe(false);
        });
    }
  });
});

describe('P5-11 — Stability request shape (§14.4)', () => {
  it('maps each capability to its documented endpoint', async () => {
    const cases: Array<[string, string]> = [
      ['inpaint', '/v2beta/stable-image/edit/inpaint'],
      ['erase', '/v2beta/stable-image/edit/erase'],
      ['outpaint', '/v2beta/stable-image/edit/outpaint'],
      ['removeBackground', '/v2beta/stable-image/edit/remove-background'],
      ['replaceBackground', '/v2beta/stable-image/edit/replace-background-and-relight'],
      ['upscale', '/v2beta/stable-image/upscale/fast'],
      ['generate', '/v2beta/stable-image/generate/core'],
    ];
    for (const [capability, path] of cases) {
      const result = await stabilityAdapter.run(
        { capability: capability as never, model: 'stable-image-core' },
        ctxFor(stabilityAdapter),
      );
      expect(rawOf(result).endpoint, capability).toBe(path);
    }
  });

  it("reports mask polarity as UNVERIFIED, matching README §14.4's ⚠ VERIFY marker", () => {
    // §14.4 asserts the polarity matches and marks the same sentence "⚠ VERIFY per endpoint". With
    // no live run behind it, claiming verification is the over-claim §4.9 forbids — and it is the
    // exact error this file previously pinned in place with `expect(...).toBe(true)`.
    return stabilityAdapter
      .run(
        {
          capability: 'inpaint',
          model: 'stable-image-core',
          prompt: 'fill',
          // A mask is required for the conversion to be anything but `'none'`, so the request
          // carries one — otherwise this would assert the no-mask branch and pass vacuously.
          mask: maskImage(),
        },
        ctxFor(stabilityAdapter),
      )
      .then((result) => {
        const raw = rawOf(result);
        expect(raw.maskPolarityVerified).toBe(false);
        expect(String(raw.maskPolarityNote)).toContain('VERIFY');
        // The claimed behaviour is still recorded, so the endpoint is documented rather than absent.
        expect(raw.maskConversion).toContain('channel-extraction');
      });
  });

  it('translates an outpaint canvas into directional pixel counts', async () => {
    const result = await stabilityAdapter.run(
      {
        capability: 'outpaint',
        model: 'stable-image-core',
        targetCanvas: { width: 2000, height: 1500, anchorX: 500, anchorY: 300 },
      },
      ctxFor(stabilityAdapter),
    );
    const translation = String(rawOf(result).outpaintTranslation);
    expect(translation).toContain('left=500');
    expect(translation).toContain('right=1500');
    expect(translation).toContain('up=300');
    expect(translation).toContain('down=1200');
  });

  it('records the search-and-replace endpoints §14.4 requires as a distinct tool', async () => {
    const result = await stabilityAdapter.run(
      { capability: 'inpaint', model: 'stable-image-core' },
      ctxFor(stabilityAdapter),
    );
    expect(rawOf(result).searchAndReplaceAvailable).toBe(true);
    expect(rawOf(result).searchAndRecolorAvailable).toBe(true);
  });

  it('never echoes the credential into the returned description', async () => {
    const result = await stabilityAdapter.run(
      { capability: 'generate', model: 'stable-image-core' },
      ctxFor(stabilityAdapter),
    );
    expect(JSON.stringify(result.raw)).not.toContain(CREDENTIAL);
  });
});

describe('P5-11 — BFL request shape and moderation mapping (§14.5)', () => {
  it('declares the async flow §14.5 requires', async () => {
    const result = await bflAdapter.run(
      { capability: 'generate', model: 'flux-pro-1.1' },
      ctxFor(bflAdapter),
    );
    expect(rawOf(result).asyncFlow).toBe(true);
  });

  it('maps moderation to a distinct message, not a generic failure', async () => {
    const result = await bflAdapter.run(
      { capability: 'inpaint', model: 'flux-pro-1.0-fill' },
      ctxFor(bflAdapter),
    );
    const mapping = rawOf(result).moderationStatusMapping as Record<string, string>;
    expect(mapping['Content Moderated']).toContain('moderation');
    expect(mapping['Content Moderated']).not.toBe(mapping['Error']);
  });
});

describe('P5-11 — fal.ai request shape (§14.6)', () => {
  it('sends the input image as a data: URI', async () => {
    const result = await falAdapter.run(
      { capability: 'removeBackground', model: 'fal-ai/birefnet/v2' },
      ctxFor(falAdapter),
    );
    expect(rawOf(result).inputImageViaDataUri).toBe(true);
  });

  it('records per-model OpenAPI schema discovery', async () => {
    const result = await falAdapter.run(
      { capability: 'generate', model: 'fal-ai/flux-pro/v1.1' },
      ctxFor(falAdapter),
    );
    expect(String(rawOf(result).schemaDiscoveryNote)).toContain('OpenAPI');
  });

  it('wires sam2 to click-to-select for segment', async () => {
    const result = await falAdapter.run(
      { capability: 'segment', model: 'fal-ai/sam2' },
      ctxFor(falAdapter),
    );
    expect(rawOf(result).sam2Wired).toBe(true);
  });

  it('routes to the queue endpoint when asked', async () => {
    const result = await falAdapter.run(
      { capability: 'generate', model: 'fal-ai/flux/schnell', extra: { useQueue: true } },
      ctxFor(falAdapter),
    );
    expect(rawOf(result).useQueue).toBe(true);
  });

  it('does not use the queue by default', async () => {
    const result = await falAdapter.run(
      { capability: 'generate', model: 'fal-ai/flux/schnell' },
      ctxFor(falAdapter),
    );
    expect(rawOf(result).useQueue).toBe(false);
  });
});
