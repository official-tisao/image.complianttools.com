/**
 * P5-13 — relay security tests (README §15.3).
 *
 * Every test here corresponds to a stated design constraint. They are deliberately black-box: they
 * call the exported `fetch` handler with a real `Request` and inspect the real `Response`, with
 * `env.fetchImpl` standing in for the provider so no test reaches the network.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import relay, { ALLOWED_DESTINATIONS, DEFAULT_ALLOWED_ORIGIN, type Env } from '../dist/index.js';
import {
  FALLBACK_ORIGIN,
  buildCorsHeaders,
  buildUpstreamHeaders,
  normalizeRequestOrigin,
  parseAllowedOrigins,
  resolveTarget,
} from '../dist/policy.js';

const APP_ORIGIN = 'https://image.complianttools.com';
const RELAY_URL = 'https://relay.example.workers.dev';

/** An upstream that records what it was called with and replies with a canned response. */
interface UpstreamCall {
  url: string;
  init: RequestInit | undefined;
}

function stubUpstream(
  response: () => Response,
  calls: UpstreamCall[] = [],
): { fetchImpl: typeof fetch; calls: UpstreamCall[] } {
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(response());
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const okUpstream = () =>
  new Response('{"ok":true}', {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-remaining-credits': '42' },
  });

function relayRequest(
  init: { method?: string; origin?: string | null; url?: string; headers?: Record<string, string> } = {},
): Request {
  const headers = new Headers(init.headers);
  if (init.origin !== null) headers.set('Origin', init.origin ?? APP_ORIGIN);
  return new Request(init.url ?? `${RELAY_URL}/?url=https%3A%2F%2Fapi.anthropic.com%2Fv1%2Fmessages`, {
    method: init.method ?? 'POST',
    headers,
    body: init.method === 'GET' || init.method === 'OPTIONS' ? undefined : '{"model":"test"}',
  });
}

const env = (over: Env = {}, upstream: typeof fetch = okUpstream as unknown as typeof fetch): Env => ({
  fetchImpl: upstream,
  ...over,
});

// ---------------------------------------------------------------------------------------------
// Origin allowlist — fail closed
// ---------------------------------------------------------------------------------------------

test('missing Origin is refused: the relay fails closed', async () => {
  const response = await relay.fetch(relayRequest({ origin: null }), env());
  assert.equal(response.status, 403);
  // A refused origin gets no CORS headers: there is no authorised origin to grant them to.
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('empty Origin is refused', async () => {
  const response = await relay.fetch(relayRequest({ origin: '' }), env());
  assert.equal(response.status, 403);
});

test('a malformed Origin is refused', async () => {
  for (const origin of ['not-a-url', 'https://image.complianttools.com.evil.test', 'null']) {
    const response = await relay.fetch(relayRequest({ origin }), env());
    assert.equal(response.status, 403, `expected ${origin} to be refused`);
  }
});

test('a disallowed Origin is refused even with a valid token', async () => {
  const response = await relay.fetch(
    relayRequest({ origin: 'https://evil.test', headers: { 'X-Relay-Token': 'secret' } }),
    env({ RELAY_TOKEN: 'secret' }),
  );
  assert.equal(response.status, 403);
});

test('an allowed Origin is accepted', async () => {
  const { fetchImpl } = stubUpstream(okUpstream);
  const response = await relay.fetch(relayRequest({ origin: APP_ORIGIN }), env({}, fetchImpl));
  assert.equal(response.status, 200);
});

test('ALLOWED_ORIGINS is configurable and replaces the default', async () => {
  const { fetchImpl } = stubUpstream(okUpstream);
  const custom = env({ ALLOWED_ORIGINS: 'https://mysite.example' }, fetchImpl);

  const allowed = await relay.fetch(relayRequest({ origin: 'https://mysite.example' }), custom);
  assert.equal(allowed.status, 200);

  // The default origin is no longer allowed once the deployer configures their own list.
  const fallback = await relay.fetch(relayRequest({ origin: APP_ORIGIN }), custom);
  assert.equal(fallback.status, 403);
});

test('an empty or wildcard-only ALLOWED_ORIGINS allows nobody, not everybody', async () => {
  for (const raw of ['', '   ', '*', ',,']) {
    const response = await relay.fetch(relayRequest(), env({ ALLOWED_ORIGINS: raw }));
    assert.equal(response.status, 403, `ALLOWED_ORIGINS=${JSON.stringify(raw)} must fail closed`);
  }
});

test('parseAllowedOrigins normalises but never widens', () => {
  assert.deepEqual(parseAllowedOrigins(undefined), [FALLBACK_ORIGIN]);
  // A trailing slash is cosmetic and folded away.
  assert.deepEqual(parseAllowedOrigins('https://a.test, https://b.test/'), [
    'https://a.test',
    'https://b.test',
  ]);
  // Anything that is not a bare origin is discarded rather than reinterpreted — including a good
  // entry sharing the list with a malformed one, because a list we cannot fully interpret must not
  // be partially honoured.
  assert.deepEqual(parseAllowedOrigins('https://a.test/connect,*,https://b.test?x=1'), []);
  assert.deepEqual(parseAllowedOrigins('https://a.test,,not a url,https://b.test'), [
    'https://a.test',
    'https://b.test',
  ]);
  assert.equal(DEFAULT_ALLOWED_ORIGIN, FALLBACK_ORIGIN);
});

test('normalizeRequestOrigin canonicalises equivalences and refuses everything else', () => {
  // The three spellings `URL` folds to the same origin.
  for (const spelling of ['https://a.test', 'https://A.TEST', 'https://a.test/', 'https://a.test:443']) {
    assert.equal(normalizeRequestOrigin(spelling), 'https://a.test', spelling);
  }

  // Everything that is not a bare http(s) origin is refused outright — including `null`, which is
  // what a sandboxed iframe and a `data:` document both send.
  for (const bad of [
    null,
    '',
    'null',
    'a.test', // bare host, no scheme
    'not-a-url',
    'https://a.test/path', // a path is not an origin
    'https://a.test?x=1',
    'https://a.test#f',
    'javascript:alert(1)',
    'file://',
  ]) {
    assert.equal(normalizeRequestOrigin(bad), undefined, `expected ${bad} to be refused`);
  }
});

test('an origin differing only by scheme, port, case, or subdomain is refused', async () => {
  const { fetchImpl } = stubUpstream(okUpstream);
  const configured = env({ ALLOWED_ORIGINS: 'https://app.example' }, fetchImpl);

  // Each of these is a *different* origin, so none may use the relay even though each looks like
  // the allowed one to a human reading quickly.
  const refused = [
    'http://app.example', // scheme downgrade
    'https://app.example:8443', // non-default port
    'https://sub.app.example', // subdomain
    'https://app.example.evil.test', // suffix
    'https://evilapp.example', // prefix
    'https://app.example.evil.test:443',
  ];

  for (const origin of refused) {
    const response = await relay.fetch(relayRequest({ origin }), configured);
    assert.equal(response.status, 403, `${origin} must be refused`);
  }

  // These three are the *same* origin, because `URL` normalises exactly these three ways: the host
  // is lower-cased, a trailing slash is dropped, and the default :443 is elided. They are the same
  // endpoint on the same scheme, so refusing them would be a false positive. Asserted explicitly so
  // a future "harden the origin check" change does not silently lock a user out of their own relay.
  for (const origin of ['https://APP.EXAMPLE', 'https://app.example/', 'https://app.example:443']) {
    const response = await relay.fetch(relayRequest({ origin }), configured);
    assert.equal(response.status, 200, `${origin} is the same origin and must be allowed`);
  }
});

// ---------------------------------------------------------------------------------------------
// Preflight and methods
// ---------------------------------------------------------------------------------------------

test('OPTIONS preflight succeeds without the relay token', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  const response = await relay.fetch(
    relayRequest({
      method: 'OPTIONS',
      headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-api-key' },
    }),
    env({ RELAY_TOKEN: 'secret' }, fetchImpl),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), APP_ORIGIN);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET,POST,OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'x-api-key');
  assert.equal(response.headers.get('Access-Control-Max-Age'), '86400');
  // A preflight must never reach a provider.
  assert.equal(calls.length, 0);
});

