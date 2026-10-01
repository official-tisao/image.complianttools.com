/**
 * P5-15 — the provider request gate for T64/T65/T71 (README §4.9, §13.6, §15.4).
 *
 * These are the security-critical tests, and they use **mocks only**: no real credential, no
 * network, no provider charge. Every `fetch` is a counter, so "no request was made" is an assertion
 * about a call count rather than an absence nobody checked.
 *
 * What is proved, mapped to the acceptance criteria:
 *
 * - no provider request occurs before explicit consent (§4.9; PLAN P12)
 * - the configuration and credential gates refuse before any bytes move
 * - the estimate comes from the local price table *before* the request, and a missing price is
 *   reported rather than invented (§13.6)
 * - an empty or placeholder result is never reported as success (§4.9)
 * - the direct and relay paths stay distinct, with no silent fallback (§15.4)
 * - no credential reaches an error message, a rendered string, or a log (§13.5 item 6)
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runProviderRequest,
  buildCostEstimate,
  type GateInput,
} from '../src/lib/ai/run-provider-request.ts';
import { DEFAULT_PRICE_TABLE } from '../../../packages/engine/dist/ai/ledger.js';
import { TransportError } from '../../../packages/engine/dist/ai/transport.js';
import type {
  AdapterContext,
  AiResult,
  ProviderAdapter,
  ProviderDescriptor,
} from '../../../packages/engine/dist/ai/types.js';

// --- Fixtures -------------------------------------------------------------------------------

const SECRET_KEY = 'sk-p5-15-must-never-appear-anywhere';
const SECRET_RELAY_TOKEN = 'relay-token-p5-15-must-never-appear';

function descriptorFor(overrides: Partial<ProviderDescriptor> = {}): ProviderDescriptor {
  return {
    id: 'openai',
    name: 'OpenAI (GPT-image-1)',
    homepage: 'https://openai.com/',
    keysUrl: 'https://platform.openai.com/api-keys',
    pricingUrl: 'https://openai.com/pricing',
    docsUrl: 'https://platform.openai.com/docs/guides/images',
    credentialFields: [
      {
        key: 'apiKey',
        label: 'OpenAI API Key',
        placeholder: 'sk-...',
        secret: true,
        required: true,
      },
    ],
    allowsCustomBaseUrl: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    capabilities: ['generate', 'edit', 'describe'],
    models: [{ id: 'gpt-image-1', label: 'GPT-image-1', capabilities: ['generate', 'describe'] }],
    browserDirect: 'yes-with-header',
    dataPolicy: { summary: 'Test.', url: 'https://openai.com/' },
    ...overrides,
  };
}

const DESCRIPTOR = descriptorFor();
const ANTHROPIC_DESCRIPTOR = descriptorFor({
  id: 'anthropic',
  name: 'Anthropic (Claude)',
  defaultBaseUrl: 'https://api.anthropic.com',
  capabilities: ['describe'],
  models: [{ id: 'claude-opus-5', label: 'Claude Opus 5', capabilities: ['describe'] }],
});

const ONE_PIXEL: AiResult['images'] = [
  {
    width: 1,
    height: 1,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: new Uint8ClampedArray(4), durationMs: 0 }],
  },
];

/**
 * An adapter that records every context it is handed and returns a canned result.
 *
 * `wire` decides whether the adapter actually reaches the transport. A real adapter's `run()`
 * calls `ctx.fetch`, and that is the call the origin-allowlist assertions are about — so the tests
 * that check routing set `wire: true`, while the tests that only care about the gate leave it off
 * and never reach the network at all.
 */
function recordingAdapter(
  result: AiResult = { images: ONE_PIXEL },
  seen: AdapterContext[] = [],
  wire = false,
): ProviderAdapter {
  return {
    descriptor: DESCRIPTOR,
    test: async () => ({ ok: true as const, confirmed: DESCRIPTOR.capabilities, detail: 'mock' }),
    run: async (_req, ctx) => {
      seen.push(ctx);
      if (wire) await ctx.fetch(`${ctx.baseUrl}/images/generations`, { method: 'POST' });
      return result;
    },
  };
}

function baseInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    capability: 'generate',
    descriptor: DESCRIPTOR,
    adapter: recordingAdapter(),
    consent: false,
    credentials: { apiKey: SECRET_KEY },
    baseUrl: '',
    request: { capability: 'generate', model: 'gpt-image-1', prompt: 'a red square' },
    ...overrides,
  };
}

/**
 * A transport that fails the test if it is ever called.
 *
 * A counted spy rather than a thrown error, so "no request was issued" is an assertion on a number.
 */
function forbiddenFetch() {
  const calls: unknown[][] = [];
  const impl = (async (...args: unknown[]) => {
    calls.push(args);
    throw new Error('A request was issued when it should not have been.');
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function recordingFetch(response: () => Response = () => new Response('{}', { status: 200 })) {
  const calls: { url: string; init?: RequestInit; opts?: { allowedOrigins?: string[] } }[] = [];
  const impl = (async (url: string, init?: RequestInit, opts?: { allowedOrigins?: string[] }) => {
    calls.push({ url: String(url), ...(init ? { init } : {}), ...(opts ? { opts } : {}) });
    return response();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** A deterministic stand-in for the real price-table estimate, with the engine's real labels. */
const stubEstimate = async (
  provider: string,
  model: string,
  capability: string,
  usage?: { images?: number },
) => {
  const entry = DEFAULT_PRICE_TABLE.entries.find(
    (e) => e.provider === provider && e.model === model && e.capability === capability,
  );
  if (entry === undefined) {
    return {
      estimate: '0.0000',
      label:
        'Estimate unavailable — no documented price for this provider/model/capability (see price ' +
        `table version ${DEFAULT_PRICE_TABLE.version}, updated ${DEFAULT_PRICE_TABLE.lastUpdated}).`,
      source: 'local-price-table',
    };
  }
  const value = Number.parseFloat(entry.estimatedUnitCost) * (usage?.images ?? 1);
  return {
    estimate: value.toFixed(4),
    label: `Estimate: ≈ $${value.toFixed(4)} (derived from local price table v${DEFAULT_PRICE_TABLE.version}, last updated ${DEFAULT_PRICE_TABLE.lastUpdated}; always an estimate)`,
    source: 'local-price-table',
  };
};

// --- Tests ----------------------------------------------------------------------------------

test('P5-15 gate: consent is required and nothing is sent without it', async () => {
  const seen: AdapterContext[] = [];
  const fetch = forbiddenFetch();

  // Everything except consent is configured.
  const outcome = await runProviderRequest(
    baseInput({ consent: false, adapter: recordingAdapter(undefined, seen) }),
    { fetchTransport: fetch.impl },
  );

  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.refusal, 'consent-required');
  assert.match(outcome.error.message.remedy, /Tick the consent box/);
  assert.equal(seen.length, 0, 'the adapter must never be invoked without consent');
  assert.equal(fetch.calls.length, 0, 'no request may be issued without consent');
});

test('P5-15 gate: consent is checked before the credential and the endpoint', async () => {
  // All three gates would refuse; consent must be the one reported, because it is the gate the user
  // has to pass first and the one PLAN P12 is written about.
  for (const overrides of [
    { credentials: { apiKey: '' } },
    { baseUrl: 'not a url' },
    { credentials: {}, baseUrl: 'ftp://x' },
  ]) {
    const outcome = await runProviderRequest(baseInput({ consent: false, ...overrides }), {
      fetchTransport: forbiddenFetch().impl,
    });
    assert.equal(outcome.ok, false);
    if (outcome.ok) continue;
    assert.equal(outcome.error.refusal, 'consent-required');
  }
});

test('P5-15 gate: a mocked successful request happens only after consent and configuration', async () => {
  const seen: AdapterContext[] = [];
  const fetch = recordingFetch();

  const outcome = await runProviderRequest(
    baseInput({ consent: true, adapter: recordingAdapter(undefined, seen, true) }),
    { fetchTransport: fetch.impl, estimate: stubEstimate },
  );

  assert.equal(outcome.ok, true);
  assert.equal(seen.length, 1, 'exactly one adapter invocation, after every gate passed');
  assert.equal(fetch.calls.length, 1, 'and exactly one request on the wire');
  if (!outcome.ok) return;
  assert.equal(outcome.value.usedPath, 'direct');
  assert.ok(outcome.value.result.images);
});

test('P5-15 gate: a missing credential refuses before any bytes move', async () => {
  const fetch = forbiddenFetch();
  const outcome = await runProviderRequest(
    baseInput({ consent: true, credentials: { apiKey: '   ' } }),
    {
      fetchTransport: fetch.impl,
    },
  );
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.refusal, 'credential-missing');
  assert.equal(fetch.calls.length, 0);
});

test('P5-15 gate: a non-HTTPS provider base URL is refused, never downgraded', async () => {
  const fetch = forbiddenFetch();
  const outcome = await runProviderRequest(
    baseInput({ consent: true, baseUrl: 'http://api.openai.com/v1' }),
    { fetchTransport: fetch.impl },
  );
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.refusal, 'provider-invalid');
  assert.equal(fetch.calls.length, 0);
});

test('P5-15 gate: an http:// base URL is refused, matching resolveRequest on the direct leg', async () => {
  // `openai-compatible` advertises `http://localhost:11434/v1`, but P5-13's routing requires HTTPS
  // before anything may carry a credential. Weakening that shared primitive for P5-15 would change
  // the connect pages too, so the gate defers to it and says so.
  const local = descriptorFor({
    id: 'openai',
    allowsCustomBaseUrl: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
  });
  const fetch = forbiddenFetch();
  const outcome = await runProviderRequest(
    baseInput({
      consent: true,
      baseUrl: 'http://localhost:11434/v1',
      descriptor: local,
      adapter: { ...recordingAdapter(undefined, [], true), descriptor: local },
    }),
    { fetchTransport: fetch.impl, estimate: stubEstimate },
  );
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.refusal, 'provider-invalid');
  assert.equal(fetch.calls.length, 0);
});

test('P5-15 gate: an unusable relay refuses and never falls back to direct', async () => {
  const fetch = forbiddenFetch();
  const outcome = await runProviderRequest(
    baseInput({ consent: true, relay: { relayUrl: 'http://localhost:8787' } }),
    { fetchTransport: fetch.impl },
  );
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.refusal, 'relay-invalid');
  // The point of the rule: a broken relay must not quietly send the request direct instead.
  assert.equal(fetch.calls.length, 0);
});

test('P5-15 gate: a capability the adapter does not implement is refused', async () => {
  const outcome = await runProviderRequest(baseInput({ consent: true, capability: 'upscale' }), {
    fetchTransport: forbiddenFetch().impl,
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.refusal, 'capability-unsupported');
  assert.equal(outcome.error.message.class, 'unsupported');
});

test('P5-15 gate: generate needs a prompt and edit needs an image', async () => {
  const noPrompt = await runProviderRequest(
    baseInput({ consent: true, request: { capability: 'generate', model: 'gpt-image-1' } }),
    { fetchTransport: forbiddenFetch().impl },
  );
  assert.equal(noPrompt.ok, false);
  if (!noPrompt.ok) assert.equal(noPrompt.error.refusal, 'prompt-required');

  const noImage = await runProviderRequest(
    baseInput({
      consent: true,
      capability: 'edit',
      request: { capability: 'edit', model: 'gpt-image-1', prompt: 'make it winter' },
    }),
    { fetchTransport: forbiddenFetch().impl },
  );
  assert.equal(noImage.ok, false);
  if (!noImage.ok) assert.equal(noImage.error.refusal, 'image-required');
});

test('P5-15 estimate: a documented price is shown with the table version', async () => {
  const estimate = await buildCostEstimate(DESCRIPTOR, 'gpt-image-1', 'generate', 1, stubEstimate);
  assert.equal(estimate.available, true);
  assert.ok(Math.abs((estimate.amount ?? 0) - 0.04) < 1e-9);
  assert.match(estimate.label, /Estimate/);
  assert.ok(estimate.label.includes(DEFAULT_PRICE_TABLE.version));
});

test('P5-15 estimate: no documented price is reported as unavailable, not invented', async () => {
  const estimate = await buildCostEstimate(
    DESCRIPTOR,
    'gpt-image-9-ultra',
    'generate',
    1,
    stubEstimate,
  );
  assert.equal(estimate.available, false);
  assert.equal(estimate.amount, undefined, 'a fabricated figure would be worse than none');
  assert.match(estimate.label, /Estimate unavailable/);
  // Not a plausible-looking number dressed up as free.
  assert.doesNotMatch(estimate.label, /≈\s*\$/u);
});

test('P5-15 estimate: it is computed before the request is issued', async () => {
  const order: string[] = [];
  const outcome = await runProviderRequest(
    baseInput({ consent: true, adapter: recordingAdapter(undefined, [], true) }),
    {
      estimate: async (...args) => {
        order.push('estimate');
        return stubEstimate(...args);
      },
      fetchTransport: (async () => {
        order.push('request');
        return new Response('{}');
      }) as unknown as typeof fetch,
    },
  );
  assert.equal(outcome.ok, true);
  assert.deepEqual(order, ['estimate', 'request'], 'the price must be known before the charge');
});

test('P5-15 result: a placeholder with no image is never reported as success', async () => {
  // The shape every stub adapter's run() returns: a contract description and no pixels.
  const placeholder = {
    usage: { providerCost: '0.00', requestId: 'stub-1' },
    raw: { endpoint: '/images/generations', method: 'POST' },
  } as unknown as AiResult;

  const outcome = await runProviderRequest(
    baseInput({ consent: true, adapter: recordingAdapter(placeholder) }),
    { fetchTransport: recordingFetch().impl, estimate: stubEstimate },
  );
  assert.equal(outcome.ok, false, 'an empty result is a failure, not a completed generation');
  if (outcome.ok) return;
  assert.match(outcome.error.message.headline, /nothing usable/);
});

test('P5-15 result: an empty describe response is not a description', async () => {
  const anthropic = {
    ...recordingAdapter({ text: '   ' } as AiResult),
    descriptor: ANTHROPIC_DESCRIPTOR,
  };
  const outcome = await runProviderRequest(
    baseInput({
      consent: true,
      capability: 'describe',
      descriptor: ANTHROPIC_DESCRIPTOR,
      adapter: anthropic,
      request: { capability: 'describe', model: 'claude-opus-5' },
    }),
    { fetchTransport: recordingFetch().impl, estimate: stubEstimate },
  );
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error.message.headline, /nothing usable/);
});

test('P5-15 result: real describe text is returned', async () => {
  const anthropic = {
    ...recordingAdapter({ text: 'A red square on a white background.' } as AiResult),
    descriptor: ANTHROPIC_DESCRIPTOR,
  };
  const outcome = await runProviderRequest(
    baseInput({
      consent: true,
      capability: 'describe',
      descriptor: ANTHROPIC_DESCRIPTOR,
      adapter: anthropic,
      request: { capability: 'describe', model: 'claude-opus-5' },
    }),
    { fetchTransport: recordingFetch().impl, estimate: stubEstimate },
  );
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.result.text, 'A red square on a white background.');
});

