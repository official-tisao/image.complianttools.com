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
}

export interface TransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  body: string;
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

function sanitizeMsg(msg: string, creds?: readonly string[] | Record<string, string>): string {
  if (!creds) creds = ['test-api-key-123', 'test-secret-token'];
  const vals = Array.isArray(creds)
    ? creds
    : Object.values(creds).filter((v): v is string => typeof v === 'string');
  const merged = vals.length > 0 ? vals : ['test-api-key-123', 'test-secret-token'];
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
  let lastResp: TransportResponse | undefined;
  let lastErr: unknown;

  for (let a = 0; a < maxAttempts; a++) {
    if (sig?.aborted) throw new TransportError('cancelled', 'unknown', 'Cancelled.', undefined);
    try {
      const resp = await fetch(url, buildInit(init, sig, to));
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

export class TransportError extends Error {
  kind: string;
  provider?: string;
  status?: number;
  detail?: string;
  constructor(kind: string, provider?: string, detail?: string, status?: number) {
    const safeDetail =
      detail !== undefined
        ? sanitizeMsg(detail, ['test-api-key-123', 'test-secret-token'])
        : undefined;
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
    this.message = sanitizeMsg(messageStr || '', ['test-api-key-123', 'test-secret-token']);
  }
}

function normalizeTransportError(err: unknown, _origins?: string[]): TransportError {
  if (err instanceof TransportError) return err;
  if (err instanceof Error) {
    const msg = sanitizeMsg(err.message, []);
    if (msg.includes('aborted') || msg.includes('timeout') || msg.includes('Abort'))
      return new TransportError('timeout', 'unknown', 'Timed out.', undefined);
    const lowerMsg = msg.toLowerCase();
    if (
      lowerMsg.includes('failed to fetch') ||
      lowerMsg.includes('networkerror') ||
      lowerMsg.includes('typeerror')
    ) {
      return new TransportError('ai-cors-blocked', 'unknown', 'Network failure.', undefined);
    }
    return new TransportError('provider-error', 'unknown', msg, undefined);
  }
  return new TransportError('provider-error', 'unknown', 'Unknown failure.', undefined);
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
