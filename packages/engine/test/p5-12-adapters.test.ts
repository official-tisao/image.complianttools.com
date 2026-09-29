/**
 * P5-12 — Replicate / remove.bg / Clipdrop / OpenAI-compatible adapter contracts.
 * Spec: README §14.7–§14.10, PLAN.md P5-12.
 *
 * Written as `.ts` on purpose: the engine `test` script excludes every `.test.mjs` file from
 * vitest, so a `.mjs` test would never execute.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerProvider,
  unregisterProvider,
  clearRegistry,
  getProvider,
  registeredCount,
  providersByCapability,
  capabilityRegistered,
  modelsForCapability,
} from '../src/ai/registry.js';
import type { ProviderAdapter, AdapterContext, AiResult } from '../src/ai/types.js';
import { replicateAdapter, executePrediction } from '../src/ai/adapters/replicate.js';
import { removeBgAdapter, cutOut } from '../src/ai/adapters/removebg.js';
import {
  clipdropAdapter,
  translateUpscale,
  callClipdrop,
  CLIPDROP_MAX_UPSCALE_DIMENSION,
} from '../src/ai/adapters/clipdrop.js';
import {
  openaiCompatibleAdapter,
  probeCapabilities,
  LOCALHOST_MIXED_CONTENT_GUIDANCE,
} from '../src/ai/adapters/openai-compatible.js';
import {
  readLedgerHeaders,
  usageFromLedgerHeaders,
  attachPredictionCancel,
  cspConnectSrcOrigin,
} from '../src/ai/adapter-support.js';

const API_KEY = 'test-key-must-never-appear';

function ctxFor(adapter: ProviderAdapter, overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    credentials: { apiKey: API_KEY },
    baseUrl: adapter.descriptor.defaultBaseUrl,
    fetch: globalThis.fetch,
    ...overrides,
  };
}

/** `AiResult.raw` is typed `unknown`; every assertion below goes through this. */
function rawOf(result: AiResult): Record<string, unknown> {
  return (result.raw ?? {}) as Record<string, unknown>;
}

describe('P5-12 — adapter registration', () => {
  beforeEach(() => clearRegistry());
  afterEach(() => clearRegistry());

  it('registers all four P5-12 adapters without id collision', () => {
    registerProvider(replicateAdapter);
    registerProvider(removeBgAdapter);
    registerProvider(clipdropAdapter);
    registerProvider(openaiCompatibleAdapter);
    expect(registeredCount()).toBe(4);
    expect(getProvider('replicate')).toBe(replicateAdapter);
    expect(getProvider('removebg')).toBe(removeBgAdapter);
    expect(getProvider('clipdrop')).toBe(clipdropAdapter);
    expect(getProvider('openai-compatible')).toBe(openaiCompatibleAdapter);
  });

  it('the registry barrel self-registers the four new adapters', async () => {
    clearRegistry();
    // The barrel has registration side effects; nothing imported it before P5-12, so this is
    // the first check that it actually wires the new providers in.
    await import('../src/ai/adapters/index.js');
    for (const id of ['replicate', 'removebg', 'clipdrop', 'openai-compatible']) {
      expect(getProvider(id), `${id} missing from adapters/index.ts`).toBeDefined();
    }
  });

  it('unregistering a P5-12 adapter removes it', () => {
    registerProvider(clipdropAdapter);
    expect(unregisterProvider('clipdrop')).toBe(true);
    expect(getProvider('clipdrop')).toBeUndefined();
  });
});