test('P5-15 path: a direct request goes direct and says so', async () => {
  const outcome = await runProviderRequest(baseInput({ consent: true }), {
    fetchTransport: recordingFetch().impl,
    estimate: stubEstimate,
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.usedPath, 'direct');
  assert.match(outcome.value.pathNote, /Direct/);
  assert.match(outcome.value.pathNote, /api\.openai\.com/);
});

test('P5-15 path: a relayed request names the relay, and never downgrades on failure', async () => {
  const outcome = await runProviderRequest(
    baseInput({
      consent: true,
      relay: { relayUrl: 'https://relay.example.workers.dev', token: SECRET_RELAY_TOKEN },
    }),
    { fetchTransport: recordingFetch().impl, estimate: stubEstimate },
  );
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.usedPath, 'relay');
  assert.match(outcome.value.pathNote, /relay\.example\.workers\.dev/);
});

test('P5-15 path: the transport allowlist covers the hop actually taken', async () => {
  const direct = recordingFetch();
  const directOutcome = await runProviderRequest(
    baseInput({ consent: true, adapter: recordingAdapter(undefined, [], true) }),
    { fetchTransport: direct.impl, estimate: stubEstimate },
  );
  assert.equal(directOutcome.ok, true);
  assert.equal(direct.calls.length, 1);
  assert.deepEqual(direct.calls[0]!.opts?.allowedOrigins, ['https://api.openai.com']);

  const relayed = recordingFetch();
  const relayOutcome = await runProviderRequest(
    baseInput({
      consent: true,
      adapter: recordingAdapter(undefined, [], true),
      relay: { relayUrl: 'https://relay.example.workers.dev' },
    }),
    { fetchTransport: relayed.impl, estimate: stubEstimate },
  );
  assert.equal(relayOutcome.ok, true);
  assert.equal(relayed.calls.length, 1);
  // The relay's origin, so the provider key cannot be sent to an unlisted host.
  assert.deepEqual(relayed.calls[0]!.opts?.allowedOrigins, ['https://relay.example.workers.dev']);
});

