/**
 * P5-12 — Shared, provider-agnostic adapter support.
 *
 * Two behaviours in README §14.7–§14.10 must be *executed* rather than merely described, so they
 * live here as testable units instead of being asserted on a string in a `raw` bag:
 *
 * - `readLedgerHeaders` — §14.8/§14.9: credit and rate-limit response headers feed the cost ledger
 *   (§13.6). `AiResult.usage` is the documented channel, not `raw`.
 * - `attachPredictionCancel` — §14.7: Replicate cancellation via `POST /v1/predictions/{id}/cancel`,
 *   wired to our `AbortSignal` so a cancelled job stops being billed.
 *
 * Neither helper ever accepts, stores, or echoes a credential.
 */

import type { EngineError } from '../types.js';
import { registeredTransportCredentials } from './transport.js';

/** Provider credit/rate-limit headers that map onto the ledger. */
export interface LedgerHeaderReading {
  /** Credits spent by this request, when the provider reported it. */
  creditsCharged?: number;
  /** Credits left on the account, when the provider reported it. */
  creditsRemaining?: number;
  /** Provider-reported request rate limits, raw values keyed by the suffix (e.g. 'limit', 'remaining'). */
  rateLimit?: Record<string, string>;
  /** True when at least one recognised header was present. */
  present: boolean;
}

function toNumberOrUndefined(value: string | null): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Read the credit and rate-limit headers documented in §14.8 (remove.bg) and §14.9 (Clipdrop).
 *
 * Headers are matched case-insensitively (the `Headers` interface already normalises, but tests and
 * future transports may hand us a plain map). A missing header is simply absent from the result —
 * providers are not required to send all of them, and we must never invent a value.
 */
export function readLedgerHeaders(
  headers: Headers | Record<string, string> | undefined,
): LedgerHeaderReading {
  const get = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name);
    }
    const record = headers as Record<string, string>;
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(record)) {
      if (key.toLowerCase() === wanted) return value;
    }
    return null;
  };

  const creditsCharged = toNumberOrUndefined(get('X-Credits-Charged') ?? get('x-credits-charged'));
  const creditsRemaining = toNumberOrUndefined(
    get('x-remaining-credits') ?? get('X-Remaining-Credits'),
  );

  // Rate-limit suffixes: limit, remaining, reset, reset-after, policy.
  const suffixes = ['limit', 'remaining', 'reset', 'reset-after', 'policy'];
  const rateLimit: Record<string, string> = {};
  for (const suffix of suffixes) {
    const value = get(`X-Rate-Limit-${suffix}`) ?? get(`x-rate-limit-${suffix}`);
    if (value !== null && value.trim() !== '') rateLimit[suffix] = value.trim();
  }

  const present =
    creditsCharged !== undefined ||
    creditsRemaining !== undefined ||
    Object.keys(rateLimit).length > 0;

  return {
    ...(creditsCharged !== undefined ? { creditsCharged } : {}),
    ...(creditsRemaining !== undefined ? { creditsRemaining } : {}),
    ...(Object.keys(rateLimit).length > 0 ? { rateLimit } : {}),
    present,
  };
}

/** The subset of `AiResult.usage` the ledger consumes. */
export interface LedgerUsage {
  providerCost?: string;
  requestId?: string;
}

/**
 * Fold ledger header readings into an `AiResult.usage` object.
 *
 * Credits are the provider's own accounting, so a charged amount is surfaced verbatim as the
 * provider-reported cost. We never convert credits to a currency figure — that would be an
 * invented rate. A provider that sends no credit headers yields no cost field at all, and the
 * local price table (README §13.6) supplies the estimate instead.
 */
export function usageFromLedgerHeaders(
  reading: LedgerHeaderReading,
  requestId?: string,
): LedgerUsage {
  const usage: LedgerUsage = {};
  if (reading.creditsCharged !== undefined) {
    usage.providerCost = `${reading.creditsCharged} credit(s)`;
  }
  if (requestId !== undefined) usage.requestId = requestId;
  return usage;
}

/** A cancel function; resolves when the cancellation request has settled. */
export type CancelPrediction = () => Promise<void> | void;

/** Handle returned by {@link attachPredictionCancel}. */
export interface PredictionCancelHandle {
  /** True once cancel has been invoked (whether or not it has resolved). */
  readonly cancelled: boolean;
  /**
   * Detach the abort listener. Always call this when the job settles so a long-lived signal does
   * not accumulate listeners across repeated runs.
   */
  detach(): void;
}