test('only the methods the adapters use are permitted', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  // TRACE is excluded: `Request` refuses to construct it, and a browser cannot issue one anyway.
  for (const method of ['DELETE', 'PUT', 'PATCH']) {
    const response = await relay.fetch(relayRequest({ method }), env({}, fetchImpl));
    assert.equal(response.status, 405, `expected ${method} to be refused`);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), APP_ORIGIN);
  }
  assert.equal(calls.length, 0);
});

test('GET and POST are forwarded', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  assert.equal((await relay.fetch(relayRequest({ method: 'GET' }), env({}, fetchImpl))).status, 200);
  assert.equal((await relay.fetch(relayRequest({ method: 'POST' }), env({}, fetchImpl))).status, 200);
  assert.deepEqual(
    calls.map((c) => c.init?.method),
    ['GET', 'POST'],
  );
});

// ---------------------------------------------------------------------------------------------
// RELAY_TOKEN
// ---------------------------------------------------------------------------------------------

test('a missing token is rejected when RELAY_TOKEN is set', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  const response = await relay.fetch(relayRequest(), env({ RELAY_TOKEN: 'secret' }, fetchImpl));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), APP_ORIGIN);
  assert.equal(calls.length, 0);
});

test('a wrong token is rejected when RELAY_TOKEN is set', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  const response = await relay.fetch(
    relayRequest({ headers: { 'X-Relay-Token': 'guess' } }),
    env({ RELAY_TOKEN: 'secret' }, fetchImpl),
  );
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('the correct token is accepted', async () => {
  const { fetchImpl } = stubUpstream(okUpstream);
  const response = await relay.fetch(
    relayRequest({ headers: { 'X-Relay-Token': 'secret' } }),
    env({ RELAY_TOKEN: 'secret' }, fetchImpl),
  );
  assert.equal(response.status, 200);
});

test('with no RELAY_TOKEN configured the relay is open to allowlisted origins only', async () => {
  const { fetchImpl } = stubUpstream(okUpstream);
  assert.equal((await relay.fetch(relayRequest(), env({}, fetchImpl))).status, 200);
});

// ---------------------------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------------------------

const target = (raw: string) => `${RELAY_URL}/?url=${encodeURIComponent(raw)}`;

test('a missing url parameter is a 400', async () => {
  const response = await relay.fetch(relayRequest({ url: RELAY_URL }), env());
  assert.equal(response.status, 400);
  assert.match(await response.text(), /Missing url/);
});

test('a malformed url is a 400', async () => {
  for (const bad of ['http://', '://nope', '%%%', 'https://']) {
    const response = await relay.fetch(relayRequest({ url: target(bad) }), env());
    assert.equal(response.status, 400, `expected ${bad} to be a 400`);
  }
});

test('non-HTTPS targets are refused', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  for (const bad of [
    'http://api.anthropic.com/v1/messages',
    'ftp://api.anthropic.com/x',
    'data:text/plain,hi',
    'javascript:alert(1)',
    'file:///etc/passwd',
  ]) {
    const response = await relay.fetch(relayRequest({ url: target(bad) }), env({}, fetchImpl));
    assert.equal(response.status, 400, `expected ${bad} to be refused`);
    assert.match(await response.text(), /HTTPS only/);
  }
  assert.equal(calls.length, 0);
});