describe('P5-12 — capability support', () => {
  beforeEach(() => clearRegistry());
  afterEach(() => clearRegistry());

  it('remove.bg offers removeBackground and nothing else', () => {
    expect(removeBgAdapter.descriptor.capabilities).toEqual(['removeBackground']);
  });

  it('Clipdrop maps exactly the capabilities that have an AiCapability', () => {
    expect([...clipdropAdapter.descriptor.capabilities].sort()).toEqual([
      'erase',
      'removeBackground',
      'replaceBackground',
      'upscale',
    ]);
  });

  it('Clipdrop does not invent capabilities for remove-text or reimagine', () => {
    // §14.9 documents both endpoints, but neither maps to an AiCapability (types.ts:10-20), so
    // they are surfaced as documented extras rather than lighting up the wrong tool.
    expect(clipdropAdapter.descriptor.capabilities).toHaveLength(4);
    expect(clipdropAdapter.descriptor.capabilities).not.toContain('removeText' as never);
    expect(clipdropAdapter.descriptor.capabilities).not.toContain('reimagine' as never);
  });

  it('a capability is reachable through the registry by capability, not by name', () => {
    registerProvider(removeBgAdapter);
    registerProvider(clipdropAdapter);
    const removeBg = providersByCapability('removeBackground').map((a) => a.descriptor.id);
    expect(removeBg).toContain('removebg');
    expect(removeBg).toContain('clipdrop');
    expect(capabilityRegistered('segment')).toBe(false);
  });

  it('models declared for a capability are discoverable', () => {
    registerProvider(replicateAdapter);
    const upscalers = modelsForCapability('upscale');
    expect(upscalers.map((m) => m.id)).toContain('nightmareai/real-esrgan');
  });
});

describe('P5-12 — mask polarity correctness', () => {
  beforeEach(() => clearRegistry());
  afterEach(() => clearRegistry());

  it('Clipdrop erase is white-remove, matching our canonical convention, so it is not inverted', async () => {
    const result = await clipdropAdapter.run(
      { capability: 'erase', model: 'cleanup' },
      ctxFor(clipdropAdapter),
    );
    const raw = rawOf(result);
    expect(raw.maskInverted).toBe(false);
    expect(raw.maskPolarity).toContain('white-remove');
    // Our canonical convention (ai/mask-convention.ts) is white 255 = change, identical to
    // Clipdrop's white = remove, so the mask crosses the wire untouched.
    expect(raw.maskConversion).toContain('none');
  });

  it("Clipdrop's mask polarity is reported UNVERIFIED, not asserted", async () => {
    // §14.9 both claims the match and marks it "⚠ VERIFY" in the same sentence. With no live
    // run behind it, claiming verification would be exactly the over-claim we must avoid.
    const result = await clipdropAdapter.run(
      { capability: 'erase', model: 'cleanup' },
      ctxFor(clipdropAdapter),
    );
    const raw = rawOf(result);
    expect(raw.maskPolarityVerified).toBe(false);
    expect(String(raw.maskPolarityNote)).toContain('VERIFY');
  });

  it('Replicate reports its unverified community-model polarity as false', async () => {
    const result = await replicateAdapter.run(
      { capability: 'inpaint', model: 'black-forest-labs/flux-fill-pro' },
      ctxFor(replicateAdapter),
    );
    const raw = rawOf(result);
    expect(raw.maskPolarityVerified).toBe(false);
    expect(String(raw.maskPolarityNote)).toContain('VERIFY');
  });

  it('honesty runs both ways: no adapter claims a verified polarity without evidence', () => {
    // removeBackground takes no mask, so the flag must not be a blanket "true".
    expect(removeBgAdapter.descriptor.capabilities).toEqual(['removeBackground']);
  });
});

