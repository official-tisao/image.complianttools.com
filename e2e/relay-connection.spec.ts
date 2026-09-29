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

test('no consent or credentials still means no request, on either path', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!APP_ORIGIN.test(url)) external.push(url);
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
    if (!APP_ORIGIN.test(url)) external.push(url);
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