test('a host outside the allowlist is refused with 403', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  for (const bad of [
    'https://evil.test/v1',
    'https://api.anthropic.com.evil.test/v1/messages',
    'https://evil.test/api.anthropic.com',
  ]) {
    const response = await relay.fetch(relayRequest({ url: target(bad) }), env({}, fetchImpl));
    assert.equal(response.status, 403, `expected ${bad} to be refused`);
    // The message must not echo the rejected target back.
    assert.match(await response.text(), /Destination not allowed/);
  }
  assert.equal(calls.length, 0);
});

test('credentials embedded in the url are refused', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  for (const bad of [
    'https://user:pass@api.anthropic.com/v1/messages',
    'https://token@api.openai.com/v1/chat/completions',
  ]) {
    const response = await relay.fetch(relayRequest({ url: target(bad) }), env({}, fetchImpl));
    assert.equal(response.status, 400, `expected ${bad} to be refused`);
    assert.match(await response.text(), /Credentials/);
  }
  assert.equal(calls.length, 0);
});

test('an unexpected port is refused; the default 443 is not', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  const refused = await relay.fetch(
    relayRequest({ url: target('https://api.anthropic.com:8443/v1/messages') }),
    env({}, fetchImpl),
  );
  assert.equal(refused.status, 400);
  assert.match(await refused.text(), /Unexpected port/);

  const allowed = await relay.fetch(
    relayRequest({ url: target('https://api.anthropic.com:443/v1/messages') }),
    env({}, fetchImpl),
  );
  assert.equal(allowed.status, 200);
  assert.equal(calls.length, 1);
});