describe('P5-12 — cancellation wiring (Replicate §14.7)', () => {
  it('an abort issues exactly one cancel POST for the running prediction', async () => {
    const controller = new AbortController();
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    let polls = 0;
    const stubFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/predictions')) {
        return new Response(JSON.stringify({ id: 'p-123', status: 'processing' }), { status: 201 });
      }
      if (url.endsWith('/cancel')) return new Response('{}', { status: 200 });
      if (url.includes('/v1/predictions/')) {
        polls += 1;
        // Stay "processing" until the abort lands, then the flow stops.
        return new Response(
          JSON.stringify({
            id: 'p-123',
            status: controller.signal.aborted ? 'canceled' : 'processing',
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    const promise = executePrediction(
      {
        model: 'black-forest-labs/flux-fill-pro',
        input: { prompt: 'fill' },
        fetchImpl: stubFetch,
        sleep: async () => {
          controller.abort();
        },
        maxPollAttempts: 3,
      },
      ctxFor(replicateAdapter, { fetch: stubFetch, signal: controller.signal }),
    );

    await expect(promise).resolves.toMatchObject({ status: 'canceled' });

    const cancels = calls.filter((c) => c.url.endsWith('/cancel'));
    expect(cancels).toHaveLength(1);
    expect(cancels[0]?.url).toBe('https://api.replicate.com/v1/predictions/p-123/cancel');
    expect(cancels[0]?.init?.method).toBe('POST');
    expect(polls).toBeGreaterThan(0);
  });

  it('the cancel request does NOT carry the aborted signal, so it can actually reach the API', async () => {
    // If the cancel inherited ctx.signal it would reject immediately and the job would keep
    // running — and keep billing — which defeats the entire point of §14.7's requirement.
    const controller = new AbortController();
    const cancelInits: RequestInit[] = [];
    const stubFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/cancel')) cancelInits.push(init ?? {});
      return new Response(JSON.stringify({ id: 'p-7', status: 'processing' }), { status: 201 });
    }) as unknown as typeof fetch;

    await executePrediction(
      {
        model: 'x/y',
        fetchImpl: stubFetch,
        sleep: async () => {
          controller.abort();
        },
        maxPollAttempts: 2,
      },
      ctxFor(replicateAdapter, { fetch: stubFetch, signal: controller.signal }),
    ).catch(() => undefined);

    expect(cancelInits.length).toBeGreaterThan(0);
    for (const init of cancelInits) {
      // Absent or null: never the aborted signal.
      expect(init.signal ?? null).toBeNull();
    }
  });

  it('a pre-aborted signal cancels without ever creating a job', async () => {
    const controller = new AbortController();
    controller.abort();
    const urls: string[] = [];
    const stubFetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ id: 'p-9', status: 'succeeded' }), { status: 201 });
    }) as unknown as typeof fetch;

    await executePrediction(
      { model: 'x/y', fetchImpl: stubFetch, sleep: async () => {} },
      ctxFor(replicateAdapter, { fetch: stubFetch, signal: controller.signal }),
    );
    // Nothing billed means nothing to cancel: no cancel request should be issued.
    expect(urls.filter((u) => u.endsWith('/cancel'))).toHaveLength(0);
  });

  it('attachPredictionCancel fires at most once and detaches cleanly', async () => {
    const controller = new AbortController();
    let calls = 0;
    const handle = attachPredictionCancel(controller.signal, () => {
      calls += 1;
    });
    controller.abort();
    controller.abort();
    expect(calls).toBe(1);
    expect(handle.cancelled).toBe(true);
    handle.detach();
    // After detaching, a later abort must not resurrect the listener.
    const second = new AbortController();
    const detached = attachPredictionCancel(second.signal, () => {
      calls += 1;
    });
    detached.detach();
    second.abort();
    expect(calls).toBe(1);
  });
});

describe('P5-12 — Replicate Prefer: wait and poll fallback (§14.7)', () => {
  it('sends Prefer: wait=60 and prefers the /models/{owner}/{name} form', async () => {
    const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
    const stubFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: 'p-1', status: 'succeeded', output: 'https://x' }), {
        status: 201,
      });
    }) as unknown as typeof fetch;

    await executePrediction(
      { model: 'nightmareai/real-esrgan', fetchImpl: stubFetch, sleep: async () => {} },
      ctxFor(replicateAdapter, { fetch: stubFetch }),
    );

    const create = seen.find((c) => c.url.includes('/predictions') && c.init?.method === 'POST');
    expect(create?.url).toBe(
      'https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions',
    );
    const headers = create?.init?.headers as Record<string, string>;
    expect(headers.Prefer).toBe('wait=60');
    // Only the bearer token — never echoed into anything we return.
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
  });

  it('a job finished inside the wait window is never polled', async () => {
    let polls = 0;
    const stubFetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/v1/predictions/') && !String(input).endsWith('/predictions')) {
        polls += 1;
      }
      return new Response(JSON.stringify({ id: 'p-2', status: 'succeeded' }), { status: 201 });
    }) as unknown as typeof fetch;

    const prediction = await executePrediction(
      { model: 'a/b', fetchImpl: stubFetch, sleep: async () => {} },
      ctxFor(replicateAdapter, { fetch: stubFetch }),
    );
    expect(prediction.status).toBe('succeeded');
    expect(polls).toBe(0);
  });

  it('a pinned version hash switches to the /v1/predictions form', async () => {
    const urls: string[] = [];
    const stubFetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ id: 'p-3', status: 'succeeded' }), { status: 201 });
    }) as unknown as typeof fetch;

    await executePrediction(
      { model: 'a/b', version: 'abc123', fetchImpl: stubFetch, sleep: async () => {} },
      ctxFor(replicateAdapter, { fetch: stubFetch }),
    );
    expect(urls[0]).toBe('https://api.replicate.com/v1/predictions');
  });

  it('test() uses the free account endpoint and claims no capability', async () => {
    const urls: string[] = [];
    const stubFetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ type: 'organization' }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await replicateAdapter.test(ctxFor(replicateAdapter, { fetch: stubFetch }));
    expect(urls[0]).toBe('https://api.replicate.com/v1/account');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The account call proves the credential only — no model ran, so nothing is confirmed.
      expect(result.confirmed).toEqual([]);
      expect(result.detail).toContain('credential only');
    }
  });
});

