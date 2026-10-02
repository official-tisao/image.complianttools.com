/**
 * §22.7 recorded fixtures — provider responses as they actually arrive.
 *
 * ## Provenance and honesty
 *
 * These are transcribed from provider API documentation and from the response shapes the nightly
 * job (`scripts/provider-contract/`) observes. Where a field could not be confirmed against a live
 * endpoint, the case says so in `note` rather than presenting a guess as a capture — the same rule
 * README §14 applies to its own `⚠ VERIFY` markers.
 *
 * They are deliberately **not** sanitised into a shape the adapters happen to like. A 401 body that
 * echoes the key back keeps that echo, because that is the case the redaction requirement exists
 * for and the one a hand-written "clean" fixture would quietly remove.
 *
 * Every fixture is paired with the `EngineError.kind` §17.3 requires for that status, so the two
 * halves of the spec — parse the response, classify the failure — are checked against the same
 * recorded bytes.
 */

import type { RecordedCase } from './harness.js';

/** 401 from OpenAI, whose body echoes the submitted key back to the caller. */
export const OPENAI_401 = {
  status: 401,
  json: {
    error: {
      message:
        'Incorrect API key provided: sk-contract-fixture-not-a-real-key-000000000000. ' +
        'You can find your API key at https://platform.openai.com/account/api-keys.',
      type: 'invalid_request_error',
      param: null,
      code: 'invalid_api_key',
    },
  },
} as const;

/** 429 from OpenAI, with the Retry-After header the transport honours. */
export const OPENAI_429 = {
  status: 429,
  headers: { 'retry-after': '20', 'x-ratelimit-limit-requests': '500' },
  json: {
    error: {
      message: 'Rate limit reached for gpt-image-1 in organization org-abc on requests per min.',
      type: 'requests',
      param: null,
      code: 'rate_limit_exceeded',
    },
  },
} as const;

/** 400 content-policy refusal. Distinct from a generic 400 in both cause and remedy. */
export const OPENAI_400_POLICY = {
  status: 400,
  json: {
    error: {
      message:
        'Your request was rejected as a result of our safety system. ' +
        'If you think this is a mistake, please reach out to support.',
      type: 'invalid_request_error',
      param: 'prompt',
      code: 'moderation_blocked',
    },
  },
} as const;

/** 200 generate response carrying base64 image data. */
export const OPENAI_200_GENERATE = {
  status: 200,
  json: {
    created: 1_718_000_000,
    data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEElFTkSuQmCC' }],
    usage: { total_tokens: 100 },
  },
} as const;

/** Anthropic 401, whose body echoes the submitted key. */
export const ANTHROPIC_401 = {
  status: 401,
  json: {
    type: 'error',
    error: {
      type: 'authentication_error',
      message: 'invalid x-api-key: sk-contract-fixture-not-a-real-key-000000000000',
    },
  },
} as const;

/** Anthropic 429. */
export const ANTHROPIC_429 = {
  status: 429,
  json: {
    type: 'error',
    error: {
      type: 'rate_limit_error',
      message: 'Number of request tokens has exceeded your per-minute rate limit.',
    },
  },
} as const;

/** Anthropic refusal — a valid 200 whose content is a refusal, not a description. */
export const ANTHROPIC_200_REFUSAL = {
  status: 200,
  json: {
    id: 'msg_01ABC',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'refusal',
    stop_sequence: null,
    usage: { input_tokens: 1_500, output_tokens: 12 },
    content: [
      {
        type: 'text',
        text: "I can't help with that request.",
      },
    ],
  },
} as const;

/** Anthropic truncated at max_tokens — a *successful* call whose answer is incomplete. */
export const ANTHROPIC_200_TRUNCATED = {
  status: 200,
  json: {
    id: 'msg_01DEF',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'max_tokens',
    stop_sequence: null,
    usage: { input_tokens: 1_500, output_tokens: 8 },
    content: [
      {
        type: 'text',
        text: 'A photograph of a street',
      },
    ],
  },
} as const;

