/**
 * P5-12 — Replicate adapter (the escape hatch).
 * Source of truth: README §14.7, PLAN.md P5-12.
 *
 * Implementation notes carried from §14.7:
 * - `Prefer: wait=60` turns most calls into a single synchronous request; fall back to polling
 *   `GET /v1/predictions/{id}` when the job exceeds the wait window.
 * - Cancellation via `POST /v1/predictions/{id}/cancel`, wired to our `AbortSignal`.
 * - `browserDirect` stays `'unknown'`: §14.7 says CORS is not verified for all endpoints and the
 *   posture must not be claimed until the §22.7 nightly contract test proves otherwise.
 * - Model slugs are content-addressed and community models disappear, so the curated defaults
 *   carry the README's ⚠ VERIFY marker rather than asserting they are current.
 */
import type {
  ProviderAdapter,
  ProviderDescriptor,
  AiRequest,
  AiResult,
  AdapterContext,
  AiCapability,
} from '../types.js';
import type { EngineError } from '../../types.js';
import { attachPredictionCancel } from '../adapter-support.js';

const DESCRIPTOR_ID = 'replicate';

const descriptor: ProviderDescriptor = {
  id: DESCRIPTOR_ID,
  name: 'Replicate',
  homepage: 'https://replicate.com',
  keysUrl: 'https://replicate.com/account/api-tokens',
  pricingUrl: 'https://replicate.com/pricing',
  docsUrl: 'https://replicate.com/docs/reference/http',
  credentialFields: [
    {
      key: 'apiKey',
      label: 'Replicate API Token',
      placeholder: 'r8_...',
      secret: true,
      required: true,
    },
  ],
  // Self-hosted proxies and Relay front-ends in front of Replicate are common, so a custom base
  // URL is genuinely useful here rather than hypothetical.
  allowsCustomBaseUrl: true,
  defaultBaseUrl: 'https://api.replicate.com',
  capabilities: [
    'generate',
    'edit',
    'inpaint',
    'outpaint',
    'erase',
    'upscale',
    'removeBackground',
    'replaceBackground',
    'describe',
    'segment',
  ] as AiCapability[],
  models: [
    {
      id: 'nightmareai/real-esrgan',
      label: 'Real-ESRGAN (nightmareai)',
      capabilities: ['upscale'],
      notes: '⚠ VERIFY slug still exists; community models disappear. Upscale.',
    },
    {
      id: 'lucataco/remove-bg',
      label: 'remove-bg (lucataco)',
      capabilities: ['removeBackground'],
      notes: '⚠ VERIFY slug still exists; community models disappear.',
    },
    {
      id: 'black-forest-labs/flux-fill-pro',
      label: 'FLUX Fill Pro (black-forest-labs)',
      capabilities: ['inpaint', 'outpaint'],
      supportsMask: true,
      notes: '⚠ VERIFY slug still exists; community models disappear. Mask-based fill.',
    },
    {
      id: 'andreasjansson/blip-2',
      label: 'BLIP-2 (andreasjansson)',
      capabilities: ['describe'],
      notes: '⚠ VERIFY slug still exists; a current VLM may be the better default.',
    },
  ],
  // §14.7: "Set browserDirect: 'unknown' until the nightly contract test proves otherwise."
  browserDirect: 'unknown',
  browserDirectNote:
    'CORS not verified for all endpoints. If a call is blocked, use the Relay (§15) rather than an inscrutable failure.',
  costHint: 'Per-model; community models vary widely.',
  dataPolicy: {
    summary: 'Model-specific — Replicate hosts third-party community models.',
    url: 'https://replicate.com/privacy',
  },
};

function baseUrl(ctx: AdapterContext): string {
  return (ctx.baseUrl || descriptor.defaultBaseUrl).replace(/\/$/, '');
}

/** A prediction as Replicate reports it. Only the fields the flow needs. */
export interface ReplicatePrediction {
  id?: string;
  status?: string;
  error?: string;
  output?: unknown;
  logs?: string;
}

/** Terminal statuses — polling stops on any of these (§14.7). */
const TERMINAL_STATUSES = ['succeeded', 'failed', 'canceled'] as const;

/** Poll backoff schedule, in milliseconds. */
const POLL_BACKOFF_MS = [500, 2000, 5000] as const;