/**
 * Wire an `AbortSignal` to a job-cancel action (README §14.7).
 *
 * When `signal` aborts, `cancelPrediction` is invoked — at most once, even if the signal fires
 * repeatedly — so a cancelled Replicate job stops being billed. If the signal has already aborted
 * before we attach, the callback runs immediately and the job is never issued.
 *
 * The listener is registered and must be released via `detach()`; callers should invoke it in a
 * `finally` so a long session does not leak listeners.
 */
export function attachPredictionCancel(
  signal: AbortSignal | undefined,
  cancelPrediction: CancelPrediction,
): PredictionCancelHandle {
  let cancelled = false;
  let detach = (): void => {};

  if (!signal) {
    return {
      get cancelled() {
        return cancelled;
      },
      detach: () => {},
    };
  }

  const onAbort = (): void => {
    if (cancelled) return; // abort can fire more than once; bill only one cancellation
    cancelled = true;
    // Swallow rejections: cancellation is best-effort and must not mask the caller's own
    // cancellation handling. Nothing here touches credentials.
    try {
      void Promise.resolve(cancelPrediction()).catch(() => {});
    } catch {
      /* best effort */
    }
  };

  if (signal.aborted) {
    onAbort();
    return {
      get cancelled() {
        return cancelled;
      },
      detach: () => {},
    };
  }

  signal.addEventListener('abort', onAbort);
  detach = () => signal.removeEventListener('abort', onAbort);

  return {
    get cancelled() {
      return cancelled;
    },
    detach: () => {
      detach();
    },
  };
}

/**
 * The origin a self-hosted provider's base URL contributes to `connect-src` (README §16.4).
 *
 * Returns a bare origin (`scheme://host[:port]`) suitable for a CSP source list, or `null` when the
 * input is not a usable absolute URL. Pure function, so it is directly testable.
 *
 * Note the honest constraint: a header-delivered CSP cannot be widened at runtime. This origin
 * feeds the dedicated provider worker's own CSP, or the transport's origin allowlist (§13.5) — it
 * is not a claim that the document policy can be extended in place.
 */
export function cspConnectSrcOrigin(baseUrl: string | undefined): string | null {
  if (!baseUrl || baseUrl.trim() === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.origin;
}

/**
 * Map a non-2xx probe response onto an `EngineError` of the right kind (§17.3).
 *
 * ## Why this exists
 *
 * §17.3's contract is one specific message per failure class, and `apps/web/src/lib/connect/
 * failures.ts` classifies strictly off `EngineError.kind`. An adapter that reports every rejection
 * as `ai-auth-failed` therefore renders "That key was rejected — copy the whole key again" for a
 * rate limit, a content-policy refusal, and an empty balance alike. All three have a different fix,
 * and the wrong one costs a user an afternoon.
 *
 * So the classification has to happen where the status code is still in hand, and it has to be the
 * *same* classification the UI performs — otherwise the adapter and the renderer disagree about
 * what happened, which is how a failure ends up described two different ways in one flow.
 *
 * The status-to-kind mapping is deliberately identical to `classify()` on the web side:
 *
 * | status              | kind                  | what the user is told              |
 * |---------------------|-----------------------|-----------------------------------|
 * | 401                 | `ai-auth-failed`      | the key was rejected               |
 * | 402                 | `ai-provider-error`   | the account has no credit          |
 * | 403                 | `ai-auth-failed`      | valid key, not permitted           |
 * | 408, 429            | `ai-rate-limited`     | the provider's limit, not ours     |
 * | anything else       | `ai-provider-error`   | the provider returned an error     |
 *
 * `429` carries `retryAfterMs` when the provider sent `Retry-After`, which the transport honours and
 * the ledger records. `413` maps to `ai-provider-error` deliberately: an oversized upload is the
 * provider refusing the request, and §17.3's `provider-error` remedy ("try a smaller image") is
 * exactly right for it.
 */
export function classifyTestResponse(
  status: number,
  provider: string,
  headers?: Headers | Record<string, string>,
): EngineError {
  const readHeader = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name);
    }
    const record = headers as Record<string, string>;
    const match = Object.keys(record).find((key) => key.toLowerCase() === name.toLowerCase());
    return match ? (record[match] ?? null) : null;
  };

  if (status === 401) {
    return {
      kind: 'ai-auth-failed',
      provider,
      remedy: `The provider rejected the credential (HTTP ${status}). Copy the whole key again.`,
    };
  }
  if (status === 403) {
    // Deliberately `ai-auth-failed`, not `ai-provider-error`: the web classifier turns a 403 on an
    // auth failure into the `forbidden` class ("the key is valid but not permitted"), which is the
    // message that matches this status. Reporting it as a generic provider error would collapse it.
    return {
      kind: 'ai-auth-failed',
      provider,
      remedy: `The credential was accepted but this account may not use the API (HTTP ${status}).`,
    };
  }
  if (status === 402) {
    return {
      kind: 'ai-provider-error',
      provider,
      status,
      remedy: 'The account authenticated but has no credit left. Add credit, then test again.',
    };
  }
  if (status === 408 || status === 429) {
    const retryAfter = readHeader('retry-after');
    const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
    return {
      kind: 'ai-rate-limited',
      provider,
      ...(Number.isFinite(seconds) && seconds > 0 ? { retryAfterMs: seconds * 1000 } : {}),
      remedy:
        retryAfter && Number.isFinite(seconds) && seconds > 0
          ? `The provider is rate limiting this account. Retry in about ${seconds}s.`
          : 'The provider is rate limiting this account. Wait, then test again.',
    };
  }
  return {
    kind: 'ai-provider-error',
    provider,
    status,
    remedy: `The provider returned HTTP ${status}. See its API reference for what this endpoint expects.`,
  };
}

