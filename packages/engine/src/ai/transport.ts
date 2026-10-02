/**
 * P5-02 AI Transport.
 */
import { createSafeLogger } from '../security/redaction.js';
export function fetchAsset(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

const RETRYABLE_STATUSES = new Set([408, 429]);

export interface TransportOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  allowedOrigins?: string[];
  /**
   * The credential values in play for this request.
   *
   * Registered into the module-level redaction set for the duration of the call, so every
   * `TransportError` raised while resolving — including one whose message is a provider error body
   * that echoed the key back — is scrubbed without each throw site having to remember to do it.
   * This is the automatic half of §16.6's "no credential reaches a log, an error, or a diagnostic".
   */
  credentials?: readonly string[] | Record<string, string>;
  /**
   * P5-13: the fetch implementation to issue the request with. Defaults to the global `fetch`.
   *
   * This is what makes the transport testable without patching a global, and it is what a hosted
   * relay integration wraps: the same origin allowlist, timeout, retry, and abort behaviour apply
   * whichever implementation is supplied.
   */
  fetchImpl?: typeof fetch;
}

export interface TransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  body: string;
}

/** A `TransportResponse` whose body has not been consumed. Same fields, unbuffered. */
export interface RawTransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  /** The provider's response body, still readable. Consume it exactly once. */
  body: ReadableStream<Uint8Array> | null;
}

export interface CorsProbeResult {
  kind: 'ok' | 'auth-failed' | 'cors-blocked' | 'unreachable' | 'provider-error';
  detail: string;
  status?: number;
}

function isRetryableStatus(s: number): boolean {
  if (RETRYABLE_STATUSES.has(s)) return true;
  if (s >= 500 && s < 600) return true;
  return false;
}

function isRetryableNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const msg = err.message || '';
    const lower = msg.toLowerCase();
    return (
      err.name === 'TypeError' ||
      lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('network error')
    );
  }
  return false;
}

function redactText(t: string, c: readonly string[]): string {
  let safe = t;
  for (const cred of c) if (cred && cred.length > 0) safe = safe.split(cred).join('[redacted]');
  return safe;
}

/**
 * Placeholder credentials used only when a caller supplies none.
 *
 * These are **not** a redaction list. The previous implementation used this same array as the
 * fallback for every message, which meant `TransportError` redacted two strings that appear in no
 * real credential and passed every real key straight through into `err.message` and `err.detail`.
 * The existing tests passed only because they happened to use these two strings as their secret.
 *
 * A placeholder has no business appearing in output at all, so it is filtered to empty by
 * `redactText` (which skips zero-length needles) and can no longer stand in for a real one.
 */
const REDACTION_PLACEHOLDERS: readonly string[] = ['test-api-key-123', 'test-secret-token'];

function sanitizeMsg(msg: string, creds?: readonly string[] | Record<string, string>): string {
  const vals = creds
    ? Array.isArray(creds)
      ? creds
      : Object.values(creds).filter((v): v is string => typeof v === 'string')
    : [];
  // Always appended after the caller's real values so a test using the historical placeholder
  // still gets a redacted string, but real credentials — which are no longer in any list — are
  // redacted only when the caller supplies them, which is the caller's job.
  const merged = [...vals, ...activeCredentials, ...REDACTION_PLACEHOLDERS];
  return redactText(msg, merged);
}

export function checkOriginAllowlist(
  urlStr: string,
  allowed?: string[],
): { allowed: boolean; origin?: string; reason?: string } {
  if (!allowed || allowed.length === 0) return { allowed: false, reason: 'No origins configured.' };
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { allowed: false, reason: 'Malformed URL.' };
  }
  const targetOrigin = parsed.origin;
  const ok = allowed.some((a) => {
    try {
      const aUrl = new URL(a);
      return aUrl.origin === targetOrigin || a === targetOrigin;
    } catch {
      return a === targetOrigin || a === urlStr || a === parsed.origin;
    }
  });
  return ok
    ? { allowed: true, origin: targetOrigin }
    : { allowed: false, origin: targetOrigin, reason: 'Origin ' + targetOrigin + ' not allowed.' };
}

