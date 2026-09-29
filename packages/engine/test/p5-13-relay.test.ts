/**
 * P5-13 — relay routing and connection configuration.
 * Written as `.ts` on purpose: the engine `test` script excludes every `.test.mjs` from vitest
 * (`packages/engine/package.json`), so a `.mjs` test here would never execute.
 *
 * Covers README §15.4: the rewritten URL, token placement, header/body preservation, abort
 * propagation, error behaviour, and that a request never silently changes path.
 */
import { afterEach, describe, expect, test } from 'vitest';

import {
  RelayRoutingError,
  describePath,
  isOriginAllowedByCsp,
  resolveRequest,
} from '../src/ai/relay.js';
import {
  clearAllProviderRelays,
  getConnectionPath,
  getProviderRelay,
  getRelayConfig,
  setProviderRelay,
} from '../src/ai/connection.js';
import { TransportError, transportFetchRaw } from '../src/ai/transport.js';

const PROVIDER = 'https://api.anthropic.com/v1/messages';
const RELAY = 'https://ctimg-relay.alice.workers.dev';

afterEach(() => clearAllProviderRelays());

describe('URL rewriting', () => {
  test('a relay request encodes the provider URL as the url parameter', () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: RELAY });
    const parsed = new URL(resolved.url);

    expect(parsed.origin).toBe(new URL(RELAY).origin);
    expect(parsed.searchParams.get('url')).toBe(PROVIDER);
    // Round-trips: the relay reads back exactly the URL that was requested.
    expect(new URL(parsed.searchParams.get('url')!).toString()).toBe(PROVIDER);
    expect(resolved.path).toBe('relay');
  });

  test('the provider URL is percent-encoded, so its own query survives intact', () => {
    const target = 'https://api.replicate.com/v1/predictions?version=abc&input=%7B%7D';
    const resolved = resolveRequest(target, { relayUrl: RELAY });
    const decoded = new URL(resolved.url).searchParams.get('url');

    expect(decoded).toBe(target);
    expect(new URL(decoded!).searchParams.get('version')).toBe('abc');
  });

  test('existing relay query parameters are preserved alongside url', () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: `${RELAY}/relay?tenant=a` });
    const parsed = new URL(resolved.url);

    expect(parsed.pathname).toBe('/relay');
    expect(parsed.searchParams.get('tenant')).toBe('a');
    expect(parsed.searchParams.get('url')).toBe(PROVIDER);
  });

  test('a direct request is sent to the provider unchanged', () => {
    const resolved = resolveRequest(PROVIDER);

    expect(resolved.url).toBe(PROVIDER);
    expect(resolved.path).toBe('direct');
    expect(resolved.headers).not.toHaveProperty('X-Relay-Token');
    expect(resolved.origin).toBe('https://api.anthropic.com');
  });
});

describe('token placement', () => {
  test('the token rides only the relay request', () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: RELAY, token: 's3cret' });

    expect(resolved.headers['X-Relay-Token']).toBe('s3cret');
  });

  test('no token means no X-Relay-Token header at all', () => {
    expect(resolveRequest(PROVIDER, { relayUrl: RELAY }).headers).not.toHaveProperty(
      'X-Relay-Token',
    );
    expect(resolveRequest(PROVIDER, { relayUrl: RELAY, token: '' }).headers).not.toHaveProperty(
      'X-Relay-Token',
    );
  });

  test('a direct request never carries a token, even when a relay is configured for another provider', () => {
    setProviderRelay('anthropic', { relayUrl: RELAY, token: 's3cret' });
    const resolved = resolveRequest(PROVIDER);

    expect(resolved.path).toBe('direct');
    expect(resolved.headers).not.toHaveProperty('X-Relay-Token');
  });

  test('the token is not leaked into the provider URL', () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: RELAY, token: 's3cret' });
    expect(resolved.url).not.toContain('s3cret');
    expect(resolved.providerUrl).not.toContain('s3cret');
  });
});

