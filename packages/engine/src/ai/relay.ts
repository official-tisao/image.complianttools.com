/**
 * P5-13 — Relay routing. README §15.4, PLAN.md P5-13.
 *
 * Decides *how* a provider request reaches the provider — directly, or through the user's own
 * relay — and returns the URL and headers the transport should actually use. It performs no I/O and
 * holds nothing: the relay URL and token are passed in per call and are not retained.
 *
 * Two rules this module exists to guarantee:
 *
 * 1. **No silent fallback.** A request goes where the user said it goes. If a relay is configured
 *    and is unusable, that is an error — never a quiet downgrade to a direct request, which would
 *    both hide the failure and take the user's request somewhere they did not choose. The reverse
 *    holds too: a direct request never picks up a relay on its own.
 * 2. **Both legs are validated locally.** The relay URL is checked before it is used, and the
 *    provider URL is checked on the *direct* leg too, so a misconfigured endpoint is caught before
 *    any bytes move rather than by a CORS failure after the fact.
 */

/** A user's relay configuration. Held in memory for the call; never persisted by this module. */
export interface RelayConfig {
  /** The relay's own URL, e.g. `https://ctimg-relay.<subdomain>.workers.dev`. */
  readonly relayUrl: string;
  /** Optional shared secret, sent as `X-Relay-Token` to the relay only. */
  readonly token?: string;
}

/** Which path a request took. Surfaced to the user so there is never ambiguity. */
export type ConnectionPath = 'direct' | 'relay';

/** A fully resolved request: where to send it, with what, and how the user should be told. */
export interface ResolvedRequest {
  /** The URL the browser actually calls — the relay when routing via relay. */
  readonly url: string;
  /** Headers to send. The token appears here only when routing via relay. */
  readonly headers: Record<string, string>;
  readonly path: ConnectionPath;
  /** The provider URL, for display and for the origin check. */
  readonly providerUrl: string;
  /** Host shown to the user: the relay's host when relaying, the provider's when direct. */
  readonly origin: string;
}

/** Raised when a relay or provider destination is unusable. Never downgraded to a direct request. */
export class RelayRoutingError extends Error {
  readonly kind: 'relay-invalid' | 'provider-invalid';
  constructor(kind: 'relay-invalid' | 'provider-invalid', message: string) {
    super(message);
    this.name = 'RelayRoutingError';
    this.kind = kind;
  }
}

/**
 * Validate a relay URL and return its canonical form.
 *
 * HTTPS only, no embedded credentials, no query or fragment. An HTTP relay would send the provider
 * key and the user's images in plaintext, which is the one thing the relay must never make possible.
 */
export function validateRelayUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new RelayRoutingError('relay-invalid', 'That relay URL is not a valid URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new RelayRoutingError(
      'relay-invalid',
      'A relay URL must use https. An http:// relay would send your provider key and images in plaintext.',
    );
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new RelayRoutingError(
      'relay-invalid',
      'A relay URL must not contain a username or password.',
    );
  }
  return parsed;
}

/** Validate a provider URL on the direct leg. Mirrors the relay's own rules, minus the port check. */
export function validateProviderUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new RelayRoutingError('provider-invalid', 'That provider URL is not a valid URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new RelayRoutingError('provider-invalid', 'Provider requests must use https.');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new RelayRoutingError(
      'provider-invalid',
      'A provider URL must not contain a username or password.',
    );
  }
  return parsed;
}

/**
 * Build the relay request URL: `{relayUrl}?url={encodeURIComponent(providerUrl)}` (README §15.4).
 *
 * Any query the relay URL already carries is preserved, so a relay served from
 * `https://site.example/relay?tenant=a` keeps its own parameters and the target is appended.
 */
export function buildRelayRequestUrl(relayUrl: URL, providerUrl: string): string {
  const params = relayUrl.searchParams;
  params.set('url', providerUrl);
  return `${relayUrl.origin}${relayUrl.pathname}?${params.toString()}`;
}

/**
 * Resolve how a provider request should be sent.
 *
 * `config` is `undefined` (or carries no usable relay URL) for a direct connection. Anything else
 * routes through the relay.
 *
 * A relay URL that is present but unusable — malformed, not HTTPS, carrying credentials — raises
 * rather than degrading to a direct request. That is the whole point: a user who chose "via my
 * relay" and mistyped the URL must be told, not silently sent direct, because a silent downgrade
 * both hides the misconfiguration and moves their request somewhere they did not choose.
 */
export function resolveRequest(providerUrl: string, config?: RelayConfig): ResolvedRequest {
  const provider = validateProviderUrl(providerUrl);

  if (config === undefined || config.relayUrl.trim() === '') {
    return {
      url: provider.toString(),
      headers: {},
      path: 'direct',
      providerUrl: provider.toString(),
      origin: provider.origin,
    };
  }

  // Both URLs are validated before anything is issued, on both legs.
  const relay = validateRelayUrl(config.relayUrl);
  const headers: Record<string, string> = {};
  // The token is attached here, and only here: a direct request can never carry it, and the relay
  // strips it before forwarding (README §15.3).
  if (config.token !== undefined && config.token !== '') headers['X-Relay-Token'] = config.token;

  return {
    url: buildRelayRequestUrl(relay, provider.toString()),
    headers,
    path: 'relay',
    providerUrl: provider.toString(),
    origin: relay.origin,
  };
}

/** Human-readable description of the path a request took, for the UI (README §15.4). */
export function describePath(request: ResolvedRequest, providerLabel?: string): string {
  const provider = providerLabel ?? safeHost(request.providerUrl);
  return request.path === 'direct'
    ? `Direct — this request went straight to ${provider}.`
    : `Via your relay — this request went to ${safeHost(request.url)}, which forwarded it to ${provider}.`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Whether the document's CSP is known to permit `origin`.
 *
 * A prerendered static page cannot widen its own CSP at runtime, so this is a *report*, not a fix —
 * it is what lets the UI tell the user their relay will be blocked instead of letting them discover
 * it as an opaque network error. See README §16.4 and the P5-13 blocker note.
 */
export function isOriginAllowedByCsp(origin: string, connectSrc: readonly string[]): boolean {
  return connectSrc.some((source) => {
    const value = source.trim();
    if (value === '' || value.endsWith(':')) {
      // A bare scheme source (`https:`) matches every origin of that scheme.
      const scheme = value.slice(0, -1);
      return value !== '' && new URL(origin).protocol === `${scheme}:`;
    }
    if (value === "'self'") return false; // Same-origin is about the page, not an arbitrary host.
    try {
      return new URL(value).origin === origin;
    } catch {
      return false;
    }
  });
}