/**
 * Classify a thrown value from `adapter.test()` into an `EngineError`.
 *
 * ## Why adapters need this
 *
 * An adapter's `catch` block used to return `ai-auth-failed` for anything thrown. That is wrong for
 * the single most common browser-side failure: a provider whose server sends no CORS headers makes
 * `fetch` throw a `TypeError` before any request is sent, and §17.3 requires that to render as
 * *"your browser can't reach this provider directly"* with the relay remedy — not as "that key was
 * rejected".
 *
 * Telling a user to re-copy a key that was never transmitted costs them an afternoon and sends them
 * looking for the wrong problem. The transport already classifies this correctly
 * (`isBrowserCorsOrNetworkFailure`); this reuses that judgement rather than re-implementing it.
 *
 * The three engines word it differently — Chromium `Failed to fetch`, Firefox `NetworkError when
 * attempting to fetch resource.`, WebKit `Load failed` — so matching is on `TypeError`, which is
 * what all three throw.
 */
export function classifyThrownByTransport(
  cause: unknown,
  provider: string,
  detail?: string,
): EngineError {
  const message = cause instanceof Error ? cause.message : String(cause);
  const isNetworkFailure =
    cause instanceof TypeError ||
    (cause instanceof Error &&
      /failed to fetch|networkerror|load failed|network error/i.test(message));

  if (isNetworkFailure) {
    return {
      kind: 'ai-cors-blocked',
      provider,
      remedy:
        'The browser blocked this request before it left the page — the provider does not allow ' +
        'calls from a web page. Your key was never sent. Deploy a relay, or use a provider that ' +
        'answers browsers directly.',
    };
  }

  return {
    kind: 'ai-provider-error',
    provider,
    providerMessage: detail ?? message,
    remedy: `The request to this provider failed before a response arrived (${message}).`,
  };
}

/**
 * Strip credential values out of a provider's own response text.
 *
 * ## Why an adapter needs this
 *
 * Providers echo the submitted credential back inside their error bodies. OpenAI's 401 reads
 * `Incorrect API key provided: sk-...`; Anthropic's reads `invalid x-api-key: sk-...`. Both are
 * ordinary, documented response shapes, not something an adapter can filter at the source.
 *
 * An adapter that puts that body into a thrown `Error` message therefore puts the user's key into
 * whatever consumes the message — the escalation control's error panel, a console, a crash
 * reporter, a support screenshot. §16.6 forbids exactly that, and §17.3's failure copy has to be
 * safe to render.
 *
 * The recorded contract suite replays those real 401 bodies and asserts the key does not survive;
 * this function is what makes it pass. It was added because those tests failed, which is the
 * clearest evidence this was a live defect rather than a precaution.
 *
 * Substitution is by `split`/`join` rather than `RegExp`, so a credential containing regex
 * metacharacters — which real keys do — cannot break the redaction or throw.
 *
 * `credentials` is optional and defaults to everything registered with the transport, so a caller
 * that has already handed its key to {@link registerTransportCredentials} passes nothing.
 */
export function redactProviderText(
  text: string,
  credentials?: readonly string[] | Record<string, string>,
): string {
  const supplied = credentials
    ? Array.isArray(credentials)
      ? credentials
      : Object.values(credentials)
    : [];
  const values = [...supplied, ...registeredTransportCredentials()].filter(
    (value) => typeof value === 'string' && value.length >= 4,
  );
  let safe = text;
  for (const value of values) safe = safe.split(value).join('[redacted]');
  return safe;
}