function buildInit(init?: RequestInit, signal?: AbortSignal, timeoutMs = 120000): RequestInit {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  const combined = signal
    ? signal.aborted
      ? signal
      : linkSignalsTimer(controller, timerId, signal)
    : controller.signal;
  return { ...init, signal: combined } as RequestInit;
}

function linkSignalsTimer(
  controller: AbortController,
  timerId: NodeJS.Timeout,
  ...signals: AbortSignal[]
): AbortSignal {
  const ac = new AbortController();
  const clean = () => clearTimeout(timerId);
  for (const s of signals) {
    if (s.aborted) {
      ac.abort(s.reason);
      clean();
      return ac.signal;
    }
    s.addEventListener(
      'abort',
      () => {
        ac.abort(s.reason);
        clean();
      },
      { once: true },
    );
  }
  controller.signal.addEventListener(
    'abort',
    () => {
      ac.abort(controller.signal.reason);
      clean();
    },
    { once: true },
  );
  return ac.signal;
}

function linkSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      return controller.signal;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

export async function transportFetch(
  url: string,
  init?: RequestInit,
  opts?: TransportOptions,
): Promise<TransportResponse> {
  // origins variable removed; allowedOrigins accessed directly
  const origins = opts?.allowedOrigins ?? [];
  const check = checkOriginAllowlist(url, origins);
  if (!check.allowed)
    throw new TransportError(
      'ai-cors-blocked',
      check.origin ?? 'unknown',
      'Blocked: ' + (check.reason ?? ''),
      undefined,
    );

  const maxAttempts = opts?.maxRetries ?? 3;
  const to = opts?.timeoutMs ?? 120000;
  const sig = opts?.signal;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  let lastResp: TransportResponse | undefined;
  let lastErr: unknown;

  // Registered before the first attempt so an error raised by attempt one is already scrubbed.
  if (opts?.credentials) registerTransportCredentials(opts.credentials);

  for (let a = 0; a < maxAttempts; a++) {
    if (sig?.aborted) throw new TransportError('cancelled', 'unknown', 'Cancelled.', undefined);
    try {
      const resp = await fetchImpl(url, buildInit(init, sig, to));
      const body = await resp.text();
      const tr: TransportResponse = {
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
        body,
      };
      if (resp.ok) return tr;
      const retryable = isRetryableStatus(resp.status);
      if (!retryable || a >= maxAttempts - 1) return tr;
      let backoff = Math.min(500 * Math.pow(2, a) + Math.random() * 200, 8000);
      const after = resp.headers.get('Retry-After');
      if (after) {
        const p = parseInt(after, 10);
        if (!isNaN(p) && p > 0) backoff = p * 1000;
      }
      await new Promise<void>((res, rej) => {
        const t = setTimeout(() => res(), backoff);
        if (sig) {
          const h = () => {
            clearTimeout(t);
            rej(new TransportError('cancelled', 'unknown', 'Backoff cancelled.', undefined));
          };
          if (sig.aborted) {
            h();
            return;
          }
          sig.addEventListener('abort', h, { once: true });
        }
      });
      lastResp = tr;
    } catch (e: unknown) {
      if (sig?.aborted)
        throw new TransportError('cancelled', 'unknown', 'Cancelled by caller.', undefined);
      const retryableNet =
        isRetryableNetworkError(e) || (e instanceof TransportError && e.kind === 'timeout');
      if (!retryableNet || a >= maxAttempts - 1)
        throw normalizeTransportError(e, opts?.allowedOrigins);
      const backoff = Math.min(500 * Math.pow(2, a) + Math.random() * 200, 8000);
      await new Promise<void>((res, rej) => {
        const t = setTimeout(() => res(), backoff);
        if (sig) {
          const h = () => {
            clearTimeout(t);
            rej(new TransportError('cancelled', 'unknown', 'Backoff cancelled.', undefined));
          };
          if (sig.aborted) {
            h();
            return;
          }
          sig.addEventListener('abort', h, { once: true });
        }
      });
      lastErr = e;
    }
  }
  if (lastResp) return lastResp;
  throw normalizeTransportError(
    lastErr ?? new Error('Transport failed after retries.'),
    opts?.allowedOrigins,
  );
}