test('every allowlisted destination resolves, and nothing else does', () => {
  for (const host of ALLOWED_DESTINATIONS) {
    assert.equal(resolveTarget(`https://${host}/v1/x`, ALLOWED_DESTINATIONS).ok, true, host);
  }
  assert.equal(resolveTarget('https://sub.fal.run/x', ALLOWED_DESTINATIONS).ok, false);
  assert.equal(resolveTarget('https://FAL.RUN/x', ALLOWED_DESTINATIONS).ok, true, 'host is lower-cased by URL');
  assert.equal(resolveTarget('https://fal.run.evil.test/x', ALLOWED_DESTINATIONS).ok, false);
});

test('the allowlist matches README 15.3 exactly', () => {
  assert.deepEqual([...ALLOWED_DESTINATIONS].sort(), [
    'api.anthropic.com',
    'api.bfl.ai',
    'api.openai.com',
    'api.remove-bg.com',
    'api.remove.bg',
    'api.replicate.com',
    'api.stability.ai',
    'clipdrop-api.co',
    'fal.run',
    'generativelanguage.googleapis.com',
    'queue.fal.run',
  ]);
});

// ---------------------------------------------------------------------------------------------
// Header hygiene
// ---------------------------------------------------------------------------------------------

test('relay token and client-identity headers are never forwarded upstream', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  await relay.fetch(
    relayRequest({
      headers: {
        'X-Relay-Token': 'secret',
        'x-api-key': 'sk-ant-provider-key',
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
        'cf-connecting-ip': '203.0.113.7',
        'cf-ipcountry': 'GB',
        'cf-ray': 'abc123',
        'cf-visitor': '{"scheme":"https"}',
        'x-forwarded-for': '203.0.113.7',
        'x-real-ip': '203.0.113.7',
        'x-forwarded-proto': 'https',
        Referer: 'https://image.complianttools.com/ai/describe',
        Origin: APP_ORIGIN,
      },
    }),
    env({ RELAY_TOKEN: 'secret' }, fetchImpl),
  );

  const sent = calls[0].init?.headers as Headers;
  // The provider's own contract survives...
  assert.equal(sent.get('x-api-key'), 'sk-ant-provider-key');
  assert.equal(sent.get('content-type'), 'application/json');
  assert.equal(sent.get('prefer'), 'wait=60');
  // ...and nothing identifying the caller or the relay's secret does.
  for (const stripped of [
    'x-relay-token',
    'cf-connecting-ip',
    'cf-ipcountry',
    'cf-ray',
    'cf-visitor',
    'x-forwarded-for',
    'x-real-ip',
    'x-forwarded-proto',
    'referer',
    'origin',
    'host',
  ]) {
    assert.equal(sent.get(stripped), null, `${stripped} must not be forwarded`);
  }
});

test('buildUpstreamHeaders strips case-insensitively', () => {
  const sent = buildUpstreamHeaders(
    new Headers({ 'X-REAL-IP': '1.2.3.4', 'X-Relay-Token': 't', 'x-key': 'k' }),
  );
  assert.equal(sent.get('x-real-ip'), null);
  assert.equal(sent.get('x-relay-token'), null);
  assert.equal(sent.get('x-key'), 'k');
});