test('P5-15 adapter contract: ctx.fetch yields a real Response, so res.json() works', async () => {
  // `AdapterContext.fetch` is typed `typeof fetch`, so an adapter may call `res.json()` /
  // `res.headers.get()`. `transportFetch` returns a buffered `TransportResponse` with no methods, so
  // passing it straight through made every adapter that parses JSON fail with
  // `res.json is not a function` — a failure that only appears against a real provider.
  const payload = { data: [{ b64_json: 'iVBORw0KGgo=' }] };
  const outcome = await runProviderRequest(
    baseInput({
      consent: true,
      adapter: {
        ...recordingAdapter(),
        run: async (_req, ctx) => {
          const response = await ctx.fetch('https://api.openai.com/v1/images/generations');
          assert.equal(typeof response.json, 'function', 'the adapter must get a real Response');
          const body = (await response.json()) as typeof payload;
          return { images: ONE_PIXEL, raw: body } as AiResult;
        },
      },
    }),
    {
      fetchTransport: recordingFetch(() => new Response(JSON.stringify(payload))).impl,
      estimate: stubEstimate,
    },
  );

  assert.equal(outcome.ok, true);
});

test('P5-15 credentials: a key and relay token never reach a refusal message', async () => {
  const cases: GateInput[] = [
    baseInput({
      consent: false,
      credentials: { apiKey: SECRET_KEY },
      relay: { relayUrl: 'https://relay.example.workers.dev', token: SECRET_RELAY_TOKEN },
    }),
    baseInput({
      consent: true,
      credentials: { apiKey: '' },
      relay: { relayUrl: 'https://relay.example.workers.dev', token: SECRET_RELAY_TOKEN },
    }),
    baseInput({ consent: true, baseUrl: `https://x.example.com/?t=${SECRET_RELAY_TOKEN}` }),
  ];
  for (const input of cases) {
    const outcome = await runProviderRequest(input, { fetchTransport: forbiddenFetch().impl });
    assert.equal(outcome.ok, false);
    const rendered = JSON.stringify(outcome);
    assert.equal(rendered.includes(SECRET_KEY), false, 'the API key leaked into a message');
    assert.equal(
      rendered.includes(SECRET_RELAY_TOKEN),
      false,
      'the relay token leaked into a message',
    );
  }
});