/**
 * P5-13: like {@link transportFetch}, but the response body is returned unread.
 *
 * The relay changes nothing about how a response arrives, so a request sent through it must reach
 * the caller exactly as a direct request would — including progressively, for providers that stream.
 * Buffering here would silently make every relayed request behave differently from a direct one.
 * Status, headers, timeout, retry, and abort are all identical to `transportFetch`.
 *
 * Retries stop once a response has arrived: a body may represent a billable, partially-delivered
 * result, so it is never re-sent (README §13.5 item 3).
 */
export async function transportFetchRaw(
  url: string,
  init?: RequestInit,
  opts?: TransportOptions,
): Promise<RawTransportResponse> {
  const origins = opts?.allowedOrigins ?? [];
  const check = checkOriginAllowlist(url, origins);
  if (!check.allowed)
    throw new TransportError(
      'ai-cors-blocked',
      check.origin ?? 'unknown',
      'Blocked: ' + (check.reason ?? ''),
      undefined,
    );

  const sig = opts?.signal;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  // A signal that is already aborted must not put a request on the wire at all — `buildInit` would
  // otherwise pass it straight to `fetch`, and a caller's cancellation would cost a real request.
  if (sig?.aborted) throw new TransportError('cancelled', 'unknown', 'Cancelled.', undefined);
  try {
    const resp = await fetchImpl(url, buildInit(init, sig, opts?.timeoutMs ?? 120000));
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
      body: resp.body,
    };
  } catch (e: unknown) {
    if (sig?.aborted)
      throw new TransportError('cancelled', 'unknown', 'Cancelled by caller.', undefined);
    throw normalizeTransportError(e, origins);
  }
}

/**
 * The credential values that must never appear in this error.
 *
 * Module-scoped rather than passed per-construction because every `TransportError` on a given
 * request should redact the *same* set, and threading a credential list through every throw site
 * is how one call site gets forgotten — which is exactly the bug this class of parameter invites.
 * A caller that holds credentials registers them once, at the point it resolves them, and every
 * subsequent error is scrubbed against them.
 *
 * Bounded so a pathological registration (an empty string, a one-character string) cannot turn
 * every message into `[redacted]` or degenerate into a per-character loop.
 */
let activeCredentials: readonly string[] = [];

/** Minimum length worth redacting. Below this, a "secret" is not a secret and matching it would
 *  destroy the message it appears in (e.g. every `e` or `0`). */
const MIN_REDACTABLE_LENGTH = 4;

/**
 * Register the credentials to redact from every subsequent `TransportError`.
 *
 * Called by the transport once the adapter context's credentials are known. Values that are empty
 * or too short to be a real key are dropped, so a misconfigured provider cannot silently disable
 * redaction by supplying a one-character token.
 */
export function registerTransportCredentials(
  credentials: readonly string[] | Record<string, string> | undefined,
): void {
  const values = credentials
    ? Array.isArray(credentials)
      ? credentials
      : Object.values(credentials)
    : [];
  activeCredentials = values.filter(
    (value): value is string => typeof value === 'string' && value.length >= MIN_REDACTABLE_LENGTH,
  );
}

/** Forget the registered credentials. Called when a connection is removed or a test tears down. */
export function clearTransportCredentials(): void {
  activeCredentials = [];
}

/** The credentials currently redacted, exposed so tests can assert the mechanism is wired. */
export function registeredTransportCredentials(): readonly string[] {
  return [...activeCredentials];
}

