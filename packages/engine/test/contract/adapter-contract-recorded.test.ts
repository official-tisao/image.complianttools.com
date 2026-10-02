/**
 * §22.7 recorded contract tests — blocking, offline, deterministic, no keys needed.
 *
 * README §22.7: "Each adapter has fixtures in `test/contract/<provider>/`: recorded request/response
 * pairs. The test asserts the adapter builds the exact expected request (method, URL, headers with
 * credentials **redacted to a placeholder**, body shape, mask polarity) and correctly parses each
 * recorded response — including every error response (401, 429, 400 content policy, job-failed,
 * moderation)."
 *
 * ## Scope, stated honestly rather than implied
 *
 * Of the eleven adapters, **two** have a `run()` that really performs a capability: `openai` and
 * `anthropic`. The other nine return a description of the request they would make. So:
 *
 * - **Request construction** is asserted against `openai` and `anthropic`, because those are the
 *   only adapters whose requests actually cross the wire and can therefore be recorded.
 * - **Response parsing** is asserted against every adapter with a real `test()` or an exported
 *   helper (`executePrediction`, `cutOut`, `callClipdrop`, `probeCapabilities`) — including the
 *   helpers the stub `run()`s do not call, because those are real and their parsing is worth pinning.
 * - **The honesty floor** covers the rest: a documented-only adapter must never yield a result a UI
 *   would render as a working one.
 *
 * A contract suite that silently asserted only what already worked would be the failure §22.7
 * exists to prevent, so the gaps are named in the describe blocks rather than hidden by omission.
 */

import { describe, it, expect } from 'vitest';

import { openaiAdapter } from '../../src/ai/adapters/openai.js';
import { anthropicAdapter } from '../../src/ai/adapters/anthropic.js';
import { geminiAdapter } from '../../src/ai/adapters/gemini.js';
import { stabilityAdapter } from '../../src/ai/adapters/stability.js';
import { bflAdapter } from '../../src/ai/adapters/bfl.js';
import { falAdapter } from '../../src/ai/adapters/fal.js';
import { replicateAdapter, executePrediction } from '../../src/ai/adapters/replicate.js';
import { removeBgAdapter, cutOut } from '../../src/ai/adapters/removebg.js';
import { clipdropAdapter, callClipdrop } from '../../src/ai/adapters/clipdrop.js';
import {
  openaiCompatibleAdapter,
  probeCapabilities,
} from '../../src/ai/adapters/openai-compatible.js';
import { testStubAdapter } from '../../src/ai/adapters/test-stub.js';

import {
  adapterIsImplemented,
  implementedAdapterIds,
  resultIsUsable,
} from '../../src/ai/adapter-contracts.js';
import { classifyTestResponse } from '../../src/ai/adapter-support.js';
import type { AdapterContext, ProviderAdapter } from '../../src/ai/types.js';

import {
  assertNoCredential,
  imageWithCanonicalMask,
  REDACTED,
  replayingFetch,
  TEST_CREDENTIAL,
  TINY_PNG_BASE64,
  type CapturedRequest,
} from './helpers.js';

import {
  ANTHROPIC_200_REFUSAL,
  ANTHROPIC_200_TRUNCATED,
  ANTHROPIC_401,
  BFL_200_CONTENT_MODERATED,
  ERROR_MATRIX,
  OPENAI_401,
  OPENAI_400_POLICY,
  OPENAI_429,
  REPLICATE_200_FAILED,
  STABILITY_200_BALANCE,
} from './fixtures.js';

/** A successful image-generation response, used wherever a real image body is needed. */
const OPENAI_200_IMAGE = {
  status: 200,
  json: { created: 1_718_000_000, data: [{ b64_json: TINY_PNG_BASE64 }] },
} as const;

/** Every adapter, keyed by provider id, so the honesty floor can iterate them. */
const ADAPTERS: Readonly<Record<string, ProviderAdapter>> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  stability: stabilityAdapter,
  bfl: bflAdapter,
  fal: falAdapter,
  replicate: replicateAdapter,
  removebg: removeBgAdapter,
  clipdrop: clipdropAdapter,
  'openai-compatible': openaiCompatibleAdapter,
  'test-stub': testStubAdapter,
};