/** Stability AI 403 — authenticated, but the model is not enabled for the account. */
export const STABILITY_403 = {
  status: 403,
  json: {
    id: 'e8b7f1c2-0000-4000-8000-000000000000',
    message: 'Organization not authorized to use this model.',
    name: 'organization_not_authorized',
  },
} as const;

/** Stability AI 402 — authenticated, balance exhausted. §17.3's `no-credits` class. */
export const STABILITY_402 = {
  status: 402,
  json: {
    id: 'e8b7f1c2-0000-4000-8000-000000000001',
    message: 'Your balance is too low to complete this request.',
    name: 'insufficient_credits',
  },
} as const;

/** Stability AI balance probe — the free endpoint §14.4 documents for `test()`. */
export const STABILITY_200_BALANCE = {
  status: 200,
  json: { balance: 12.5 },
} as const;

/** BFL job that failed moderation — a terminal status that must not read as a generic failure. */
export const BFL_200_CONTENT_MODERATED = {
  status: 200,
  json: {
    id: '9f8e7d6c-0000-4000-8000-00000000000a',
    status: 'Content Moderated',
    error: null,
    timing: { submit: 1_718_000_000_000 },
  },
} as const;

/** BFL job that failed for an ordinary reason, to prove moderation stays distinguishable. */
export const BFL_200_ERROR = {
  status: 200,
  json: {
    id: '9f8e7d6c-0000-4000-8000-00000000000b',
    status: 'Error',
    error: 'Model is temporarily unavailable.',
    timing: { submit: 1_718_000_100_000 },
  },
} as const;

/** Replicate prediction that failed, with the reason in `error`. */
export const REPLICATE_200_FAILED = {
  status: 200,
  json: {
    id: 'p-abc123',
    model: 'black-forest-labs/flux-fill-pro',
    version: 'abc123',
    status: 'failed',
    error: 'Input image is not a supported format.',
    logs: '',
    created_at: '2026-09-30T03:00:00Z',
  },
} as const;

/** remove.bg 400 — bad input, the provider refusing the request rather than the key. */
export const REMOVEBG_400 = {
  status: 400,
  json: {
    error: 'Bad Request',
    message: 'No file supplied in POST data.',
    fields: { image_url: ['This field is required.'] },
  },
} as const;

/** remove.bg 402 — quota exhausted; a credit problem, not an authentication one. */
export const REMOVEBG_402 = {
  status: 402,
  json: {
    error: 'Payment Required',
    message: 'Account balance is too low.',
  },
} as const;

/** Clipdrop 429, with the credits header §14.9 routes to the ledger. */
export const CLIPDROP_429 = {
  status: 429,
  headers: { 'x-remaining-credits': '0' },
  json: { status: 429, error: 'Too Many Requests' },
} as const;

/** fal.ai 401. */
export const FAL_401 = {
  status: 401,
  json: { detail: 'Invalid API key' },
} as const;

/** fal.ai 422 — a request the model rejected. */
export const FAL_422 = {
  status: 422,
  json: { detail: [{ loc: ['body', 'image_url'], msg: 'field required' }] },
} as const;

/** OpenAI-compatible local server that answers `/models` and nothing else. */
export const LOCAL_MODELS_ONLY = {
  status: 200,
  json: {
    object: 'list',
    data: [
      { id: 'llava:7b', object: 'model' },
      { id: 'llama3:8b', object: 'model' },
    ],
  },
} as const;

/** A 404 from a local server, which is how a capability probe discovers absence. */
export const LOCAL_404 = {
  status: 404,
  text: 'Not Found',
} as const;

/**
 * The full error-representative matrix §22.7 requires, keyed by what it is meant to prove.
 *
 * Kept as one table so a reader can see at a glance that 401, 429, 400-content-policy, job-failed,
 * and moderation are all covered — and so that adding a provider means adding rows here rather than
 * discovering later that one class went untested.
 */