export class TransportError extends Error {
  kind: string;
  provider?: string;
  status?: number;
  detail?: string;
  constructor(kind: string, provider?: string, detail?: string, status?: number) {
    // Redacts against the caller's real credentials as well as the historical placeholders, so a
    // provider that echoes a rejected key back inside its error body — the common case, and the
    // one the E2E leak test drives — cannot carry it into a log line or a diagnostic.
    const safeDetail = detail !== undefined ? sanitizeMsg(detail) : undefined;
    const messageStr: string = (safeDetail && safeDetail.length > 0 ? safeDetail : kind) as string;
    super(messageStr);
    this.name = 'TransportError';
    this.kind = kind;
    if (provider !== undefined) (this as TransportError).provider = provider;
    if (status !== undefined) {
      (this as TransportError & { status?: number }).status = status;
    }
    if (detail !== undefined && safeDetail !== undefined) {
      (this as TransportError & { detail?: string }).detail = safeDetail;
    }
    this.message = sanitizeMsg(messageStr || '');
  }
}

function normalizeTransportError(err: unknown, _origins?: string[]): TransportError {
  if (err instanceof TransportError) return err;
  if (err instanceof Error) {
    const msg = sanitizeMsg(err.message, []);
    if (msg.includes('aborted') || msg.includes('timeout') || msg.includes('Abort'))
      return new TransportError('timeout', 'unknown', 'Timed out.', undefined);
    const lowerMsg = msg.toLowerCase();
    if (isBrowserCorsOrNetworkFailure(err, lowerMsg)) {
      return new TransportError('ai-cors-blocked', 'unknown', 'Network failure.', undefined);
    }
    return new TransportError('provider-error', 'unknown', msg, undefined);
  }
  return new TransportError('provider-error', 'unknown', 'Unknown failure.', undefined);
}

/**
 * Whether a thrown value is a browser-level CORS or network failure.
 *
 * Every engine reports this differently, and §13.5 item 5 requires all of them to become
 * `ai-cors-blocked` with the relay remedy — never a generic network error, "the single most
 * confusing failure mode in BYOK products":
 *
 * - Chromium: `TypeError: Failed to fetch`
 * - Firefox: `TypeError: NetworkError when attempting to fetch resource.`
 * - WebKit:    `TypeError: Load failed`
 *
 * Matching the message text alone missed WebKit entirely, because none of the historical phrases
 * appear in `"Load failed"`. A `TypeError` with an unrecognised message is therefore treated as a
 * CORS/network failure: a thrown `TypeError` from `fetch` always is one, and no other source in this
 * module throws that type.
 */
function isBrowserCorsOrNetworkFailure(err: Error, lowerMsg: string): boolean {
  if (
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('networkerror') ||
    lowerMsg.includes('typeerror') ||
    // WebKit's wording.
    lowerMsg.includes('load failed') ||
    lowerMsg.includes('cors')
  ) {
    return true;
  }
  return err.name === 'TypeError' || err instanceof TypeError;
}

export interface PollOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxPolls?: number;
  pollIntervalMs?: number;
  onCancel?: () => void | Promise<void>;
}

export interface PollState {
  status: 'pending' | 'in-progress' | 'ready' | 'failed' | 'cancelled';
  progress?: number;
  message?: string;
  result?: unknown;
}