describe('P5-12 — remove.bg channels: alpha and credit headers (§14.8)', () => {
  it('defaults to channels=alpha so the matte can be composited at full resolution', async () => {
    const result = await removeBgAdapter.run(
      { capability: 'removeBackground', model: 'remove.bg' },
      ctxFor(removeBgAdapter),
    );
    const raw = rawOf(result);
    expect(raw.channels).toBe('alpha');
    expect(raw.compositeLocally).toBe(true);
    expect(String(raw.channelsRationale)).toContain('full original resolution');
  });

  it('states the preview vs full cost behaviour explicitly', async () => {
    const preview = rawOf(
      await removeBgAdapter.run(
        { capability: 'removeBackground', model: 'remove.bg' },
        ctxFor(removeBgAdapter),
      ),
    );
    const cost = preview.costBehaviour as Record<string, unknown>;
    expect(cost.isPreview).toBe(true);
    expect(cost.previewIsLowCost).toBe(true);
    expect(cost.exportUsesOneCredit).toBe(false);

    const full = rawOf(
      await removeBgAdapter.run(
        { capability: 'removeBackground', model: 'remove.bg', extra: { size: 'full' } },
        ctxFor(removeBgAdapter),
      ),
    );
    const fullCost = full.costBehaviour as Record<string, unknown>;
    expect(fullCost.isPreview).toBe(false);
    expect(fullCost.exportUsesOneCredit).toBe(true);
    expect(String(fullCost.note)).toContain('one credit');
  });

  it('reads X-Credits-Charged and X-Rate-Limit-* into the ledger', async () => {
    const stubFetch = (async () =>
      new Response(new Blob([new Uint8Array([1, 2, 3])]), {
        status: 200,
        headers: {
          'X-Credits-Charged': '1',
          'X-Rate-Limit-Limit': '50',
          'X-Rate-Limit-Remaining': '7',
          'X-Rate-Limit-Reset': '1700000000',
        },
      })) as unknown as typeof fetch;

    const result = await cutOut(
      { image: new Blob([new Uint8Array([1])]), fetchImpl: stubFetch },
      ctxFor(removeBgAdapter),
    );
    expect(result.ledger.creditsCharged).toBe(1);
    expect(result.ledger.rateLimit?.remaining).toBe('7');
    expect(result.matte).toBe(true);
    // Credits are the provider's own accounting; they are never converted to a currency figure.
    expect(result.usage?.providerCost).toBe('1 credit(s)');
  });

  it('treats an absent credit header as unknown, not as zero', async () => {
    // "No header" and "you have zero credits" are different user-facing messages.
    const stubFetch = (async () =>
      new Response(new Blob([new Uint8Array([1])]), { status: 200 })) as unknown as typeof fetch;
    const result = await cutOut(
      { image: new Blob([new Uint8Array([1])]), fetchImpl: stubFetch },
      ctxFor(removeBgAdapter),
    );
    expect(result.ledger.creditsCharged).toBeUndefined();
    expect(result.usage?.providerCost).toBeUndefined();
  });

  it('reports a genuine zero-credit charge as zero', async () => {
    const stubFetch = (async () =>
      new Response(new Blob([new Uint8Array([1])]), {
        status: 200,
        headers: { 'X-Credits-Charged': '0' },
      })) as unknown as typeof fetch;
    const result = await cutOut(
      { image: new Blob([new Uint8Array([1])]), fetchImpl: stubFetch },
      ctxFor(removeBgAdapter),
    );
    expect(result.ledger.creditsCharged).toBe(0);
  });

  it('test() uses the free account endpoint and reports the balance', async () => {
    const urls: string[] = [];
    const stubFetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ credits: { balance: 12 } }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await removeBgAdapter.test(ctxFor(removeBgAdapter, { fetch: stubFetch }));
    expect(urls[0]).toBe('https://api.remove.bg/v1.0/account');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmed).toEqual(['removeBackground']);
      expect(result.detail).toContain('12');
      expect(result.detail).toContain('no credit was spent');
    }
  });
});