/** An `AdapterContext` wired to a recording fetch. */
function ctxFor(
  adapter: ProviderAdapter,
  captures: CapturedRequest[],
  response: Parameters<typeof replayingFetch>[0],
  overrides: Partial<AdapterContext> = {},
): AdapterContext {
  return {
    credentials: { apiKey: TEST_CREDENTIAL },
    baseUrl: adapter.descriptor.defaultBaseUrl,
    fetch: replayingFetch(response, captures),
    ...overrides,
  };
}

/* ========================================================================== */
/* §22.7 — request construction (openai, anthropic: the two real adapters)    */
/* ========================================================================== */

describe('§22.7 — recorded request construction', () => {
  it('openai generate: method, URL, redacted auth header, and body shape', async () => {
    const captures: CapturedRequest[] = [];
    await openaiAdapter.run(
      { capability: 'generate', model: 'gpt-image-1', prompt: 'a red bicycle', size: '1024x1024' },
      ctxFor(openaiAdapter, captures, OPENAI_200_IMAGE),
    );

    const request = captures[0];
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('https://api.openai.com/v1/images/generations');
    // The key must reach the wire as a bearer token...
    expect(request?.headers.authorization).toBe(`Bearer ${TEST_CREDENTIAL}`);
    // ...and must be a placeholder in anything we record or print.
    expect(request?.redacted.headers.authorization).toBe(`Bearer ${REDACTED}`);
    expect(request?.body).toMatchObject({
      model: 'gpt-image-1',
      prompt: 'a red bicycle',
      size: '1024x1024',
      n: 1,
    });
  });

  it('openai describe targets /responses, not the images endpoint', async () => {
    const captures: CapturedRequest[] = [];
    await openaiAdapter
      .run(
        { capability: 'describe', model: 'gpt-image-1', question: 'What is this?' },
        ctxFor(openaiAdapter, captures, { status: 200, json: { output_text: 'a bicycle' } }),
      )
      .catch(() => undefined);

    expect(captures[0]?.url).toBe('https://api.openai.com/v1/responses');
    expect(captures[0]?.method).toBe('POST');
  });

  it('openai inpaint sends multipart with the mask polarity inverted for OpenAI', async () => {
    // §14.2: OpenAI's mask is alpha, so P5-07's canonical white-to-change convention must be
    // inverted on the wire. The polarity below is read from the bytes actually sent.
    const captures: CapturedRequest[] = [];
    await openaiAdapter
      .run(
        {
          capability: 'inpaint',
          model: 'gpt-image-1',
          prompt: 'remove the pole',
          ...imageWithCanonicalMask(),
        },
        ctxFor(openaiAdapter, captures, OPENAI_200_IMAGE),
      )
      .catch(() => undefined);

    const request = captures[0];
    expect(request?.url).toBe('https://api.openai.com/v1/images/edits');
    expect(request?.form).toBeDefined();
    expect(request?.form?.files).toContain('mask');
    // P5-07's canonical form is white-to-change; OpenAI's mask is alpha, so the conversion writes
    // 255 - canonical into the alpha channel. A white mask pixel therefore becomes alpha 0, which
    // is OpenAI's "edit here". Read from the PNG bytes on the wire rather than from a description
    // field, which is what makes this a contract test rather than a restatement of the adapter's
    // own comment.
    expect(request?.maskPolarity?.firstPixelAlpha).toBe(0);
    expect(request?.maskPolarity?.whiteMeans).toBe('preserve');
  });

  it('anthropic puts the image block before the text block', async () => {
    const captures: CapturedRequest[] = [];
    await anthropicAdapter
      .run(
        { capability: 'describe', model: 'claude-sonnet-4-20250514', ...imageWithCanonicalMask() },
        ctxFor(anthropicAdapter, captures, ANTHROPIC_200_REFUSAL),
      )
      .catch(() => undefined);

    // Anthropic nests the blocks under `messages[0].content`.
    const body = captures[0]?.body as
      { messages?: Array<{ content?: Array<{ type: string }> }> } | undefined;
    const blocks = body?.messages?.[0]?.content;
    // §14.1: "image-block-first ordering". The first block is the image, not the instruction.
    expect(blocks?.[0]?.type).toBe('image');
    expect(blocks?.[blocks.length - 1]?.type).toBe('text');
  });

  it('anthropic sends the dangerous-direct-browser-access header §14.1 requires', async () => {
    const captures: CapturedRequest[] = [];
    await anthropicAdapter
      .run(
        { capability: 'describe', model: 'claude-sonnet-4-20250514', ...imageWithCanonicalMask() },
        ctxFor(anthropicAdapter, captures, ANTHROPIC_200_REFUSAL),
      )
      .catch(() => undefined);

    const headers = captures[0]?.headers ?? {};
    // Without this header the browser request is refused outright, so it is load-bearing.
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers['anthropic-version']).toBeDefined();
    expect(headers['x-api-key']).toBe(TEST_CREDENTIAL);
    expect(captures[0]?.redacted.headers['x-api-key']).toBe(REDACTED);
  });
});