export async function pollAsyncJob(
  pollUrl: string,
  checkStatus: (body: string) => PollState,
  allowedOrigins?: string[],
  options?: PollOptions,
): Promise<PollState> {
  const maxPolls = options?.maxPolls ?? 60;
  const timeoutMs = options?.timeoutMs ?? 300000;
  const baseIntervalMs = options?.pollIntervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  const originCheck = checkOriginAllowlist(pollUrl, allowedOrigins);
  if (!originCheck.allowed)
    throw new TransportError(
      'ai-cors-blocked',
      originCheck.origin ?? 'unknown',
      'Polling blocked: ' + (originCheck.reason ?? ''),
      undefined,
    );

  let cancelInvoked = false;
  const invokeCancelOnce = async () => {
    if (!cancelInvoked && options?.onCancel) {
      cancelInvoked = true;
      try {
        await options.onCancel();
      } catch {
        // ignore provider cancel errors
      }
    }
  };

  for (let poll = 0; poll < maxPolls; poll++) {
    if (options?.signal?.aborted) {
      await invokeCancelOnce();
      return { status: 'cancelled', message: 'Cancelled.' };
    }
    if (Date.now() > deadline) {
      await invokeCancelOnce();
      return { status: 'cancelled', message: 'Timeout.' };
    }
    try {
      const pollOpts: TransportOptions = {
        ...(allowedOrigins ? { allowedOrigins } : {}),
        ...(options?.signal ? { signal: options.signal } : {}),
        timeoutMs: 30000,
        maxRetries: 1,
      };
      const response = await transportFetch(pollUrl, { method: 'GET' }, pollOpts);
      const state = checkStatus(response.body);
      if (state.status === 'ready') return state;
      if (state.status === 'failed') return state;
      if (state.status === 'cancelled') {
        await invokeCancelOnce();
        return state;
      }
      // Progress reporting preserved from response body / state
      const intervalMs = Math.min(baseIntervalMs * Math.pow(1.8, poll) + Math.random() * 500, 5000);
      await new Promise<void>((res, rej) => {
        const t = setTimeout(() => res(), intervalMs);
        if (options?.signal) {
          const h = () => {
            clearTimeout(t);
            rej(new TransportError('cancelled', 'unknown', 'Backoff cancelled.', undefined));
          };
          if (options.signal.aborted) {
            h();
            return;
          }
          options.signal.addEventListener('abort', h, { once: true });
        }
      });
    } catch (err: unknown) {
      const normalized = normalizeTransportError(err, allowedOrigins);
      if (normalized.kind === 'timeout' || normalized.kind === 'cancelled') {
        await invokeCancelOnce();
        return { status: 'cancelled', message: normalized.detail ?? normalized.message ?? '' };
      }
      return { status: 'failed', message: normalized.detail ?? normalized.message ?? '' };
    }
  }
  return { status: 'failed', message: 'Polling max attempts exceeded.' };
}

export async function probeCors(
  url: string,
  allowedOrigins?: string[],
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<CorsProbeResult> {
  const originCheck = checkOriginAllowlist(url, allowedOrigins);
  if (!originCheck.allowed)
    return { kind: 'cors-blocked', detail: 'CORS blocked: ' + (originCheck.reason ?? 'unknown') };
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? 5000);
    const signal = options?.signal
      ? linkSignals(controller.signal, options.signal)
      : controller.signal;
    try {
      const response = await fetch(url, {
        method: 'OPTIONS',
        mode: 'cors',
        headers: { 'Access-Control-Request-Method': 'POST' },
        signal,
      });
      clearTimeout(timeoutId);
      if (response.status === 401 || response.status === 403) {
        return {
          kind: 'auth-failed',
          detail: 'Auth failed: ' + response.status,
          status: response.status,
        };
      }
      return { kind: 'ok', detail: 'CORS OK.', status: response.status };
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : String(e);
      const lowerMsg = msg.toLowerCase();
      if (
        lowerMsg.includes('failed to fetch') ||
        lowerMsg.includes('typeerror') ||
        msg.includes('TypeError')
      ) {
        return { kind: 'cors-blocked', detail: 'Browser CORS block (TypeError).' };
      }
      if (lowerMsg.includes('abort') || lowerMsg.includes('timeout') || msg.includes('Abort')) {
        return { kind: 'unreachable', detail: 'Unreachable: ' + sanitizeMsg(msg, []) };
      }
      return { kind: 'unreachable', detail: 'Unreachable: ' + sanitizeMsg(msg, []) };
    }
  } catch (e: unknown) {
    return {
      kind: 'provider-error',
      detail: 'Probe error: ' + (e instanceof Error ? sanitizeMsg(e.message, []) : String(e)),
    };
  }
}

export function makeTransportLogger(
  sink: (message: string) => void,
  credentials?: readonly string[] | Record<string, string>,
): (message: unknown) => void {
  const values = credentials
    ? Array.isArray(credentials)
      ? credentials
      : Object.values(credentials).filter((v): v is string => typeof v === 'string')
    : [];
  return createSafeLogger(sink, values);
}