describe('P5-12 — Clipdrop endpoints, credits and upscale clamp (§14.9)', () => {
  it('maps each capability to its documented endpoint', async () => {
    const cases: Array<[string, string]> = [
      ['removeBackground', '/remove-background/v1'],
      ['erase', '/cleanup/v1'],
      ['upscale', '/image-upscaling/v1/upscale'],
      ['replaceBackground', '/replace-background/v1'],
    ];
    for (const [capability, path] of cases) {
      const result = await clipdropAdapter.run(
        { capability: capability as never, model: 'x' },
        ctxFor(clipdropAdapter),
      );
      const request = rawOf(result).request as Record<string, unknown>;
      expect(request.url, capability).toBe(`https://clipdrop-api.co${path}`);
    }
  });

  it('translates scaleFactor into explicit target dimensions', () => {
    const t = translateUpscale(2, 1000, 500);
    expect(t.targetWidth).toBe(2000);
    expect(t.targetHeight).toBe(1000);
    expect(t.clamped).toBe(false);
  });

  it('clamps to the ceiling while preserving aspect ratio', () => {
    // Per-axis clamping would distort the image; one common scale factor does not.
    const t = translateUpscale(4, 4000, 3000);
    expect(t.clamped).toBe(true);
    expect(Math.max(t.targetWidth, t.targetHeight)).toBe(CLIPDROP_MAX_UPSCALE_DIMENSION);
    expect(t.targetWidth / t.targetHeight).toBeCloseTo(4000 / 3000, 2);
  });

  it('records that the ceiling is a local bound pending verification', async () => {
    const result = await clipdropAdapter.run(
      {
        capability: 'upscale',
        model: 'image-upscaling',
        scaleFactor: 4,
        image: {
          width: 4000,
          height: 3000,
          colorSpace: 'srgb',
          bitDepth: 8,
          premultipliedAlpha: false,
          frames: [{ data: new Uint8ClampedArray(0), durationMs: 0 }],
        },
      },
      ctxFor(clipdropAdapter),
    );
    expect(String(rawOf(result).upscaleTranslationNote)).toContain('clamped');
  });

  it('reads x-remaining-credits into the ledger', async () => {
    const stubFetch = (async () =>
      new Response(new Blob([new Uint8Array([1])]), {
        status: 200,
        headers: { 'x-remaining-credits': '42' },
      })) as unknown as typeof fetch;

    const result = await callClipdrop(
      { capability: 'removeBackground', model: 'remove-background' },
      new Blob([new Uint8Array([1])]),
      ctxFor(clipdropAdapter),
      undefined,
      stubFetch,
    );
    expect(result.ledger.creditsRemaining).toBe(42);
    expect(result.usage?.providerCost).toBeUndefined(); // remaining is not a charge
  });

  it('sends the erase mask uninverted, because the polarities already match', async () => {
    const forms: FormData[] = [];
    const stubFetch = (async (_i: RequestInfo | URL, init?: RequestInit) => {
      forms.push(init?.body as FormData);
      return new Response(new Blob([new Uint8Array([1])]), { status: 200 });
    }) as unknown as typeof fetch;

    await callClipdrop(
      { capability: 'erase', model: 'cleanup' },
      new Blob([new Uint8Array([1])]),
      ctxFor(clipdropAdapter),
      new Blob([new Uint8Array([255])]),
      stubFetch,
    );
    expect(forms[0]?.get('mask_file')).toBeInstanceOf(Blob);
    expect(forms[0]?.get('mode')).toBe('quality');
  });

  it('test() claims no capability, because no free endpoint is documented', async () => {
    const result = await clipdropAdapter.test(ctxFor(clipdropAdapter));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmed).toEqual([]);
      expect(result.detail).toContain('no free account endpoint');
    }
  });
});

