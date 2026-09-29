/**
 * P5-13 — Deno Deploy template (README §15.3).
 *
 * Deploy with:  deployctl deploy --project=my-relay apps/relay/templates/deno.ts
 *
 * Configuration is environment variables, not a config file:
 *     ALLOWED_ORIGINS   comma-separated exact origins; unset falls back to the app's own origin
 *     RELAY_TOKEN       optional shared secret presented as X-Relay-Token
 *
 * The policy is imported from the same `src/policy.ts` the Cloudflare Worker uses, so this template
 * cannot drift from the audited implementation. Deno resolves the relative import to the checked-out
 * file — deploy the whole `apps/relay` directory, not just this file.
 *
 * Deno Deploy is a server platform: it terminates TLS and handles your traffic, and its runtime is
 * outside our control. See README.md "What the relay can and cannot see".
 */
import { ALLOWED_DESTINATIONS, DEFAULT_ALLOWED_ORIGIN } from '../src/index.ts';
import {
  buildCorsHeaders,
  buildUpstreamHeaders,
  normalizeRequestOrigin,
  parseAllowedOrigins,
  resolveTarget,
} from '../src/policy.ts';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'OPTIONS']);

Deno.serve(async (request: Request): Promise<Response> => {
  const method = request.method.toUpperCase();
  const allowedOrigins = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));

  // Fail closed: a missing Origin is a missing allowlist entry, not a same-origin call. The
  // incoming value is canonicalised so an equivalent spelling of an allowed origin is not refused
  // by accident.
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

  // Preflight answers before the token check: it carries no custom headers, so demanding
  // X-Relay-Token here would make the real request unreachable in a browser.
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const expectedToken = Deno.env.get('RELAY_TOKEN');
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
  if (!resolved.ok)
    return new Response(resolved.message, { status: resolved.status, headers: cors });

  let upstream: Response;
  try {
    upstream = await fetch(resolved.url.toString(), {
      method,
      headers: buildUpstreamHeaders(request.headers),
      body: method === 'GET' ? null : request.body,
      // Manual: the allowlist must govern where the request *ends up*, not only where it started.
      redirect: 'manual',
    });
  } catch {
    // Deliberately opaque: the cause is neither logged nor echoed.
    return new Response('Upstream request failed.', { status: 502, headers: cors });
  }

  const headers = new Headers(upstream.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  headers.delete('Set-Cookie');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
});

export { DEFAULT_ALLOWED_ORIGIN };