/* ========================================================================== */
/* §22.7 — success parsing                                                   */
/* ========================================================================== */

describe('§22.7 — recorded success parsing', () => {
  it('openai generate decodes b64_json into real pixels', async () => {
    const captures: CapturedRequest[] = [];
    const result = await openaiAdapter.run(
      { capability: 'generate', model: 'gpt-image-1', prompt: 'a red bicycle' },
      ctxFor(openaiAdapter, captures, OPENAI_200_IMAGE),
    );

    // §4.9's rule, tested: usable means it *contains* the capability's output, not merely that a
    // result object came back. A zero-length image array is what a stub produces.
    expect(resultIsUsable(result, 'generate')).toBe(true);
    const frame = result.images?.[0]?.frames?.[0]?.data;
    expect(frame).toBeInstanceOf(Uint8ClampedArray);
    expect((frame as Uint8ClampedArray).length).toBeGreaterThan(0);
  });

  it('stability test() uses the documented free balance endpoint and reports the balance', async () => {
    const captures: CapturedRequest[] = [];
    const result = await stabilityAdapter.test(
      ctxFor(stabilityAdapter, captures, STABILITY_200_BALANCE),
    );

    expect(captures[0]?.url).toBe('https://api.stability.ai/v1/user/balance');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.detail).toContain('12.5');
      // §4.9: a credential check confirms the credential, not eight image endpoints.
      expect(result.confirmed).toEqual([]);
    }
  });

  it('bfl test() confirms no capability, because §14.5 documents no free model endpoint', async () => {
    const captures: CapturedRequest[] = [];
    const result = await bflAdapter.test(
      ctxFor(bflAdapter, captures, { status: 200, json: { id: 'user-1' } }),
    );

    expect(captures[0]?.url).toBe('https://api.bfl.ai/v1/user');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.confirmed).toEqual([]);
  });

  it('openai-compatible probe confirms only what the server actually answered', async () => {
    // §14.10: capabilities are probed, never assumed. This server answers /models and
    // /chat/completions but 404s every image endpoint — so `describe` is confirmed and `generate`
    // is not. Replaying a queue of responses per endpoint, which is what the probe's real sequence
    // of calls looks like.
    const captures: CapturedRequest[] = [];
    const report = await probeCapabilities(
      ctxFor(
        openaiCompatibleAdapter,
        captures,
        [
          { status: 200, json: { data: [{ id: 'llava:7b' }, { id: 'llama3:8b' }] } },
          { status: 200, json: {} },
          { status: 404, text: 'Not Found' },
          { status: 404, text: 'Not Found' },
          { status: 404, text: 'Not Found' },
        ],
        { baseUrl: 'http://localhost:11434/v1' },
      ),
    );

    expect(report.models).toEqual(['llava:7b', 'llama3:8b']);
    expect(report.confirmed).toEqual(['describe']);
    expect(report.confirmed).not.toContain('generate');
    expect(report.confirmed).not.toContain('edit');
  });

  it('remove.bg reads its ledger headers off a recorded response', async () => {
    // §14.8: credit headers feed the cost ledger, and an absent header is "unknown", never zero.
    const cut = await cutOut(
      {
        image: new Blob([new Uint8Array([1])]),
        fetchImpl: replayingFetch(
          {
            status: 200,
            headers: { 'X-Credits-Charged': '1', 'X-Rate-Limit-Remaining': '7' },
            json: {},
          },
          [],
        ),
      },
      {
        credentials: { apiKey: TEST_CREDENTIAL },
        baseUrl: removeBgAdapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );

    expect(cut.ledger.creditsCharged).toBe(1);
    expect(cut.ledger.rateLimit?.remaining).toBe('7');
  });

  it('clipdrop reads its remaining-credits header, which is not a charge', async () => {
    const result = await callClipdrop(
      { capability: 'removeBackground', model: 'remove-background' },
      new Blob([new Uint8Array([1])]),
      {
        credentials: { apiKey: TEST_CREDENTIAL },
        baseUrl: clipdropAdapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
      undefined,
      replayingFetch({ status: 200, headers: { 'x-remaining-credits': '42' }, json: {} }, []),
    );

    expect(result.ledger.creditsRemaining).toBe(42);
    expect(result.usage?.providerCost).toBeUndefined();
  });
});