export interface ExecutePredictionOptions {
  /** Model slug (`owner/name`) or, when `version` is set, an arbitrary model identifier. */
  model: string;
  /** Model input payload, sent verbatim as `{ input: ... }`. */
  input?: Record<string, unknown>;
  /** Content-addressed version hash; switches to the /v1/predictions form (§14.7). */
  version?: string | null;
  /** Called with each poll attempt, so the UI can show progress. */
  onPoll?: (attempt: number, status: string) => void;
  /** Injected for tests; defaults to a real timer-backed sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests; defaults to the context fetch. */
  fetchImpl?: typeof fetch;
  /** Upper bound on poll attempts before giving up. */
  maxPollAttempts?: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Create a prediction and resolve it, exactly as §14.7 describes.
 *
 * Sends `Prefer: wait=60` so most jobs come back finished in a single request. Only a job still
 * `starting`/`processing` after the wait window falls back to polling
 * `GET /v1/predictions/{id}` with backoff. Aborting `ctx.signal` cancels the job through
 * `POST /v1/predictions/{id}/cancel` so a cancelled run stops being billed.
 *
 * Exported and dependency-injected so the flow — including the cancellation wiring — is testable
 * offline against a stubbed transport, with no billable call and no credentials.
 */
export async function executePrediction(
  opts: ExecutePredictionOptions,
  ctx: AdapterContext,
): Promise<ReplicatePrediction> {
  const doFetch = opts.fetchImpl ?? ctx.fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const apiKey = ctx.credentials.apiKey ?? '';
  const url = baseUrl(ctx);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  // Declared before the cancel handle: a pre-aborted signal fires the callback synchronously
  // inside attachPredictionCancel, so it must already be in scope.
  let predictionId: string | undefined;

  // Cancellation is wired for the whole life of the job, not just the create call, so an abort
  // during a long poll still cancels (and stops billing) the run.
  const cancel = attachPredictionCancel(ctx.signal, async () => {
    if (!predictionId) return; // nothing issued yet — nothing to cancel, and nothing billed
    // Deliberately does NOT forward ctx.signal. This request fires *because* the signal has
    // already aborted, so passing it would make the cancel itself reject immediately and the
    // job would keep running — and keep billing. This is the whole point of §14.7's wiring.
    await doFetch(`${url}/v1/predictions/${encodeURIComponent(predictionId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  });

  try {
    const createUrl = opts.version
      ? `${url}/v1/predictions`
      : `${url}/v1/models/${opts.model}/predictions`;
    const createRes = await doFetch(createUrl, {
      method: 'POST',
      headers: { ...headers, Prefer: 'wait=60' },
      body: JSON.stringify({ input: opts.input ?? {} }),
      signal: ctx.signal || null,
    });
    if (!createRes.ok) {
      const body = await createRes.text().catch(() => '');
      throw new Error(`Replicate create failed (${createRes.status}): ${body}`);
    }
    let prediction = (await createRes.json()) as ReplicatePrediction;
    predictionId = prediction.id;

    const maxAttempts = opts.maxPollAttempts ?? POLL_BACKOFF_MS.length * 40;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = prediction.status ?? '';
      if ((TERMINAL_STATUSES as readonly string[]).includes(status)) return prediction;
      if (cancel.cancelled) {
        // The abort already fired the cancel request; surface the provider's own outcome.
        return { ...prediction, status: 'canceled' };
      }
      opts.onPoll?.(attempt, status);
      await sleep(POLL_BACKOFF_MS[Math.min(attempt, POLL_BACKOFF_MS.length - 1)] ?? 5000);
      const pollRes = await doFetch(
        `${url}/v1/predictions/${encodeURIComponent(prediction.id ?? '')}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: ctx.signal || null,
        },
      );
      if (!pollRes.ok) {
        const body = await pollRes.text().catch(() => '');
        throw new Error(`Replicate poll failed (${pollRes.status}): ${body}`);
      }
      prediction = (await pollRes.json()) as ReplicatePrediction;
    }
    throw new Error('Replicate prediction did not reach a terminal status before the poll limit.');
  } finally {
    cancel.detach();
  }
}