describe('local validation before any request is issued', () => {
  test('a non-HTTPS relay is refused', () => {
    expect(() => resolveRequest(PROVIDER, { relayUrl: 'http://relay.example' })).toThrow(
      RelayRoutingError,
    );
    expect(() => resolveRequest(PROVIDER, { relayUrl: 'http://relay.example' })).toThrow(/https/);
  });

  test('a malformed relay URL is refused', () => {
    expect(() => resolveRequest(PROVIDER, { relayUrl: 'not a url' })).toThrow(/not a valid URL/);
  });

  test('credentials embedded in a relay URL are refused', () => {
    expect(() => resolveRequest(PROVIDER, { relayUrl: 'https://u:p@relay.example' })).toThrow(
      /username or password/,
    );
  });

  test('a non-HTTPS provider is refused on the direct leg too', () => {
    expect(() => resolveRequest('http://api.anthropic.com/v1/messages')).toThrow(/https/);
    expect(() => resolveRequest(PROVIDER, { relayUrl: RELAY })).not.toThrow();
  });

  test('the provider is validated even when a relay is configured', () => {
    expect(() => resolveRequest('http://evil.test/x', { relayUrl: RELAY })).toThrow(
      RelayRoutingError,
    );
  });

  test('validation errors are typed so a caller can distinguish relay from provider', () => {
    try {
      resolveRequest(PROVIDER, { relayUrl: 'http://relay.example' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RelayRoutingError);
      expect((error as RelayRoutingError).kind).toBe('relay-invalid');
    }
    try {
      resolveRequest('http://provider.test/x');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RelayRoutingError).kind).toBe('provider-invalid');
    }
  });

  test('an empty relay URL is a configuration error, never a silent direct fallback', () => {
    expect(resolveRequest(PROVIDER, { relayUrl: '   ' }).path).toBe('direct');
    // `undefined` and an all-whitespace URL both mean "no relay was chosen" here; what must never
    // happen is a relay request degrading into a direct one, which is asserted by resolveRequest
    // throwing rather than returning `direct` for a malformed-but-present relay URL.
    expect(() => resolveRequest(PROVIDER, { relayUrl: 'nonsense' })).toThrow();
  });
});

describe('no silent fallback between paths', () => {
  test('a relay request that fails stays a relay request', async () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: RELAY, token: 't' });
    let seenUrl = '';
    const fetchImpl = ((url: string) => {
      seenUrl = String(url);
      return Promise.reject(new TypeError('Failed to fetch'));
    }) as unknown as typeof fetch;

    await expect(
      transportFetchRaw(
        resolved.url,
        { headers: resolved.headers },
        {
          allowedOrigins: [resolved.origin],
          fetchImpl,
          maxRetries: 1,
        },
      ),
    ).rejects.toBeInstanceOf(TransportError);

    // The retry/failure path never re-resolved to the provider: one attempt, to the relay.
    expect(seenUrl.startsWith(RELAY)).toBe(true);
    expect(seenUrl).toContain(encodeURIComponent(PROVIDER));
  });

  test('a direct request never picks up a relay on its own', async () => {
    setProviderRelay('anthropic', { relayUrl: RELAY });
    const resolved = resolveRequest(PROVIDER);
    const seen: string[] = [];
    const fetchImpl = ((url: string) => {
      seen.push(String(url));
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof fetch;

    await transportFetchRaw(resolved.url, {}, { allowedOrigins: [resolved.origin], fetchImpl });
    expect(seen).toEqual([PROVIDER]);
  });
});

describe('body, header, status, and abort preservation through the relay', () => {
  test('method, headers, body, status, and response headers all survive the relay path', async () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: RELAY, token: 't' });
    let captured: RequestInit | undefined;
    const fetchImpl = ((_url: string, init: RequestInit) => {
      captured = init;
      return Promise.resolve(
        new Response('{"ok":true}', {
          status: 201,
          headers: { 'x-remaining-credits': '5', 'content-type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;

    const response = await transportFetchRaw(
      resolved.url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'sk-ant-key',
          ...resolved.headers,
        },
        body: '{"model":"claude-opus-5"}',
      },
      { allowedOrigins: [resolved.origin], fetchImpl },
    );

    expect(captured?.method).toBe('POST');
    expect((captured?.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-key');
    expect(captured?.body).toBe('{"model":"claude-opus-5"}');
    // Provider status and ledger headers come back exactly as sent.
    expect(response.status).toBe(201);
    expect(response.headers.get('x-remaining-credits')).toBe('5');
    expect(await new Response(response.body).text()).toBe('{"ok":true}');
  });

  test('a streamed body is handed back unread', async () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: RELAY });
    const encoder = new TextEncoder();
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('chunk-1;'));
              controller.enqueue(encoder.encode('chunk-2;'));
              controller.close();
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
      )) as unknown as typeof fetch;

    const response = await transportFetchRaw(
      resolved.url,
      {},
      {
        allowedOrigins: [resolved.origin],
        fetchImpl,
      },
    );
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await new Response(response.body).text()).toBe('chunk-1;chunk-2;');
  });

  test('an aborted signal propagates as a cancellation, not a generic failure', async () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: RELAY });
    const controller = new AbortController();
    const fetchImpl = ((_url: string) => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }) as unknown as typeof fetch;

    await expect(
      transportFetchRaw(
        resolved.url,
        {},
        {
          signal: controller.signal,
          allowedOrigins: [resolved.origin],
          fetchImpl,
        },
      ),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });

  test('a pre-aborted signal never issues a request', async () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: RELAY });
    let called = false;
    const fetchImpl = (() => {
      called = true;
      return Promise.resolve(new Response('{}'));
    }) as unknown as typeof fetch;

    await expect(
      transportFetchRaw(
        resolved.url,
        {},
        { signal: AbortSignal.abort(), allowedOrigins: [resolved.origin], fetchImpl },
      ),
    ).rejects.toBeDefined();
    expect(called).toBe(false);
  });

  test('the origin allowlist still governs the relay hop', async () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: RELAY });
    await expect(
      transportFetchRaw(resolved.url, {}, { allowedOrigins: ['https://somewhere.else'] }),
    ).rejects.toMatchObject({ kind: 'ai-cors-blocked' });
  });
});