test('cookies and the RFC 7239 Forwarded header never reach the provider', async () => {
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  await relay.fetch(
    relayRequest({
      headers: {
        // The caller's first-party site cookies. No adapter sends one; a provider must never see
        // them, and forwarding them would hand cookies to a third party on every relayed request.
        Cookie: 'session=abc123; consent=1',
        // The standardised form of the X-Forwarded-* family, carrying the same client identity.
        Forwarded: 'for=203.0.113.7;proto=https;host=image.complianttools.com',
        'X-Forwarded-Host': 'image.complianttools.com',
        'Content-Type': 'application/json',
      },
    }),
    env({}, fetchImpl),
  );

  const sent = calls[0].init?.headers as Headers;
  for (const stripped of ['cookie', 'forwarded', 'x-forwarded-host']) {
    assert.equal(sent.get(stripped), null, `${stripped} must not be forwarded`);
  }
  assert.equal(sent.get('content-type'), 'application/json');
});

test('the request body reaches the provider byte-for-byte', async () => {
  // A JSON body with nested quotes, unicode, and a newline — anything a naive re-serialisation
  // would reformat. The relay must pass the bytes through, not parse and rebuild them.
  const body = '{"prompt":"a \\"quoted\\" line\\nwith — unicode","n":1.5,"data":[1,2,3]}';
  const { fetchImpl, calls } = stubUpstream(okUpstream);
  const request = relayRequest({ headers: { 'Content-Type': 'application/json' } });
  await relay.fetch(
    new Request(request.url, { method: 'POST', headers: request.headers, body }),
    env({}, fetchImpl),
  );

  const sentBody = calls[0].init?.body as ReadableStream | null;
  assert.ok(sentBody, 'a POST body must be forwarded');
  assert.equal(await new Response(sentBody).text(), body);
});

test('a streamed provider response is relayed without buffering', async () => {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  const { fetchImpl } = stubUpstream(
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('chunk-1;'));
            controller.enqueue(encoder.encode('chunk-2;'));
            controller.enqueue(encoder.encode('chunk-3;'));
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
  );
  const response = await relay.fetch(relayRequest(), env({}, fetchImpl));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  // The body is still a live stream handed back by reference, so a provider that streams reaches
  // the browser progressively instead of arriving all at once.
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  for (let i = 0; i < 3; i++) {
    const { value } = await reader.read();
    chunks.push(new TextDecoder().decode(value));
  }
  assert.deepEqual(chunks, ['chunk-1;', 'chunk-2;', 'chunk-3;']);
});

// ---------------------------------------------------------------------------------------------
// Upstream response handling
// ---------------------------------------------------------------------------------------------

test('the provider body, status, and ledger headers are forwarded', async () => {
  const upstream = () =>
    new Response('{"data":[]}', {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        'content-type': 'application/json',
        'retry-after': '30',
        'x-remaining-credits': '7',
        'x-credits-charged': '1',
        'x-rate-limit-limit': '100',
        'x-rate-limit-remaining': '99',
        'x-rate-limit-reset': '60',
        'x-original': 'kept',
      },
    });
  const { fetchImpl } = stubUpstream(upstream);
  const response = await relay.fetch(relayRequest(), env({}, fetchImpl));

  assert.equal(response.status, 429);
  assert.equal(await response.text(), '{"data":[]}');
  // Headers the adapters read must survive, and must be exposed to the browser to be readable at all.
  assert.equal(response.headers.get('retry-after'), '30');
  assert.equal(response.headers.get('x-remaining-credits'), '7');
  assert.equal(response.headers.get('x-credits-charged'), '1');
  assert.equal(response.headers.get('x-rate-limit-limit'), '100');
  const exposed = response.headers.get('Access-Control-Expose-Headers') ?? '';
  for (const header of ['retry-after', 'x-remaining-credits', 'x-credits-charged']) {
    assert.match(exposed, new RegExp(header, 'i'), `${header} must be exposed`);
  }
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), APP_ORIGIN);
});

test('an unlisted response header is passed through rather than dropped', async () => {
  const { fetchImpl } = stubUpstream(
    () => new Response('{}', { headers: { 'x-original': 'kept', 'x-request-id': 'abc' } }),
  );
  const response = await relay.fetch(relayRequest(), env({}, fetchImpl));
  assert.equal(response.headers.get('x-original'), 'kept');
  assert.equal(response.headers.get('x-request-id'), 'abc');
});