test('P5-15 credentials: a provider that echoes the key back cannot leak it', async () => {
  // The worst case for redaction: the provider returns the credential in its own error body.
  const echoing = recordingFetch(
    () =>
      new Response(JSON.stringify({ error: { message: `Invalid key ${SECRET_KEY}` } }), {
        status: 401,
      }),
  );

  const outcome = await runProviderRequest(
    baseInput({
      consent: true,
      adapter: {
        ...recordingAdapter(),
        run: async (_req, ctx) => {
          const response = await ctx.fetch('https://api.openai.com/v1/images/generations');
          if (!response.ok) throw new Error(`OpenAI auth failed (401): ${await response.text()}`);
          return { text: 'unused' } as AiResult;
        },
      },
    }),
    { fetchTransport: echoing.impl, estimate: stubEstimate },
  );

  assert.equal(JSON.stringify(outcome).includes(SECRET_KEY), false);
});

test('P5-15 credentials: the credential is never serialised into a user-visible result', async () => {
  const seen: AdapterContext[] = [];
  const outcome = await runProviderRequest(
    baseInput({ consent: true, adapter: recordingAdapter(undefined, seen) }),
    { fetchTransport: recordingFetch().impl, estimate: stubEstimate },
  );
  assert.equal(outcome.ok, true);
  // Adapters receive the key by design; what must never happen is it appearing in output.
  assert.equal(seen[0]!.credentials.apiKey, SECRET_KEY);
  assert.equal(JSON.stringify(outcome).includes(SECRET_KEY), false);
});