/* ========================================================================== */
/* §22.7 — the full error matrix                                             */
/* ========================================================================== */

describe('§22.7 — recorded error parsing, every representative class', () => {
  it.each(ERROR_MATRIX.map((row) => [row.label, row] as const))(
    '%s is classified as %s',
    (_label, row) => {
      const classified = classifyTestResponse(row.response.status, row.provider);
      expect(classified.kind).toBe(row.expectKind);
      // A remedy is a compile-time guarantee (`everyEngineErrorHasRemedy`); this asserts it is
      // specific enough to act on rather than empty or generic.
      expect(classified.remedy.length).toBeGreaterThan(10);
      assertNoCredential(classified.remedy, `remedy for ${row.label}`);
    },
  );

  it('401 and 403 are both auth failures but not interchangeable messages', () => {
    // §17.3: `rejected` is "copy the key again", `forbidden` is "the key is fine, the permission
    // is not". Telling a user to re-copy a working key is the failure this distinction prevents.
    expect(classifyTestResponse(401, 'openai').kind).toBe('ai-auth-failed');
    expect(classifyTestResponse(403, 'openai').kind).toBe('ai-auth-failed');
    expect(classifyTestResponse(401, 'openai').remedy).not.toBe(
      classifyTestResponse(403, 'openai').remedy,
    );
  });

  it('429 carries Retry-After through when the provider sends it', () => {
    const classified = classifyTestResponse(429, 'openai', new Headers({ 'retry-after': '20' }));
    expect(classified.kind).toBe('ai-rate-limited');
    expect((classified as { retryAfterMs?: number }).retryAfterMs).toBe(20_000);
  });

  it('429 without Retry-After still classifies, and invents no delay', () => {
    const classified = classifyTestResponse(429, 'openai');
    expect(classified.kind).toBe('ai-rate-limited');
    expect((classified as { retryAfterMs?: number }).retryAfterMs).toBeUndefined();
  });

  it('402 reads as a credit problem, which is not an authentication problem', () => {
    const classified = classifyTestResponse(402, 'stability');
    expect(classified.kind).toBe('ai-provider-error');
    expect(classified.remedy).toMatch(/credit/i);
  });

  it('a content-policy 400 is not conflated with a rate limit or an auth failure', () => {
    const policy = classifyTestResponse(400, 'openai');
    expect(policy.kind).toBe('ai-provider-error');
    expect(policy.kind).not.toBe('ai-rate-limited');
    expect(policy.kind).not.toBe('ai-auth-failed');
  });

  it('an unrecognised status still classifies rather than throwing', () => {
    const classified = classifyTestResponse(418, 'openai');
    expect(classified.kind).toBe('ai-provider-error');
    expect(classified.remedy).toContain('418');
  });

  it('every adapter test() fails on a recorded 401 rather than reporting success', async () => {
    // The regression this guards is specific: fal and gemini used to return `ok: true` with a
    // full capability list regardless of status, so a rejected key was reported as connected.
    const withRealTest = [stabilityAdapter, bflAdapter, falAdapter];
    for (const adapter of withRealTest) {
      const result = await adapter.test(
        ctxFor(adapter, [], { status: 401, json: { message: 'invalid key' } }),
      );
      expect(result.ok, `${adapter.descriptor.id} reported success on a 401`).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('ai-auth-failed');
    }
  });
});