test('Set-Cookie is removed from the upstream response', async () => {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('Set-Cookie', 'session=abc; HttpOnly');
  headers.append('Set-Cookie', 'tracker=xyz');
  const { fetchImpl } = stubUpstream(() => new Response('{}', { headers }));
  const response = await relay.fetch(relayRequest(), env({}, fetchImpl));
  assert.equal(response.headers.get('set-cookie'), null);
});

test('an upstream redirect is returned, never followed', async () => {
  const { fetchImpl, calls } = stubUpstream(
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.test/steal' },
      }),
  );
  const response = await relay.fetch(relayRequest(), env({}, fetchImpl));

  assert.equal(response.status, 302);
  assert.equal(calls.length, 1, 'exactly one upstream call');
  assert.equal(calls[0].init?.redirect, 'manual', 'the relay must not auto-follow redirects');
  assert.equal(response.headers.get('location'), 'https://evil.test/steal');
});

test('a redirect cannot send the relay to a host outside the allowlist', async () => {
  // Every one of these is a redirect an allowlisted provider could return. The allowlist must
  // govern where the request *ends up*, not only where it started, so none may be fetched.
  const escapes = [
    'https://evil.test/steal',
    'https://api.anthropic.com.evil.test/v1/messages', // suffix trick on an allowlisted host
    'https://attackerapi.openai.com/v1', // prefix trick
    'http://api.openai.com/v1', // scheme downgrade
    'https://api.openai.com:8443/v1', // different service
    'https://user:pass@api.openai.com/v1', // credential smuggling
  ];
  for (const location of escapes) {
    const { fetchImpl, calls } = stubUpstream(
      () => new Response(null, { status: 302, headers: { Location: location } }),
    );
    const response = await relay.fetch(relayRequest(), env({}, fetchImpl));

    assert.equal(calls.length, 1, `${location} must not trigger a second fetch`);
    assert.equal(calls[0].init?.redirect, 'manual');
    assert.equal(response.status, 302);
  }
});

test('even a redirect to another allowlisted host is not followed', async () => {
  // Following within the allowlist would still be wrong: the second request would re-enter the
  // relay's own guard path with a method and body the adapter never asked for. No adapter reads a
  // `Location` or `Operation-Location` header, so nothing needs this. Refusing uniformly is the
  // simplest rule that cannot be wrong.
  const { fetchImpl, calls } = stubUpstream(
    () => new Response(null, { status: 307, headers: { Location: 'https://api.openai.com/v1/models' } }),
  );
  const response = await relay.fetch(relayRequest(), env({}, fetchImpl));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.redirect, 'manual');
  assert.equal(response.status, 307);
});

test('an upstream failure becomes an opaque 502 with CORS headers', async () => {
  const failing = (() => Promise.reject(new Error('ECONNREFUSED 10.0.0.1:443'))) as typeof fetch;
  const response = await relay.fetch(relayRequest(), env({}, failing));
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), APP_ORIGIN);
  // The failure detail must not leak upstream infrastructure into the browser.
  assert.doesNotMatch(await response.text(), /10\.0\.0\.1|ECONNREFUSED/);
});

// ---------------------------------------------------------------------------------------------
// Relay-generated errors carry CORS headers
// ---------------------------------------------------------------------------------------------

test('every relay-generated error carries CORS headers', async () => {
  const cases: Array<[string, Request, Env]> = [
    ['401', relayRequest(), env({ RELAY_TOKEN: 'secret' })],
    ['400 missing url', relayRequest({ url: RELAY_URL }), env()],
    ['400 malformed', relayRequest({ url: target('http://') }), env()],
    ['400 http', relayRequest({ url: target('http://api.anthropic.com') }), env()],
    ['403 destination', relayRequest({ url: target('https://evil.test') }), env()],
    ['405 method', relayRequest({ method: 'DELETE' }), env()],
  ];
  for (const [label, request, environment] of cases) {
    const response = await relay.fetch(request, environment);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), APP_ORIGIN, label);
    assert.equal(response.headers.get('Vary'), 'Origin', label);
  }
});

// ---------------------------------------------------------------------------------------------
// The CORS header contract, derived from the adapters that must work through it
// ---------------------------------------------------------------------------------------------