test('P5-15 failures: each class renders its own specific message', async () => {
  const cases: { throw: () => unknown; expected: string }[] = [
    {
      throw: () => new TransportError('ai-auth-failed', 'openai', 'Unauthorized', 401),
      expected: 'rejected',
    },
    {
      throw: () => new TransportError('ai-cors-blocked', 'openai', 'Blocked', undefined),
      expected: 'cors-blocked',
    },
    {
      throw: () => new TransportError('ai-rate-limited', 'openai', '429', 429),
      expected: 'rate-limited',
    },
    {
      throw: () => new TransportError('ai-provider-error', 'openai', 'boom', 402),
      expected: 'no-credits',
    },
  ];

  for (const { throw: makeError, expected } of cases) {
    const outcome = await runProviderRequest(
      baseInput({
        consent: true,
        adapter: {
          ...recordingAdapter(),
          run: async () => {
            throw makeError();
          },
        },
      }),
      { fetchTransport: forbiddenFetch().impl, estimate: stubEstimate },
    );
    assert.equal(outcome.ok, false);
    if (outcome.ok) continue;
    assert.equal(outcome.error.message.class, expected, `wrong failure class for ${expected}`);
    // §17.3's contract: every class has a specific headline and an actionable remedy.
    assert.ok(outcome.error.message.headline.length > 0);
    assert.ok(outcome.error.message.remedy.length > 0);
  }
});

test('P5-15 failures: a status embedded in an adapter error still reaches the right class', async () => {
  // Adapters throw a plain `Error` with the status in the message (`"OpenAI auth failed (401): …"`),
  // because the `EngineError` variants would otherwise have to be hand-rolled per adapter. Without
  // recovering that status, a rejected key rendered §17.3's catch-all and the user was told the
  // reason was "not specific".
  const cases: { message: string; expected: string }[] = [
    { message: `OpenAI auth failed (401): ${SECRET_KEY}`, expected: 'rejected' },
    { message: 'OpenAI error (403): forbidden', expected: 'forbidden' },
    { message: 'OpenAI rate limited (429)', expected: 'rate-limited' },
    { message: 'OpenAI error (402): insufficient credits', expected: 'no-credits' },
    { message: 'OpenAI error (500): upstream', expected: 'provider-error' },
  ];

  for (const { message, expected } of cases) {
    const outcome = await runProviderRequest(
      baseInput({
        consent: true,
        adapter: {
          ...recordingAdapter(),
          run: async () => {
            throw new Error(message);
          },
        },
      }),
      { fetchTransport: forbiddenFetch().impl, estimate: stubEstimate },
    );
    assert.equal(outcome.ok, false);
    if (outcome.ok) continue;
    assert.equal(outcome.error.message.class, expected, `wrong class for: ${message}`);
    // The adapter's own message is never promoted — it can quote the key back.
    assert.equal(JSON.stringify(outcome).includes(SECRET_KEY), false);
  }
});

test('P5-15 failures: every refusal offers an actionable remedy', async () => {
  const inputs: GateInput[] = [
    baseInput({ consent: false }),
    baseInput({ consent: true, credentials: {} }),
    baseInput({ consent: true, baseUrl: 'nope' }),
  ];
  for (const input of inputs) {
    const outcome = await runProviderRequest(input, { fetchTransport: forbiddenFetch().impl });
    assert.equal(outcome.ok, false);
    if (outcome.ok) continue;
    assert.ok(outcome.error.message.remedy.length > 0);
    assert.ok(outcome.error.message.headline.length > 0);
  }
});
