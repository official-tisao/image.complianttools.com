import { expect, test } from '@playwright/test';

/**
 * P5-13 — the relay connection control in the shipped connect surface (README §15.4).
 *
 * These assertions are about what the UI *shows* and *refuses*. No request is allowed to leave the
 * page: the tests stop at the validation gates, which is where the interesting behaviour is. A test
 * that proved the relay works end to end would need a deployed relay and a real browser against a
 * real provider — that is out of scope here and is explicitly not claimed (see
 * `docs/P5-13-CSP-BLOCKER.md`).
 */

const APP_ORIGIN = /^https?:\/\/127\.0\.0\.1:\d+$/;

/**
 * Whether a request stayed on the app's own origin.
 *
 * The origin is compared, not the whole URL: a prerendered page loads its JS chunks from the same
 * origin, and `http://127.0.0.1:4390/_app/immutable/chunks/x.mjs` is same-origin even though it does
 * not string-match an origin-only pattern. What these tests forbid is a request that *leaves* the
 * origin, so the path must be discarded before the comparison.
 */
function isAppRequest(url: string): boolean {
  try {
    return APP_ORIGIN.test(new URL(url).origin);
  } catch {
    // A URL the runtime could not parse is not a request to the app's origin.
    return false;
  }
}

for (const capability of ['generate', 'edit', 'describe'] as const) {
  test(`AI ${capability} offers Direct (recommended) / Via my relay`, async ({ page }) => {
    await page.goto(`/ai/${capability}`);
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });

    await expect(page.getByTestId('ai-connection-direct')).toBeChecked();
    await expect(page.getByTestId('ai-connection-relay')).not.toBeChecked();
    // Relay fields only exist when the relay path is chosen.
    await expect(page.getByTestId('ai-relay-url')).toHaveCount(0);

    await page.getByTestId('ai-connection-relay').check();
    await expect(page.getByTestId('ai-connection-relay')).toBeChecked();
    await expect(page.getByTestId('ai-relay-url')).toBeVisible();
    await expect(page.getByTestId('ai-relay-token')).toBeVisible();

    await page.getByTestId('ai-connection-direct').check();
    await expect(page.getByTestId('ai-relay-url')).toHaveCount(0);
  });
}

test('one-click relay setup is transparent and stays local until Cloudflare sign-in', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (!isAppRequest(request.url())) externalRequests.push(request.url());
  });

  await page.goto('/connect-ai/relay/setup?tool=generate&return=%2Fai%2Fgenerate');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Set up your private relay' })).toBeVisible();
  await expect(page.getByTestId('relay-setup-privacy')).toContainText(
    'CompliantTools does not receive your Cloudflare access token',
  );
  await expect(page.getByTestId('relay-setup-start')).toBeVisible();
  if (process.env.PUBLIC_CLOUDFLARE_OAUTH_CLIENT_ID) {
    await expect(page.getByTestId('relay-setup-start')).toBeEnabled();
  } else {
    await expect(page.getByTestId('relay-setup-start')).toBeDisabled();
    await expect(page.getByTestId('relay-setup-unavailable')).toBeVisible();
  }
  await expect(page.getByTestId('relay-setup-progress')).toHaveCount(0);
  expect(externalRequests).toEqual([]);

  await page.screenshot({ path: 'test-results/relay-setup.png', fullPage: true });
});

test('one-click setup authorizes, installs, verifies, and saves a user-owned relay', async ({
  page,
}) => {
  test.skip(
    !process.env.PUBLIC_CLOUDFLARE_OAUTH_CLIENT_ID,
    'requires a configured public OAuth client ID',
  );
  const appOrigin = 'http://127.0.0.1:4173';
  let uploadedModule = '';
  let deployedWorkerUrl = '';
  await page.route('https://dash.cloudflare.com/oauth2/auth**', async (route) => {
    const authorization = new URL(route.request().url());
    expect(authorization.searchParams.get('client_id')).toBe(
      process.env.PUBLIC_CLOUDFLARE_OAUTH_CLIENT_ID,
    );
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('scope')).toContain('workers-platform.write');
    const callback = new URL(authorization.searchParams.get('redirect_uri')!);
    callback.searchParams.set('code', 'mock-authorization-code');
    callback.searchParams.set('state', authorization.searchParams.get('state')!);
    await route.fulfill({ status: 302, headers: { location: callback.toString() } });
  });

  await page.route('https://dash.cloudflare.com/oauth2/token', async (route) => {
    await route.fulfill({
      json: { access_token: 'mock-cloudflare-token' },
      headers: { 'access-control-allow-origin': appOrigin },
    });
  });
  await page.route('https://dash.cloudflare.com/oauth2/revoke', async (route) => {
    await route.fulfill({
      json: { success: true },
      headers: { 'access-control-allow-origin': appOrigin },
    });
  });
  await page.route('https://api.cloudflare.com/**', async (route) => {
    const request = route.request();
    const corsHeaders = {
      'access-control-allow-origin': appOrigin,
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
    } else if (request.url().includes('/accounts?per_page=50')) {
      await route.fulfill({
        json: { success: true, result: [{ id: 'mock-account', name: 'My account' }] },
        headers: corsHeaders,
      });
    } else if (request.url().endsWith('/workers/subdomain') && request.method() === 'GET') {
      await route.fulfill({
        json: { success: true, result: { subdomain: 'my-test-account' } },
        headers: corsHeaders,
      });
    } else if (
      /\/workers\/scripts\/ctimg-relay-[a-f0-9]+$/u.test(new URL(request.url()).pathname) &&
      request.method() === 'PUT'
    ) {
      uploadedModule = request.postData() ?? '';
      const workerName = new URL(request.url()).pathname.split('/').at(-1)!;
      deployedWorkerUrl = `https://${workerName}.my-test-account.workers.dev`;
      await route.fulfill({ json: { success: true, result: {} }, headers: corsHeaders });
    } else if (
      /\/workers\/scripts\/ctimg-relay-[a-f0-9]+\/subdomain$/u.test(new URL(request.url()).pathname)
    ) {
      await route.fulfill({
        json: { success: true, result: { enabled: true } },
        headers: corsHeaders,
      });
    } else {
      await route.fulfill({
        status: 500,
        json: { success: false, errors: [{ message: 'Unexpected mock API call' }] },
        headers: corsHeaders,
      });
    }
  });
  await page.route('https://*.workers.dev/**', async (route) => {
    await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': appOrigin } });
  });

  await page.goto('/connect-ai/relay/setup?tool=generate&return=%2Fai%2Fgenerate');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('relay-setup-start')).toBeEnabled();
  await page.getByTestId('relay-setup-start').click();
  await expect(page).toHaveURL(/\/ai\/generate$/u, { timeout: 30_000 });
  expect(uploadedModule).toContain('RELAY_TOKEN');
  expect(uploadedModule).toContain('secret_text');
  expect(uploadedModule).toContain(appOrigin);
  expect(deployedWorkerUrl).toMatch(
    /^https:\/\/ctimg-relay-[a-f0-9]+\.my-test-account\.workers\.dev$/u,
  );
  await expect(page.getByTestId('ai-connection-relay')).toBeChecked();
  const saved = await page.evaluate(() => localStorage.getItem('ctimg:provider-relays:v1'));
  expect(saved, 'the relay URL should be stored in browser local storage').toContain(
    deployedWorkerUrl,
  );
  expect(saved).toMatch(/"token":"[a-f0-9]{64}"/u);
  expect(saved).toContain('ai-tool-edit');
  expect(saved).toContain('ai-tool-describe');
  await page.getByTestId('ai-connection-direct').check();
  const afterSwitchingToDirect = await page.evaluate(() =>
    localStorage.getItem('ctimg:provider-relays:v1'),
  );
  expect(afterSwitchingToDirect).not.toContain('ai-tool-generate');
  expect(afterSwitchingToDirect).toContain('ai-tool-edit');
  expect(afterSwitchingToDirect).toContain('ai-tool-describe');
});