test('the default CORS allowlist covers every header the provider adapters actually send', () => {
  // These are the literal request headers the registered adapters set. If an adapter starts
  // sending a new one, this test fails and the allowlist is updated deliberately rather than
  // being discovered as an opaque browser failure at runtime. Sources:
  //   anthropic.ts  x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access
  //   clipdrop.ts   x-api-key
  //   removebg.ts   X-Api-Key            (same header, different casing)
  //   bfl.ts        x-key
  //   gemini.ts     x-goog-api-key       (documented in the descriptor; not yet sent)
  //   openai.ts / replicate.ts / stability.ts / fal.ts   Authorization
  //   replicate.ts  Prefer: wait=60
  //   all JSON/multipart adapters      Content-Type
  const adapterHeaders = [
    'authorization',
    'content-type',
    'x-api-key',
    'x-key',
    'x-goog-api-key',
    'anthropic-version',
    'anthropic-dangerous-direct-browser-access',
    'prefer',
    'accept',
  ];

  const allowed = (buildCorsHeaders(APP_ORIGIN, null)['Access-Control-Allow-Headers'] ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase());
  for (const header of adapterHeaders) {
    assert.ok(allowed.includes(header), `${header} must be in the default CORS allowlist`);
  }
});

test('the exposed response headers cover every header an adapter reads', () => {
  // `readLedgerHeaders` in packages/engine/src/ai/adapter-support.ts reads exactly these, plus
  // `Retry-After` which transport.ts and openai.ts both use. A response header the browser cannot
  // read is invisible to JS, so exposing it is what makes the ledger work at all.
  const exposed = (buildCorsHeaders(APP_ORIGIN, null)['Access-Control-Expose-Headers'] ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase());

  for (const header of [
    'retry-after',
    'x-credits-charged',
    'x-remaining-credits',
    'x-rate-limit-limit',
    'x-rate-limit-remaining',
    'x-rate-limit-reset',
    'x-rate-limit-reset-after',
    'x-rate-limit-policy',
  ]) {
    assert.ok(exposed.includes(header), `${header} must be exposed to the browser`);
  }
});

test('the allowed methods cover exactly what the adapters use', () => {
  // Adapters issue GET (model lists, account/balance checks, prediction polling) and POST
  // (create, cancel, edits). Nothing issues PUT, PATCH, or DELETE.
  const methods = (buildCorsHeaders(APP_ORIGIN, null)['Access-Control-Allow-Methods'] ?? '')
    .split(',')
    .map((m) => m.trim())
    .sort();

  assert.deepEqual(methods, ['GET', 'OPTIONS', 'POST']);
});

// ---------------------------------------------------------------------------------------------
// The relay holds nothing and logs nothing
// ---------------------------------------------------------------------------------------------

test('the relay writes nothing to the console', () => {
  for (const file of ['../src/index.ts', '../src/policy.ts']) {
    const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
    assert.doesNotMatch(source, /\bconsole\s*\./, `${file} must not log`);
  }
});

test('the configured token is never echoed in any relay-generated error', async () => {
  const TOKEN = 'super-secret-relay-token-value';
  const failing = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch;
  const environment = { ...env({ RELAY_TOKEN: TOKEN }, failing), RELAY_TOKEN: TOKEN };

  // Every branch that produces a response, including the ones reached *after* a correct token is
  // accepted, so a token that leaked would show up here rather than in a support ticket.
  const cases: Array<[string, Request, Env]> = [
    ['401 wrong token', relayRequest({ headers: { 'X-Relay-Token': 'wrong' } }), environment],
    ['400 missing url', relayRequest({ url: RELAY_URL, headers: { 'X-Relay-Token': TOKEN } }), environment],
    [
      '400 bad target',
      relayRequest({ url: target('http://api.anthropic.com'), headers: { 'X-Relay-Token': TOKEN } }),
      environment,
    ],
    [
      '403 bad destination',
      relayRequest({ url: target('https://evil.test'), headers: { 'X-Relay-Token': TOKEN } }),
      environment,
    ],
    ['405 bad method', relayRequest({ method: 'DELETE', headers: { 'X-Relay-Token': TOKEN } }), environment],
  ];

  for (const [label, request, env] of cases) {
    const response = await relay.fetch(request, env);
    const body = await response.text();
    assert.ok(!body.includes(TOKEN), `${label} leaked the token in the body`);
    for (const [, value] of response.headers) {
      assert.ok(!value.includes(TOKEN), `${label} leaked the token in a header`);
    }
  }

  // And the opaque upstream failure, which is the one place an implementation might be tempted to
  // echo the request for debuggability.
  const upstreamFailure = await relay.fetch(
    relayRequest({ headers: { 'X-Relay-Token': TOKEN } }),
    environment,
  );
  assert.equal(upstreamFailure.status, 502);
  assert.ok(!(await upstreamFailure.text()).includes(TOKEN));
});