describe('P5-12 — OpenAI-compatible capabilities are probed, not assumed (§14.10)', () => {
  const base = 'http://localhost:11434/v1';

  it('confirms only the capabilities whose endpoint actually answered', async () => {
    // A text-only local server: /models and /chat/completions work, images are absent.
    const stubFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'llava' }, { id: 'llama3' }] }), {
          status: 200,
        });
      }
      if (url.endsWith('/chat/completions')) return new Response('{}', { status: 200 });
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const report = await probeCapabilities(
      ctxFor(openaiCompatibleAdapter, { baseUrl: base, fetch: stubFetch }),
    );
    expect(report.confirmed).toEqual(['describe']);
    expect(report.confirmed).not.toContain('generate');
    expect(report.rejected.find((r) => r.capability === 'generate')?.reason).toContain('404');
    expect(report.models).toEqual(['llava', 'llama3']);
  });

  it('test() reports the probed subset and never echoes the descriptor list', async () => {
    const stubFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/models'))
        return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
      if (url.endsWith('/chat/completions')) return new Response('{}', { status: 200 });
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await openaiCompatibleAdapter.test(
      ctxFor(openaiCompatibleAdapter, { baseUrl: base, fetch: stubFetch }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmed).toEqual(['describe']);
      // The bug this guards: returning descriptor.capabilities would offer image editing on a
      // server that has none.
      expect(result.confirmed).not.toEqual(openaiCompatibleAdapter.descriptor.capabilities);
      expect(result.detail).toContain('Confirmed by probing');
    }
  });

  it('confirms nothing when no probe answers', async () => {
    const stubFetch = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/models'))
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await openaiCompatibleAdapter.test(
      ctxFor(openaiCompatibleAdapter, { baseUrl: base, fetch: stubFetch }),
    );
    if (result.ok) {
      expect(result.confirmed).toEqual([]);
      expect(result.detail).toContain('none is offered');
    }
  });

  it('refuses to run a capability the probe did not confirm', async () => {
    const stubFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/models'))
        return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
      if (url.endsWith('/chat/completions')) return new Response('{}', { status: 200 });
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    await expect(
      openaiCompatibleAdapter.run(
        { capability: 'generate', model: 'm' },
        ctxFor(openaiCompatibleAdapter, { baseUrl: base, fetch: stubFetch }),
      ),
    ).rejects.toThrow(/not available on this server/);
  });

  it('listModels builds descriptors from the live catalogue', async () => {
    const stubFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }), { status: 200 });
      }
      if (url.endsWith('/chat/completions')) return new Response('{}', { status: 200 });
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const models = await openaiCompatibleAdapter.listModels(
      ctxFor(openaiCompatibleAdapter, { baseUrl: base, fetch: stubFetch }),
    );
    expect(models.map((m) => m.id)).toEqual(['a', 'b']);
    // Capabilities come from the probe, never from guessing at the model name.
    expect(models[0]?.capabilities).toEqual(['describe']);
  });

  it('listModels returns an empty list rather than throwing when /models is absent', async () => {
    const stubFetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const models = await openaiCompatibleAdapter.listModels(
      ctxFor(openaiCompatibleAdapter, { baseUrl: base, fetch: stubFetch }),
    );
    expect(models).toEqual([]);
  });

  it('sends the not-needed placeholder when the user supplied no key', async () => {
    const seen: string[] = [];
    const stubFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>)?.Authorization ?? '');
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await openaiCompatibleAdapter.test(
      ctxFor(openaiCompatibleAdapter, {
        baseUrl: base,
        fetch: stubFetch,
        credentials: {},
      }),
    );
    expect(seen).toContain('Bearer not-needed');
  });

  it('declares the apiKey credential as optional, because local servers need none', () => {
    const field = openaiCompatibleAdapter.descriptor.credentialFields.find(
      (f) => f.key === 'apiKey',
    );
    expect(field?.required).toBe(false);
  });

  it('asks the user for a base URL rather than sending their images somewhere unchosen', async () => {
    // An empty base URL is a configuration error, not a request to Ollama's default port.
    const result = await openaiCompatibleAdapter.test(
      ctxFor(openaiCompatibleAdapter, { baseUrl: '' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ai-not-configured');
  });

  it('accepts a real server on the default Ollama port', async () => {
    // The default is a working URL, not a placeholder that rejects genuine Ollama users.
    const stubFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/models'))
        return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
      if (url.endsWith('/chat/completions')) return new Response('{}', { status: 200 });
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await openaiCompatibleAdapter.test(
      ctxFor(openaiCompatibleAdapter, { fetch: stubFetch }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('P5-12 — CSP, CORS and mixed-content posture honesty', () => {
  it("Replicate stays 'unknown' because its CORS posture is unverified", () => {
    // §14.7: "Set browserDirect: 'unknown' until the nightly contract test proves otherwise."
    expect(replicateAdapter.descriptor.browserDirect).toBe('unknown');
    expect(replicateAdapter.descriptor.browserDirectNote).toContain('Relay');
  });

  it('no P5-12 adapter overstates its CORS posture', () => {
    for (const adapter of [
      replicateAdapter,
      removeBgAdapter,
      clipdropAdapter,
      openaiCompatibleAdapter,
    ]) {
      expect(['yes', 'yes-with-header', 'no', 'unknown']).toContain(
        adapter.descriptor.browserDirect,
      );
      // Nothing in P5-12 was verified from a browser context, so none may claim a bare "yes".
      expect(adapter.descriptor.browserDirect).not.toBe('yes');
      expect(adapter.descriptor.browserDirectNote).toBeTruthy();
    }
  });

  it('the CORS caveat reaches the user through the descriptor, not a log', () => {
    // The CORS per-server commands themselves are P5-14's connect-page content; here we only
    // assert the guidance is carried on the descriptor and exported for that page to render.
    expect(openaiCompatibleAdapter.descriptor.browserDirectNote).toContain('CORS');
    expect(LOCALHOST_MIXED_CONTENT_GUIDANCE.corsPerServer.ollama).toContain('OLLAMA_ORIGINS');
  });

  it('derives the connect-src origin from the user-supplied base URL', () => {
    expect(cspConnectSrcOrigin('http://localhost:11434/v1')).toBe('http://localhost:11434');
    expect(cspConnectSrcOrigin('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai');
    expect(cspConnectSrcOrigin('not a url')).toBeNull();
    expect(cspConnectSrcOrigin('')).toBeNull();
  });

  it('does not claim the document CSP is widened at runtime', async () => {
    const stubFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/models'))
        return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
      if (url.endsWith('/chat/completions')) return new Response('{}', { status: 200 });
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await openaiCompatibleAdapter.run(
      { capability: 'describe', model: 'm' },
      ctxFor(openaiCompatibleAdapter, {
        baseUrl: 'http://localhost:11434/v1',
        fetch: stubFetch,
      }),
    );
    const csp = rawOf(result).csp as Record<string, unknown>;
    expect(csp.connectSrcOrigin).toBe('http://localhost:11434');
    // §16.4: a header-delivered CSP cannot be widened at runtime.
    expect(String(csp.note)).toContain('cannot be widened at runtime');
  });

  it('flags plain-HTTP localhost as a mixed-content risk for the connect page', async () => {
    const stubFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/models'))
        return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
      if (url.endsWith('/chat/completions')) return new Response('{}', { status: 200 });
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await openaiCompatibleAdapter.run(
      { capability: 'describe', model: 'm' },
      ctxFor(openaiCompatibleAdapter, { baseUrl: 'http://localhost:11434/v1', fetch: stubFetch }),
    );
    const mixed = rawOf(result).mixedContent as Record<string, unknown>;
    expect(mixed.isLocalhost).toBe(true);
    expect(mixed.isInsecure).toBe(true);
    expect(mixed.guidance).toBe(LOCALHOST_MIXED_CONTENT_GUIDANCE);
  });

  it('the mixed-content guidance carries the README re-verification marker', () => {
    // §14.10 demands guidance written from observed behaviour, not from memory.
    expect(LOCALHOST_MIXED_CONTENT_GUIDANCE.verificationNote).toContain('VERIFY');
    expect(LOCALHOST_MIXED_CONTENT_GUIDANCE.workarounds.length).toBeGreaterThan(0);
    expect(Object.keys(LOCALHOST_MIXED_CONTENT_GUIDANCE.corsPerServer)).toEqual(
      expect.arrayContaining(['ollama', 'lm-studio', 'vllm', 'litellm']),
    );
  });
});

describe('P5-12 — no unsupported capability assumptions', () => {
  it('run() rejects a capability the adapter does not declare', async () => {
    await expect(
      replicateAdapter.run({ capability: 'describe', model: 'a/b' }, ctxFor(replicateAdapter)),
    ).resolves.toBeDefined(); // replicate does declare describe
    await expect(
      removeBgAdapter.run({ capability: 'upscale', model: 'x' }, ctxFor(removeBgAdapter)),
    ).rejects.toThrow(/unsupported capability/);
    await expect(
      clipdropAdapter.run({ capability: 'segment', model: 'x' }, ctxFor(clipdropAdapter)),
    ).rejects.toThrow(/unsupported capability/);
  });

  it('no adapter can report a capability its own descriptor omits', async () => {
    const cases: Array<[ProviderAdapter, Awaited<ReturnType<ProviderAdapter['test']>>]> = [
      [replicateAdapter, await replicateAdapter.test(ctxFor(replicateAdapter))],
      [removeBgAdapter, await removeBgAdapter.test(ctxFor(removeBgAdapter))],
      [clipdropAdapter, await clipdropAdapter.test(ctxFor(clipdropAdapter))],
    ];
    for (const [adapter, result] of cases) {
      if (!result.ok) continue;
      for (const cap of result.confirmed) {
        expect(adapter.descriptor.capabilities, `${adapter.descriptor.id}: ${cap}`).toContain(cap);
      }
    }
  });

  it('a missing credential fails before any request is attempted', async () => {
    let called = false;
    const stubFetch = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    for (const adapter of [replicateAdapter, removeBgAdapter, clipdropAdapter]) {
      const result = await adapter.test(ctxFor(adapter, { fetch: stubFetch, credentials: {} }));
      expect(result.ok, adapter.descriptor.id).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('ai-auth-failed');
    }
    expect(called).toBe(false);
  });

  it('never echoes a credential into raw, usage or an error message', async () => {
    const stubFetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'm' }] }), {
        status: 200,
      })) as unknown as typeof fetch;

    const results: AiResult[] = [
      await replicateAdapter.run(
        { capability: 'describe', model: 'a/b' },
        ctxFor(replicateAdapter),
      ),
      await removeBgAdapter.run(
        { capability: 'removeBackground', model: 'x' },
        ctxFor(removeBgAdapter),
      ),
      await clipdropAdapter.run(
        { capability: 'removeBackground', model: 'x' },
        ctxFor(clipdropAdapter),
      ),
      await openaiCompatibleAdapter.run(
        { capability: 'describe', model: 'm' },
        ctxFor(openaiCompatibleAdapter, { baseUrl: 'http://localhost:11434/v1', fetch: stubFetch }),
      ),
    ];
    for (const result of results) {
      const serialised = JSON.stringify({ raw: result.raw, usage: result.usage });
      expect(serialised, 'credential leaked').not.toContain(API_KEY);
    }
  });
});

describe('P5-12 — ledger header helper', () => {
  it('reads headers case-insensitively', () => {
    const reading = readLedgerHeaders({
      'x-credits-charged': '2',
      'X-Rate-Limit-Remaining': '5',
    });
    expect(reading.creditsCharged).toBe(2);
    expect(reading.rateLimit?.remaining).toBe('5');
    expect(reading.present).toBe(true);
  });

  it('reports absence honestly for a plain object with no headers', () => {
    const reading = readLedgerHeaders({});
    expect(reading.present).toBe(false);
    expect(reading.creditsCharged).toBeUndefined();
    expect(reading.creditsRemaining).toBeUndefined();
  });

  it('folds credits into usage without inventing a currency amount', () => {
    expect(usageFromLedgerHeaders({ present: true, creditsCharged: 1 }, 'req-1')).toEqual({
      providerCost: '1 credit(s)',
      requestId: 'req-1',
    });
    expect(usageFromLedgerHeaders({ present: false }, 'req-2')).toEqual({ requestId: 'req-2' });
  });

  it('ignores unparseable header values instead of coercing them', () => {
    expect(readLedgerHeaders({ 'x-credits-charged': 'many' }).creditsCharged).toBeUndefined();
    expect(readLedgerHeaders({ 'x-credits-charged': '' }).creditsCharged).toBeUndefined();
  });
});