test('no consent or credentials still means no request, on either path', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!isAppRequest(url)) external.push(url);
  });

  await page.goto('/ai/describe');
  await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });

  await page.getByTestId('ai-connection-relay').check();
  await page.getByTestId('ai-relay-url').fill('https://relay.example.workers.dev');
  await page.getByTestId('ai-submit').click();
  await expect(page.getByTestId('ai-error')).toContainText('consent-required');

  // With consent but no key, still nothing leaves.
  await page.getByTestId('ai-consent').check();
  await page.getByTestId('ai-endpoint').fill('https://api.anthropic.com/v1/messages');
  await page.getByTestId('ai-submit').click();
  await expect(page.getByTestId('ai-error')).toContainText('credential-missing');

  expect(external).toEqual([]);
});

test('an unusable relay URL is refused locally and never falls back to direct', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!isAppRequest(url)) external.push(url);
  });

  await page.goto('/ai/generate');
  await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });

  await page.getByTestId('ai-endpoint').fill('https://api.openai.com/v1/chat/completions');
  await page.getByTestId('ai-key').fill('sk-test-not-real');
  await page.getByTestId('ai-consent').check();
  await page.getByTestId('ai-connection-relay').check();

  // An http:// relay would carry the key and images in plaintext. It must be refused on the spot,
  // and the app must NOT quietly send the request direct instead.
  await page.getByTestId('ai-relay-url').fill('http://localhost:8787');
  await page.getByTestId('ai-submit').click();
  await expect(page.getByTestId('ai-error')).toContainText('relay-invalid');
  await expect(page.getByTestId('ai-error')).toContainText('https');

  // A relay URL that is not a URL at all is likewise refused rather than downgraded.
  await page.getByTestId('ai-relay-url').fill('not a url');
  await page.getByTestId('ai-submit').click();
  await expect(page.getByTestId('ai-error')).toContainText('relay-invalid');

  // A non-HTTPS provider is refused too, on the relay path.
  await page.getByTestId('ai-relay-url').fill('https://relay.example.workers.dev');
  await page.getByTestId('ai-endpoint').fill('http://api.openai.com/v1/chat/completions');
  await page.getByTestId('ai-submit').click();
  await expect(page.getByTestId('ai-error')).toContainText('provider-invalid');

  expect(external).toEqual([]);
});

test('the path taken is shown to the user', async ({ page }) => {
  await page.goto('/ai/generate');
  await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });

  // Nothing is claimed before a request is actually attempted.
  await expect(page.getByTestId('ai-path')).toHaveCount(0);

  await page.getByTestId('ai-endpoint').fill('https://api.openai.com/v1/chat/completions');
  await page.getByTestId('ai-key').fill('sk-test-not-real');
  await page.getByTestId('ai-consent').check();
  await page.getByTestId('ai-connection-relay').check();
  await page.getByTestId('ai-relay-url').fill('https://relay.example.workers.dev');

  // The request will fail at the network level (no such relay). What matters is that the app says
  // which path it used, and says it about the relay rather than the provider.
  await page.getByTestId('ai-submit').click();

  const path = page.getByTestId('ai-path');
  await expect(path).toBeVisible();
  await expect(path).toHaveAttribute('data-path', 'relay');
  await expect(path).toContainText(/via your relay/i);
  // The relay host is named, so the user can see where the request was sent.
  await expect(path).toContainText('relay.example.workers.dev');
});