export const ERROR_MATRIX = [
  {
    label: '401 auth failure',
    provider: 'openai',
    response: OPENAI_401,
    expectKind: 'ai-auth-failed',
    why: '§17.3 "That key was rejected"; the body also echoes the key, so it doubles as the leak case.',
  },
  {
    label: '429 rate limited',
    provider: 'openai',
    response: OPENAI_429,
    expectKind: 'ai-rate-limited',
    why: 'Retry-After is carried into the transport; the message must say it is the provider limit.',
  },
  {
    label: '400 content policy',
    provider: 'openai',
    response: OPENAI_400_POLICY,
    expectKind: 'ai-provider-error',
    why: 'A safety refusal is not a rate limit or an auth problem and must not read as one.',
  },
  {
    label: '403 valid key, no permission',
    provider: 'stability',
    response: STABILITY_403,
    expectKind: 'ai-auth-failed',
    why: '§17.3 `forbidden` distinguishes this from `rejected`; both carry ai-auth-failed + status 403.',
  },
  {
    label: '402 no credits',
    provider: 'stability',
    response: STABILITY_402,
    expectKind: 'ai-provider-error',
    why: '§17.3 `no-credits`; authenticated but unable to spend.',
  },
  {
    label: 'job failed',
    provider: 'replicate',
    response: REPLICATE_200_FAILED,
    expectKind: 'ai-provider-error',
    why: 'An async job can fail with HTTP 200; the terminal status carries the failure.',
  },
  {
    label: 'content moderated',
    provider: 'bfl',
    response: BFL_200_CONTENT_MODERATED,
    expectKind: 'ai-provider-error',
    why: '§14.5 requires moderation to map to its own message, distinct from a generic failure.',
  },
  {
    label: 'generic job error',
    provider: 'bfl',
    response: BFL_200_ERROR,
    expectKind: 'ai-provider-error',
    why: 'Proves moderation is distinguishable rather than being the only terminal failure.',
  },
  {
    label: '402 remove.bg quota',
    provider: 'removebg',
    response: REMOVEBG_402,
    expectKind: 'ai-provider-error',
    why: 'Credits, not authentication — the two have different fixes.',
  },
  {
    label: 'fal 401',
    provider: 'fal',
    response: FAL_401,
    expectKind: 'ai-auth-failed',
    why: 'fal uses a different body shape; the classification must not depend on OpenAI s schema.',
  },
  {
    label: 'fal 422',
    provider: 'fal',
    response: FAL_422,
    expectKind: 'ai-provider-error',
    why: 'A validation failure the user can act on by changing the request.',
  },
  {
    label: 'clipdrop 429',
    provider: 'clipdrop',
    response: CLIPDROP_429,
    expectKind: 'ai-rate-limited',
    why: 'Carries a credits header, so the ledger reading and the classification are checked together.',
  },
] satisfies ReadonlyArray<{
  label: string;
  provider: string;
  response: { status: number; json?: unknown; text?: string; headers?: Record<string, string> };
  expectKind: string;
  why: string;
}>;

export type ErrorMatrixRow = (typeof ERROR_MATRIX)[number];

/** Success cases, one per provider that has a genuinely real request path or a documented probe. */
export const SUCCESS_CASES: readonly RecordedCase[] = [
  {
    name: 'openai generate returns pixels',
    spec: '§14.2',
    note: 'b64_json is decoded into a real RasterImage, not passed through as a string.',
    response: OPENAI_200_GENERATE,
  },
  {
    name: 'stability balance probe succeeds',
    spec: '§14.4',
    note: 'The free endpoint §14.4 documents for test(); a 200 here proves the credential only.',
    response: STABILITY_200_BALANCE,
  },
  {
    name: 'local openai-compatible server answers /models',
    spec: '§14.10',
    note: 'The probe discovers models from the server rather than echoing the descriptor.',
    response: LOCAL_MODELS_ONLY,
  },
];