test('the Worker has no storage bindings', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  // Comments are stripped first: the prose documents what the relay refuses to use, and `.put(` /
  // `caches` would otherwise match those sentences rather than code. `headers.delete(...)` is not
  // a persistence call, so only whole-word storage APIs are asserted here.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of [
    /\bcaches\b/,
    /\bindexedDB\b/,
    /\bdurableNamespaces\b/,
    /\bKVNamespace\b/,
    /\bD1Database\b/,
    /\bR2Bucket\b/,
    /\bsessionStorage\b/,
    /\blocalStorage\b/,
  ]) {
    assert.doesNotMatch(code, forbidden, `relay must not use ${forbidden}`);
  }
  // The Worker exposes only a fetch handler, so there is no cron, email, or queue entry point that
  // could touch data outside a request the caller already made.
  assert.deepEqual(Object.keys(relay), ['fetch'], 'the Worker exposes only a fetch handler');
});

test('the security-critical Worker source stays under 200 lines (README 15.3)', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  const lines = source.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('*'));
  assert.ok(lines.length <= 200, `worker entry is ${lines.length} code lines, budget is 200`);
});

// ---------------------------------------------------------------------------------------------
// Platform templates cannot drift from the audited Worker
// ---------------------------------------------------------------------------------------------

const TEMPLATES = ['../templates/deno.ts', '../templates/vercel-edge.ts', '../templates/netlify-edge.ts'];

test('every platform template enforces the same policy as the Worker', () => {
  for (const template of TEMPLATES) {
    const source = readFileSync(fileURLToPath(new URL(template, import.meta.url)), 'utf8');
    // They must import the audited policy module rather than re-implement any rule.
    assert.match(source, /from '\.\.\/src\/policy\.(ts|js)'/, `${template} must import src/policy`);
    // Each of these guards is a distinct README §15.3 constraint. If a template drops one it is
    // deployable and weaker than the Worker, which is the failure mode this test exists to catch.
    for (const [label, pattern] of [
      ['the compiled-in destination allowlist', /ALLOWED_DESTINATIONS/],
      ['the origin allowlist', /parseAllowedOrigins/],
      ['the shared-secret check', /X-Relay-Token/],
      ['the strict target validation', /resolveTarget/],
      ['the upstream header allowlist', /buildUpstreamHeaders/],
      ['the CORS response headers', /buildCorsHeaders/],
      ['manual redirect handling', /redirect: 'manual'/],
      ['Set-Cookie removal', /delete\('Set-Cookie'\)/],
      // The upstream failure must be swallowed and replaced with a 502, never rethrown or echoed.
      ['an opaque upstream failure', /catch \{[\s\S]{0,400}?new Response\('Upstream request failed\.'/],
    ] as const) {
      assert.match(source, pattern, `${template} must keep ${label}`);
    }
    // Preflight must answer *before* the token check, or the real request becomes unreachable in a
    // browser (a preflight carries no custom headers). Asserted by position in the *code*: every
    // template names X-Relay-Token in its header comment, which would otherwise satisfy a naive
    // indexOf check before the preflight line is even reached.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const optionsAt = code.indexOf("method === 'OPTIONS'");
    const tokenAt = code.indexOf("'X-Relay-Token'");
    assert.ok(optionsAt !== -1 && tokenAt !== -1, `${template} needs both the preflight and token checks`);
    assert.ok(optionsAt < tokenAt, `${template} must answer preflight before the token check`);
  }
});

test('templates do not log either', () => {
  for (const template of TEMPLATES) {
    const source = readFileSync(fileURLToPath(new URL(template, import.meta.url)), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bconsole\s*\./, `${template} must not log`);
  }
});
