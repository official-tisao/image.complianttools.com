export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
export const CLOUDFLARE_TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
export const CLOUDFLARE_REVOKE_URL = 'https://dash.cloudflare.com/oauth2/revoke';
export const CLOUDFLARE_AUTH_URL = 'https://dash.cloudflare.com/oauth2/auth';

export interface CloudflareAccount {
  id: string;
  name: string;
}

interface CloudflareEnvelope<T> {
  success?: boolean;
  errors?: { message?: string }[];
  result: T;
}

export class RelaySetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelaySetupError';
  }
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CLOUDFLARE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<CloudflareEnvelope<T>>;
  if (!response.ok || payload.success === false || payload.result === undefined) {
    const detail = payload.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join(' ');
    throw new RelaySetupError(
      detail || `Cloudflare could not complete relay setup (HTTP ${response.status}).`,
    );
  }
  return payload.result;
}

export async function listCloudflareAccounts(token: string): Promise<CloudflareAccount[]> {
  const result = await api<CloudflareAccount[]>(token, '/accounts?per_page=50');
  return result.filter((account) => account.id && account.name);
}

function randomHex(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function installRelay(
  token: string,
  accountId: string,
  origin: string,
  workerModuleUrl = '/relay-installer/index.js',
): Promise<{ url: string; relayToken: string }> {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin || !['https:', 'http:'].includes(parsedOrigin.protocol)) {
    throw new RelaySetupError('The current site address is not a valid origin.');
  }

  const existingSubdomain = await api<{ subdomain?: string } | null>(
    token,
    `/accounts/${encodeURIComponent(accountId)}/workers/subdomain`,
  ).catch((cause: unknown) => {
    if (cause instanceof RelaySetupError && /HTTP 404/u.test(cause.message)) return null;
    throw cause;
  });

  let subdomain = existingSubdomain?.subdomain;
  if (!subdomain) {
    subdomain = `ctimg-${randomHex(5)}`;
    await api(token, `/accounts/${encodeURIComponent(accountId)}/workers/subdomain`, {
      method: 'PUT',
      body: JSON.stringify({ subdomain }),
    });
  }

  const workerName = `ctimg-relay-${randomHex(6)}`;
  const relayToken = randomHex(32);
  const moduleResponse = await fetch(workerModuleUrl, { cache: 'no-store' });
  if (!moduleResponse.ok) {
    throw new RelaySetupError(
      'The relay installer could not load its worker code. Reload and try again.',
    );
  }

  const form = new FormData();
  form.set(
    'metadata',
    JSON.stringify({
      main_module: 'index.js',
      compatibility_date: '2025-09-01',
      logpush: false,
      observability: { enabled: false },
      bindings: [
        { type: 'plain_text', name: 'ALLOWED_ORIGINS', text: parsedOrigin.origin },
        { type: 'secret_text', name: 'RELAY_TOKEN', text: relayToken },
      ],
    }),
  );
  form.set('index.js', await moduleResponse.blob(), 'index.js');
  await api(
    token,
    `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}`,
    { method: 'PUT', body: form },
  );
  await api(
    token,
    `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/subdomain`,
    { method: 'POST', body: JSON.stringify({ enabled: true }) },
  );

  const url = `https://${workerName}.${subdomain}.workers.dev`;
  const preflight = await fetch(
    `${url}/?url=${encodeURIComponent('https://api.openai.com/v1/models')}`,
    {
      method: 'OPTIONS',
      headers: {
        Origin: parsedOrigin.origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,x-relay-token',
      },
    },
  ).catch(() => null);
  if (preflight === null || preflight.status !== 204) {
    throw new RelaySetupError(
      'Cloudflare deployed the relay, but its browser check did not pass. Check that workers.dev is enabled for this account.',
    );
  }
  return { url, relayToken };
}

export async function revokeCloudflareToken(token: string, clientId: string): Promise<void> {
  const body = new URLSearchParams({
    token,
    token_type_hint: 'access_token',
    client_id: clientId,
  });
  await fetch(CLOUDFLARE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).catch(() => undefined);
}

export async function exchangeCloudflareCode(input: {
  code: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.verifier,
  });
  const response = await fetch(CLOUDFLARE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new RelaySetupError(
      payload.error_description || 'Cloudflare authorization did not complete. Please try again.',
    );
  }
  return payload.access_token;
}