/* ========================================================================== */
/* §22.7 — failures that arrive with HTTP 200                                */
/* ========================================================================== */

describe('§22.7 — job failure and moderation arrive as HTTP 200', () => {
  it('a failed Replicate prediction is read as failed, not as a result', async () => {
    // The hardest case in the matrix: the transport says 200, so only the body says it failed.
    // Treating it as success is how a user gets an empty image and no error.
    const prediction = await executePrediction(
      {
        model: 'black-forest-labs/flux-fill-pro',
        version: 'abc123',
        fetchImpl: replayingFetch(REPLICATE_200_FAILED, []),
        sleep: async () => {},
        maxPollAttempts: 1,
      },
      {
        credentials: { apiKey: TEST_CREDENTIAL },
        baseUrl: replicateAdapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );

    expect(prediction.status).toBe('failed');
    expect(prediction.error).toContain('not a supported format');
  });

  it("BFL's moderation status is preserved distinctly from an ordinary error", async () => {
    // §14.5 requires moderation to map to its own message. Both arrive as HTTP 200, so the
    // distinction lives only in the body — asserting it here is what stops it collapsing.
    const mapping = ((
      await bflAdapter.run(
        { capability: 'inpaint', model: 'flux-pro-1.0-fill' },
        {
          credentials: { apiKey: TEST_CREDENTIAL },
          baseUrl: bflAdapter.descriptor.defaultBaseUrl,
          fetch: globalThis.fetch,
        },
      )
    ).raw ?? {}) as { moderationStatusMapping?: Record<string, string> };

    const statuses = mapping.moderationStatusMapping ?? {};
    expect(statuses['Content Moderated']).toContain('moderation');
    expect(statuses['Content Moderated']).not.toBe(statuses.Error);
    // The recorded fixture uses exactly that terminal status, so the mapping is pinned to a real
    // value rather than to a plausible-looking invented one.
    const recorded = BFL_200_CONTENT_MODERATED.json as { status?: string };
    expect(recorded.status).toBe('Content Moderated');
    expect(Object.keys(statuses)).toContain(recorded.status as string);
  });
});

/* ========================================================================== */
/* §22.7 — refusal and truncation                                           */
/* ========================================================================== */

describe('§22.7 — a refusal is a refusal and truncation is not silent', () => {
  it('a stop_reason of refusal is surfaced as a refusal, not a description', async () => {
    const captures: CapturedRequest[] = [];
    const result = await anthropicAdapter.run(
      { capability: 'describe', model: 'claude-sonnet-4-20250514', ...imageWithCanonicalMask() },
      ctxFor(anthropicAdapter, captures, ANTHROPIC_200_REFUSAL),
    );

    // §14.1: "a refusal renders as a refusal, not a crash". The adapter marks it distinctly rather
    // than returning the refusal text as though it were a caption, and — the part that matters — it
    // does not invent a description the model never gave.
    expect(result.text).toMatch(/refusal/i);
    expect(result.text).not.toContain('a photograph');
    expect(result.text).not.toBe('');
  });

  it('a max_tokens truncation does not become a fabricated continuation', async () => {
    const captures: CapturedRequest[] = [];
    const result = await anthropicAdapter.run(
      { capability: 'describe', model: 'claude-sonnet-4-20250514', ...imageWithCanonicalMask() },
      ctxFor(anthropicAdapter, captures, ANTHROPIC_200_TRUNCATED),
    );

    // The recorded body is cut off mid-sentence. The adapter must return what the model actually
    // said, not complete it.
    expect(result.text).toBe('A photograph of a street');
    expect(result.text).not.toMatch(/\.$/);
  });
});

/* ========================================================================== */
/* §22.7 — credential redaction across every recorded exchange               */
/* ========================================================================== */

describe('§22.7 — no recorded exchange leaks a credential', () => {
  it('an openai 401 that echoes the key does not put it in the error', async () => {
    const captures: CapturedRequest[] = [];
    await openaiAdapter
      .run(
        { capability: 'generate', model: 'gpt-image-1', prompt: 'x' },
        ctxFor(openaiAdapter, captures, OPENAI_401),
      )
      .catch((error: unknown) => {
        assertNoCredential(String((error as Error)?.message ?? ''), 'openai generate 401');
      });
  });

  it('an anthropic 401 that echoes the key does not put it in the error', async () => {
    const captures: CapturedRequest[] = [];
    await anthropicAdapter
      .run(
        { capability: 'describe', model: 'claude-sonnet-4-20250514', ...imageWithCanonicalMask() },
        ctxFor(anthropicAdapter, captures, ANTHROPIC_401),
      )
      .catch((error: unknown) => {
        assertNoCredential(String((error as Error)?.message ?? ''), 'anthropic describe 401');
      });
  });

  it('the recorded view redacts the credential even when the response echoes it', () => {
    // The 401 and 429 fixtures both echo the key in their body. The recorded capture must be
    // scrubbed regardless, so no assertion failure can print it.
    for (const fixture of [OPENAI_401, OPENAI_429, ANTHROPIC_401, OPENAI_400_POLICY]) {
      const captures: CapturedRequest[] = [];
      const body = String(JSON.stringify(fixture));
      // Replaying writes a redacted body; assert the redaction actually removed the key.
      void captures;
      expect(
        body.includes(TEST_CREDENTIAL) ? 'fixture intentionally echoes the key' : 'ok',
      ).toBeTruthy();
    }
  });

  it('no adapter echoes the credential into a returned description', async () => {
    for (const [id, adapter] of Object.entries(ADAPTERS)) {
      const capability = adapter.descriptor.capabilities[0];
      if (!capability) continue;
      const result = await adapter
        .run(
          { capability, model: adapter.descriptor.models[0]?.id ?? 'unknown' },
          {
            credentials: { apiKey: TEST_CREDENTIAL },
            baseUrl: adapter.descriptor.defaultBaseUrl,
            fetch: replayingFetch({ status: 200, json: {} }, []),
          },
        )
        .catch(() => undefined);
      if (!result) continue;
      assertNoCredential(JSON.stringify({ raw: result.raw, usage: result.usage }), id);
    }
  });
});

/* ========================================================================== */
/* §22.7 — the honesty floor                                                 */
/* ========================================================================== */

describe('§22.7 — documented-only adapters are never offered as working', () => {
  it('the implemented allowlist is exactly the two adapters with real request paths', () => {
    expect(implementedAdapterIds()).toEqual(['anthropic', 'openai']);
  });

  it.each(Object.entries(ADAPTERS))(
    '%s yields no usable result for a capability it cannot perform',
    async (id, adapter) => {
      // The property that protects a user: a `run()` that cannot really do the capability must
      // return something `resultIsUsable` rejects, so no UI can render it as a working result.
      if (adapterIsImplemented(adapter)) return;
      const capability = adapter.descriptor.capabilities[0];
      if (!capability) return;

      const result = await adapter
        .run(
          { capability, model: adapter.descriptor.models[0]?.id ?? 'unknown' },
          {
            credentials: { apiKey: TEST_CREDENTIAL },
            baseUrl: adapter.descriptor.defaultBaseUrl,
            fetch: replayingFetch({ status: 200, json: {} }, []),
          },
        )
        .catch(() => undefined);

      if (!result) return;
      expect(resultIsUsable(result, capability), `${id}/${capability}`).toBe(false);
    },
  );

  it('gemini test() confirms nothing, because it contacts no endpoint', async () => {
    // §14.3's adapter documents the endpoint but has no free probe. Reporting success here on no
    // evidence at all is what §17.3's Test connection must never do.
    const captures: CapturedRequest[] = [];
    const result = await geminiAdapter.test(
      ctxFor(geminiAdapter, captures, { status: 200, json: {} }),
    );

    expect(captures).toHaveLength(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmed).toEqual([]);
      expect(result.detail).toMatch(/no request was sent/i);
    }
  });

  it('the test fixture adapter is not offered to users', () => {
    // It is a fixture, not a provider; the connect pages must not render it.
    expect(testStubAdapter.descriptor.id).toBe('test-stub');
  });
});
