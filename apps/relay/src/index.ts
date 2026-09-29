/**
 * P5-13 — the Relay. README §15.3, PLAN.md P5-13.
 *
 * A single-purpose CORS pipe the *user* deploys to *their own* account. We host none and offer
 * none. It exists only to add CORS headers to a request the browser could otherwise not make, and
 * to hold nothing: no storage, no KV, no D1, no logs of bodies or headers.
 *
 * The trust-critical entry point is `src/index.ts` and must stay under 200 lines and readable in
 * one sitting (README §15.3). The policy it enforces lives in `src/policy.ts` so it can be unit
 * tested without a Worker runtime.
 *
 * Nothing here logs. There is no console call anywhere in this package by design — see the test
 * that asserts it.
 */

/** Bindings. `ALLOWED_ORIGINS` and `RELAY_TOKEN` are set by the deployer, never by the caller. */
export interface Env {
  /** Comma-separated exact origins allowed to use this relay. */
  ALLOWED_ORIGINS?: string;
  /** Optional shared secret. When set, callers must present it as `X-Relay-Token`. */
  RELAY_TOKEN?: string;
  /** Test seam: lets a test observe the outbound request without reaching the network. */
  fetchImpl?: typeof fetch;
}

/**
 * Exact destination hosts, compiled in at deploy time (README §15.3). HTTPS only; entries are
 * matched against `URL.hostname`, which is already lower-cased and excludes any port.
 *
 * This is an *exact* allowlist: a listed host does not grant its subdomains, and an unlisted
 * subdomain is not inferred. If you run a self-hosted OpenAI-compatible endpoint you control,
 * deploy your own relay with that host added — that is the whole point of the user-deployed model.
 */
export const ALLOWED_DESTINATIONS: readonly string[] = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.stability.ai',
  'api.bfl.ai',
  'fal.run',
  'queue.fal.run',
  'api.replicate.com',
  'api.remove-bg.com',
  'api.remove.bg',
  'clipdrop-api.co',
];

/** The app's own origin, used when the deployer sets no `ALLOWED_ORIGINS`. */
export const DEFAULT_ALLOWED_ORIGIN = 'https://image.complianttools.com';

/** Only the methods the provider adapters in `packages/engine/src/ai/adapters` actually use. */
const ALLOWED_METHODS = new Set(['GET', 'POST', 'OPTIONS']);

import {
  buildCorsHeaders,
  buildUpstreamHeaders,
  normalizeRequestOrigin,
  parseAllowedOrigins,
  resolveTarget,
} from './policy.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const method = request.method.toUpperCase();
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

    // Fail closed. A missing Origin is not a same-origin call — it is a missing allowlist entry,
    // and browsers always send one on a cross-origin request, so this rejects curl/scripts, not
    // the app. The incoming value is canonicalised so an equivalent spelling of an allowed origin
    // (lower-cased host, trailing slash, explicit :443) is not refused by accident.
    const origin = normalizeRequestOrigin(request.headers.get('Origin'));
    if (origin === undefined || allowedOrigins.length === 0 || !allowedOrigins.includes(origin)) {
      return new Response('Forbidden origin.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const cors = buildCorsHeaders(origin, request.headers.get('Access-Control-Request-Headers'));

    if (!ALLOWED_METHODS.has(method)) {
      return new Response('Method not allowed.', { status: 405, headers: cors });
    }

    // Preflight answers before the token check: a preflight carries no custom headers, so demanding
    // `X-Relay-Token` here would make the real request unreachable in a browser.
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Defence against someone who finds the relay URL (README §15.3).
    const expectedToken = env.RELAY_TOKEN;
    if (expectedToken !== undefined && expectedToken !== '') {
      if (request.headers.get('X-Relay-Token') !== expectedToken) {
        return new Response('Unauthorized relay.', { status: 401, headers: cors });
      }
    }

    const target = new URL(request.url).searchParams.get('url');
    if (target === null || target === '') {
      return new Response('Missing url.', { status: 400, headers: cors });
    }

    const resolved = resolveTarget(target, ALLOWED_DESTINATIONS);
    if (!resolved.ok) {
      return new Response(resolved.message, { status: resolved.status, headers: cors });
    }

    const doFetch = env.fetchImpl ?? fetch;
    let upstream: Response;
    try {
      upstream = await doFetch(resolved.url.toString(), {
        method,
        headers: buildUpstreamHeaders(request.headers),
        body: method === 'GET' ? null : request.body,
        // Manual redirect handling: the allowlist applies to where the request *ends up*, not just
        // where it started. `follow` would let an allowlisted host 302 us anywhere.
        redirect: 'manual',
      });
    } catch {
      // Deliberately opaque. The cause is not logged and not echoed; a provider that is down and a
      // network that is unreachable are indistinguishable to the caller, and that is fine.
      return new Response('Upstream request failed.', { status: 502, headers: cors });
    }

    // A redirect we did not choose to follow is returned as-is; the browser would still be blocked
    // by CORS on the new location, and following it ourselves would defeat the allowlist.
    const headers = new Headers(upstream.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    headers.delete('Set-Cookie');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