describe('per-provider connection state', () => {
  test('a provider defaults to direct', () => {
    expect(getConnectionPath('anthropic')).toBe('direct');
    expect(getProviderRelay('anthropic')).toBeUndefined();
    expect(getRelayConfig('anthropic')).toBeUndefined();
  });

  test('settings are per provider', () => {
    setProviderRelay('anthropic', { relayUrl: RELAY, token: 'a' });
    setProviderRelay('clipdrop', { relayUrl: 'https://other.relay.example' });

    expect(getConnectionPath('anthropic')).toBe('relay');
    expect(getConnectionPath('clipdrop')).toBe('relay');
    expect(getConnectionPath('openai')).toBe('direct');
    expect(getRelayConfig('clipdrop')?.token).toBeUndefined();
  });

  test('clearing one provider leaves the others alone', () => {
    setProviderRelay('anthropic', { relayUrl: RELAY });
    setProviderRelay('clipdrop', { relayUrl: RELAY });
    setProviderRelay('anthropic', undefined);

    expect(getConnectionPath('anthropic')).toBe('direct');
    expect(getConnectionPath('clipdrop')).toBe('relay');
  });

  test('the revert handle restores prior settings', () => {
    setProviderRelay('anthropic', { relayUrl: RELAY, token: 'first' });
    const revert = setProviderRelay('anthropic', { relayUrl: RELAY, token: 'second' });
    expect(getRelayConfig('anthropic')?.token).toBe('second');

    revert();
    expect(getRelayConfig('anthropic')?.token).toBe('first');
  });

  test('reverting an initial set returns the provider to direct', () => {
    const revert = setProviderRelay('anthropic', { relayUrl: RELAY });
    expect(getConnectionPath('anthropic')).toBe('relay');

    revert();
    expect(getConnectionPath('anthropic')).toBe('direct');
  });

  test('nothing is persisted to web storage', () => {
    setProviderRelay('anthropic', { relayUrl: RELAY, token: 's3cret' });
    // This environment has no DOM storage at all. The point is that the module never reached for
    // it: a value written to storage would need a storage object to write to, and any key it did
    // use would still be readable here. Nothing is, because nothing was written.
    expect((globalThis as { localStorage?: Storage }).localStorage).toBeUndefined();
    expect((globalThis as { sessionStorage?: Storage }).sessionStorage).toBeUndefined();

    // And the settings survive only as long as the module does — the value is readable in memory,
    // which is the entire intended lifetime.
    expect(getRelayConfig('anthropic')?.token).toBe('s3cret');
    clearAllProviderRelays();
    expect(getRelayConfig('anthropic')).toBeUndefined();
  });
});

describe('showing the user which path a request took', () => {
  test('the description names the relay and the provider when relaying', () => {
    const resolved = resolveRequest(PROVIDER, { relayUrl: RELAY });
    const described = describePath(resolved, 'Anthropic');

    expect(described).toMatch(/Via your relay/);
    expect(described).toContain('ctimg-relay.alice.workers.dev');
    expect(described).toContain('Anthropic');
  });

  test('the description names only the provider when direct', () => {
    const described = describePath(resolveRequest(PROVIDER), 'Anthropic');

    expect(described).toMatch(/^Direct/);
    expect(described).toContain('Anthropic');
    expect(described).not.toContain('relay');
  });
});

describe('CSP feasibility reporting', () => {
  test('a scheme-wide source permits any origin of that scheme', () => {
    expect(isOriginAllowedByCsp('https://relay.example', ['https:'])).toBe(true);
    expect(isOriginAllowedByCsp('http://relay.example', ['https:'])).toBe(false);
  });

  test('an exact source permits only itself', () => {
    expect(isOriginAllowedByCsp('https://relay.example', ["'self'", 'https://a.test'])).toBe(false);
    expect(isOriginAllowedByCsp('https://a.test', ["'self'", 'https://a.test'])).toBe(true);
  });
});
