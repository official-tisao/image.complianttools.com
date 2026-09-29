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