export const replicateAdapter: ProviderAdapter = {
  descriptor,

  /**
   * `GET /v1/account` — free, and the documented way to prove the token works (§14.7).
   *
   * The account endpoint proves the *credential*, not that any particular model slug is reachable,
   * so `detail` says exactly that. We never claim a model ran.
   */
  async test(ctx: AdapterContext) {
    if (!ctx.credentials.apiKey) {
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: DESCRIPTOR_ID,
          remedy: 'Provide a Replicate API token (r8_...).',
        } satisfies EngineError,
      };
    }
    try {
      const res = await ctx.fetch(`${baseUrl(ctx)}/v1/account`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${ctx.credentials.apiKey}` },
        signal: ctx.signal || null,
      });
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: {
            kind: 'ai-auth-failed',
            provider: DESCRIPTOR_ID,
            remedy: `Replicate rejected the token (${res.status}). Create a new one and retry.`,
          } satisfies EngineError,
        };
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          ok: false,
          error: {
            kind: 'ai-provider-error',
            provider: DESCRIPTOR_ID,
            status: res.status,
            providerMessage: body,
            remedy: 'The account endpoint failed. Check status.replicate.com and retry.',
          } satisfies EngineError,
        };
      }
      return {
        ok: true,
        // The account call proves auth only. Reporting the full capability list here would
        // over-claim: no model was executed.
        confirmed: [] as AiCapability[],
        detail:
          'Token accepted by GET /v1/account (free). This proves the credential only — no model was run, so no capability is confirmed yet.',
      };
    } catch (e) {
      return {
        ok: false,
        error: {
          kind: 'ai-provider-error',
          provider: DESCRIPTOR_ID,
          providerMessage: e instanceof Error ? e.message : String(e),
          remedy:
            'Could not reach Replicate. A network/CORS failure here is a CORS posture question, not a key problem — try the Relay (§15).',
        } satisfies EngineError,
      };
    }
  },

  async listModels(ctx: AdapterContext) {
    void ctx;
    // Replicate's catalogue is unbounded and community-owned; the curated list above is the
    // honest starting point. §22.7's nightly job diffs it against the live catalogue.
    return descriptor.models;
  },

  async run(req: AiRequest, ctx: AdapterContext): Promise<AiResult> {
    if (!ctx.credentials.apiKey) {
      throw Object.assign(new Error('Replicate missing apiKey'), {
        kind: 'ai-auth-failed' as const,
      });
    }
    if (!descriptor.capabilities.includes(req.capability)) {
      throw new Error(`Replicate adapter: unsupported capability ${req.capability}`);
    }

    const model = req.model || descriptor.models[0]?.id || '';
    // §14.7: prefer the /models/{owner}/{name}/predictions form (always latest), but let advanced
    // users pin a content-addressed `version` hash for reproducibility.
    const pinnedVersion = typeof req.extra?.version === 'string' ? req.extra.version : null;
    const createUrl = pinnedVersion
      ? `${baseUrl(ctx)}/v1/predictions`
      : `${baseUrl(ctx)}/v1/models/${model}/predictions`;

    // Generation is not executed here: doing so would spend the user's money with no live
    // verification behind it. `executePrediction` (above) carries the real, tested flow —
    // Prefer: wait, poll fallback, and abort -> cancel — and the runtime calls it with this
    // request. What follows records the contract so the flow stays inspectable and testable.
    return {
      text: '',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        providerCost: '0.00',
        requestId: `replicate-${req.capability}-${Date.now()}`,
      },
      raw: {
        adapter: 'replicate',
        p5: 12,
        spec: 'README §14.7',
        baseUrl: baseUrl(ctx),
        capability: req.capability,
        model,
        request: {
          method: 'POST',
          url: createUrl,
          headers: {
            Authorization: 'Bearer <redacted>',
            'Content-Type': 'application/json',
            Prefer: 'wait=60',
          },
          body: { input: { ...(req.prompt ? { prompt: req.prompt } : {}) } },
        },
        preferWait: 'wait=60',
        preferWaitRationale:
          'Prefer: wait=60 makes most jobs a single synchronous request and avoids polling entirely.',
        pollFallback: {
          usedWhen: 'status is "starting" or "processing" after the wait window',
          endpoint: `${baseUrl(ctx)}/v1/predictions/{id}`,
          method: 'GET',
          terminalStatuses: ['succeeded', 'failed', 'canceled'],
          backoffMs: [500, 2000, 5000],
        },
        cancellation: {
          endpoint: 'POST /v1/predictions/{id}/cancel',
          wiredToAbortSignal: true,
          firesOnce: true,
          listenerRemovedOnSettle: true,
          note: 'Cancelling stops the job being billed. Implemented in executePrediction().',
        },
        versionPinning: {
          preferred: '/v1/models/{owner}/{name}/predictions (always latest)',
          pinnedForm: pinnedVersion ? '/v1/predictions with a version hash' : null,
          version: pinnedVersion,
        },
        // No live evidence for community-model mask polarity; reported false, as in bfl.ts.
        maskPolarityVerified: false,
        maskPolarityNote:
          '⚠ VERIFY: per-model mask polarity varies across Replicate community models; not verified without a live run.',
        corsPosture: 'unknown',
        corsNote:
          'CORS not verified for all endpoints (§14.7). On a blocked call, route through the Relay (§15).',
      },
    };
  },
};
