/**
 * P5-13 — relay policy, extracted so it can be unit tested without a Worker runtime.
 *
 * Everything here is pure: no I/O, no logging, no globals. `src/index.ts` composes it into a
 * Worker. Keep the two together when changing either — README §15.3.
 */

/** The single origin allowed when the deployer sets no `ALLOWED_ORIGINS`. */
export const FALLBACK_ORIGIN = 'https://image.complianttools.com';

/**
 * Split and normalise the deployer's `ALLOWED_ORIGINS`.
 *
 * Entries are lower-cased origins and are compared for *exact* string equality: no wildcards, no
 * suffix matching, no port folding. A trailing slash is dropped so `https://example.com/` and
 * `https://example.com` behave the same; anything else (a path, a query, a wildcard, a bare `*`) is
 * discarded rather than honoured, because an entry we cannot interpret exactly must not widen
 * access.
 *
 * **Unset is not the same as empty.** An unset binding means "deployer did not choose", so the app's
 * own origin is the default. A binding that is set but yields no usable origin means the deployer
 * misconfigured it, and returning an empty list makes every request fail closed rather than
 * quietly serving an origin nobody chose.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (raw === undefined) return [FALLBACK_ORIGIN];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '' || trimmed === '*') continue;
    const normalized = normalizeOrigin(trimmed);
    if (normalized !== undefined) seen.add(normalized);
  }
  return [...seen];
}

/** Normalise one origin to its canonical `URL.origin`, or `undefined` when it is not a bare origin. */
function normalizeOrigin(value: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
  // `URL.origin` is exactly scheme + host + non-default port. A path, query, or fragment in the
  // configured entry means the deployer wrote something we will not silently reinterpret.
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return undefined;
  return parsed.origin.toLowerCase();
}

/**
 * Canonicalise the caller's `Origin` header for comparison against the allowlist.
 *
 * The allowlist is normalised, so the request side must be too — otherwise the comparison is
 * asymmetric and an equivalent origin written differently is refused. `URL` folds exactly the three
 * spellings that mean the same endpoint: a lower-cased host, a dropped trailing slash, and an
 * elided default `:443`.
 *
 * This cannot widen access. Two origins that canonicalise equal are the same origin by the
 * definition in RFC 6454 (same scheme, host, and port), so there is no spelling of an attacker's
 * origin that normalises into someone else's. Anything that is not a bare http(s) origin —
 * `Origin: null`, a relative value, a bare host, a `javascript:` origin — normalises to
 * `undefined` and is refused.
 */
export function normalizeRequestOrigin(value: string | null): string | undefined {
  return value === null ? undefined : normalizeOrigin(value);
}

/** CORS response headers. Mirrors the caller's requested headers so an adapter's own headers pass. */
export function buildCorsHeaders(
  origin: string,
  requestHeaders: string | null,
): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':
      requestHeaders !== null && requestHeaders.trim() !== ''
        ? requestHeaders
        : 'authorization,content-type,x-api-key,x-key,x-goog-api-key,anthropic-version,anthropic-dangerous-direct-browser-access,prefer,accept',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers':
      'retry-after,x-remaining-credits,x-credits-charged,x-rate-limit-limit,x-rate-limit-remaining,x-rate-limit-reset,x-rate-limit-reset-after,x-rate-limit-policy,content-type',
    Vary: 'Origin',
  };
}

/** Headers that must never reach a provider: relay-specific, hop-by-hop, or client-identifying. */
const STRIPPED_REQUEST_HEADERS: readonly string[] = [
  'host',
  // Hop-by-hop (RFC 9110 §7.6.1). These describe *this* connection, not the message, so replaying
  // them upstream is meaningless at best and a request-smuggling vector at worst.
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'origin',
  'referer',
  // Relay-specific — forwarding this would leak the relay's shared secret to every provider.
  'x-relay-token',
  // The caller's cookies are none of the provider's business, and no adapter sends one. Forwarding
  // them would hand the user's first-party site cookies to a third party on every request.
  'cookie',
  // Client identity — forwarding these hands the user's IP to the provider as an extra signal and
  // is needless: the provider already sees the relay's egress address.
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'true-client-ip',
  'x-real-ip',
  // RFC 7239 `Forwarded` is the standardised form of the `X-Forwarded-*` family below and carries
  // the same client identity, so it is stripped for the same reason.
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
];

/**
 * Copy the caller's headers, minus everything in {@link STRIPPED_REQUEST_HEADERS}.
 *
 * What survives is the provider's own contract: the API key header, content type, `Prefer`, and
 * anything else the adapter set. The relay holds none of it — it is copied and discarded.
 */
export function buildUpstreamHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  for (const [name, value] of incoming) {
    if (!STRIPPED_REQUEST_HEADERS.includes(name.toLowerCase())) headers.set(name, value);
  }
  return headers;
}

export type ResolveResult = { ok: true; url: URL } | { ok: false; status: number; message: string };

/**
 * Validate a `url=` parameter against the compiled-in destination allowlist.
 *
 * Order matters and is deliberate: parse, then scheme, then credentials, then port, then host. Each
 * rejection message names the specific rule so a misconfigured caller can tell them apart without
 * the relay ever echoing a usable target back.
 */
export function resolveTarget(raw: string, allowed: readonly string[]): ResolveResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, status: 400, message: 'Malformed url.' };
  }

  if (url.protocol !== 'https:') return { ok: false, status: 400, message: 'HTTPS only.' };
  if (url.username !== '' || url.password !== '') {
    return { ok: false, status: 400, message: 'Credentials in url are not allowed.' };
  }
  // A non-default port is a different service than the one we allowlisted. `:443` is the default
  // for https and is the same endpoint, so it is not a bypass; anything else is refused.
  if (url.port !== '' && url.port !== '443') {
    return { ok: false, status: 400, message: 'Unexpected port.' };
  }
  if (!allowed.includes(url.hostname)) {
    return { ok: false, status: 403, message: 'Destination not allowed.' };
  }
  return { ok: true, url };
}
