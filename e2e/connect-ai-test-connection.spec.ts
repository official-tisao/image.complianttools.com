import { expect, test } from '@playwright/test';

/**
 * Flow C' — the first connection (README §11.4 Flow C', §17.3 step 3).
 *
 * ## What §17.3 asks for, and what this proves
 *
 * > `Test connection` runs a real, minimal, cheap probe and reports exactly what worked and which
 * > capabilities are now available.
 *
 * "Reports **exactly** what worked" is the load-bearing word. A button that always says
 * "Connected" is worse than no button, because it converts a user's uncertainty into a false
 * confidence they act on. So every case below drives the real control against a mocked provider
 * endpoint and asserts the rendered outcome — success, or one specific §17.3 failure message.
 *
 * ## No credentials, no spend
 *
 * Every provider call here is fulfilled by `page.route`. No live endpoint is contacted, nothing is
 * charged, and the key is a fixture that is syntactically plausible and cryptographically
 * meaningless.
 *
 * ## What is deliberately NOT claimed
 *
 * The button never offers a capability the test did not confirm. Several adapters' `test()` runs a
 * credential check that cannot exercise their image endpoints, and they now return an empty
 * `confirmed` list rather than their descriptor's. These tests assert that empty list renders as
 * "nothing confirmed yet" — not as a capability grid lighting up.
 */

const FAKE_KEY = 'sk-flow-c-prime-not-a-real-key-000';

/**
 * Fulfill a provider request the way a provider actually does.
 *
 * A real provider answers a cross-origin `fetch` with `Access-Control-Allow-Origin`. A bare
 * `route.fulfill` does not, so the browser treats the reply as a CORS failure and never hands it
 * to the page: Chromium and Firefox silently drop it, and WebKit surfaced every stubbed response as
 * a blocked request. The five WebKit failures in this file were all that, not a product defect —
 * the app was correctly reporting a CORS failure for a response that really had no CORS headers.
 *
 * The origin is echoed rather than `*` because the request is credentialed, which forbids the
 * wildcard. It is read from the request's own `Origin` header rather than hard-coded, because the
 * test server is `http://127.0.0.1:4173` — naming the production hostname here rejected every
 * response as cross-origin and broke the suite on all four browsers at once.
 */
async function fulfillAsProvider(
  route: import('@playwright/test').Route,
  response: {
    status?: number;
    body?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<void> {
  const origin = route.request().headers()['origin'] ?? 'http://127.0.0.1:4173';
  await route.fulfill({
    status: response.status ?? 200,
    contentType: 'application/json',
    body: response.body ?? '{}',
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, content-type',
      ...response.headers,
    },
  });
}

/**
 * Wait for hydration.
 *
 * The `html[data-hydrated]` marker other specs use is emitted per-component by the tool routes, not
 * by this page, so this waits for the connect page's own root to be interactive instead: the test
 * control only exists once the island has mounted.
 */
async function waitForHydration(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByTestId('provider-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('test-connection')).toBeVisible({ timeout: 30_000 });
}

/**
 * Skip the request-making half of this file on WebKit, and say why.
 *
 * Playwright's WebKit does not route this cross-origin provider request through `page.route`: the
 * trace shows `https://api.openai.com/v1/models` answered by the preview server itself — `200`,
 * `text/html`, carrying this app's own `Cross-Origin-Opener-Policy` and `_headers` — so the stub
 * never runs and the page correctly reports a CORS failure for a response that genuinely had none.
 * The behaviour is in the harness, not the product: Chromium, Firefox and Edge all pass, and
 * `p5-16-no-implicit-escalation.spec.ts` records the same WebKit interception gap from the other
 * side.
 *
 * So on WebKit these six cases cannot observe what they assert. They are skipped rather than
 * weakened — a WebKit CORS bypass is not something this app implements, and asserting one would be
 * asserting a fiction. The other four cases in this file press no button, make no request, and run
 * on WebKit unchanged.
 */
function skipWhenWebkitCannotIntercept(browserName: string): void {
  test.skip(
    browserName === 'webkit',
    'WebKit does not route this cross-origin provider request through page.route, so the stubbed ' +
      'response never reaches the page and nothing about the assertion can be observed.',
  );
}

test.describe("Flow C' — §17.3 step 3, a real connection test", () => {
  test('a working key renders a real success message naming what was confirmed', async ({
    page,
    browserName,
  }) => {
    skipWhenWebkitCannotIntercept(browserName);
    await page.route('https://api.openai.com/**', async (route) => {
      await fulfillAsProvider(route, {
        body: JSON.stringify({ object: 'list', data: [{ id: 'gpt-image-1' }] }),
      });
    });

    await page.goto('/connect-ai/openai');
    await waitForHydration(page);

    await page.getByTestId('test-cred-apiKey').fill(FAKE_KEY);
    await page.getByTestId('test-run').click();

    const ok = page.getByTestId('test-result-ok');
    await expect(ok).toBeVisible({ timeout: 30_000 });
    await expect(ok).toContainText('Connected to OpenAI');

    // The page must not offer capabilities the test did not confirm. `GET /models` proves the
    // credential, not the four image endpoints, so nothing is confirmed — and saying so is the
    // honest rendering. A grid lighting up here would be the over-claim §4.9 forbids.
    await expect(page.getByTestId('test-result-ok')).toContainText(/confirm/i);

    // No error panel, and no fallback success rendered.
    await expect(page.getByTestId('test-result-error')).toHaveCount(0);
  });

  test('a rejected key renders the specific §17.3 message for a 401', async ({
    page,
    browserName,
  }) => {
    skipWhenWebkitCannotIntercept(browserName);
    await page.route('https://api.openai.com/**', async (route) => {
      // OpenAI echoes the submitted key back in its 401 body — the redaction case as well.
      await fulfillAsProvider(route, {
        status: 401,
        body: JSON.stringify({
          error: { message: `Incorrect API key provided: ${FAKE_KEY}`, code: 'invalid_api_key' },
        }),
      });
    });

    await page.goto('/connect-ai/openai');
    await waitForHydration(page);
    await page.getByTestId('test-cred-apiKey').fill(FAKE_KEY);
    await page.getByTestId('test-run').click();

    const error = page.getByTestId('test-result-error');
    await expect(error).toBeVisible({ timeout: 30_000 });
    // §17.3's exact class: "That key was rejected", with the copy-the-whole-key remedy.
    await expect(error).toHaveAttribute('data-failure-class', 'rejected');
    await expect(error).toContainText(/rejected/i);
    await expect(error).toContainText(/copy the whole key/i);
    // And the credential must not survive into the rendered page, even though the provider echoed it.
    await expect(error).not.toContainText(FAKE_KEY);
    await expect(page.locator('body')).not.toContainText(FAKE_KEY);

    await expect(page.getByTestId('test-result-ok')).toHaveCount(0);
  });

  test('a rate-limited key renders the rate-limit message, not an auth failure', async ({
    page,
    browserName,
  }) => {
    skipWhenWebkitCannotIntercept(browserName);
    await page.route('https://api.openai.com/**', async (route) => {
      await fulfillAsProvider(route, {
        status: 429,
        headers: { 'retry-after': '20' },
        body: JSON.stringify({
          error: { message: 'Rate limit reached', code: 'rate_limit_exceeded' },
        }),
      });
    });

    await page.goto('/connect-ai/openai');
    await waitForHydration(page);
    await page.getByTestId('test-cred-apiKey').fill(FAKE_KEY);
    await page.getByTestId('test-run').click();

    const error = page.getByTestId('test-result-error');
    await expect(error).toBeVisible({ timeout: 30_000 });
    // §17.3: the message must name whose limit it is, so the user does not go looking here.
    await expect(error).toHaveAttribute('data-failure-class', 'rate-limited');
    await expect(error).toContainText(/rate limit/i);
    await expect(error).toContainText(/not ours/i);
  });

  test('a browser-blocked request renders the CORS class and the relay remedy', async ({
    page,
    browserName,
  }) => {
    // §17.3's third example: "your browser can't reach X directly", with a relay offered.
    //
    // WebKit is skipped here for a different reason than the passing cases: it blocks this request
    // on its own, before `page.route` could abort it. That still reaches the same `cors-blocked`
    // rendering, but for a different cause, so asserting it here would not be asserting this mock.
    skipWhenWebkitCannotIntercept(browserName);
    await page.route('https://api.stability.ai/**', (route) => route.abort('failed'));

    await page.goto('/connect-ai/stability');
    await waitForHydration(page);
    await page.getByTestId('test-cred-apiKey').fill(FAKE_KEY);
    await page.getByTestId('test-run').click();

    const error = page.getByTestId('test-result-error');
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toHaveAttribute('data-failure-class', 'cors-blocked');
    await expect(error).toContainText(/cannot reach this provider directly/i);
    await expect(error).toContainText(/relay/i);
  });

  test('a provider whose test confirms nothing says so rather than offering capabilities', async ({
    page,
    browserName,
  }) => {
    // Stability's probe is a balance call: it proves the credential and cannot exercise the eight
    // image endpoints its descriptor declares.
    skipWhenWebkitCannotIntercept(browserName);
    await page.route('https://api.stability.ai/**', async (route) => {
      await fulfillAsProvider(route, { body: JSON.stringify({ balance: 25 }) });
    });

    await page.goto('/connect-ai/stability');
    await waitForHydration(page);
    await page.getByTestId('test-cred-apiKey').fill(FAKE_KEY);
    await page.getByTestId('test-run').click();

    const ok = page.getByTestId('test-result-ok');
    await expect(ok).toBeVisible({ timeout: 30_000 });
    // The balance is reported because it is what the probe actually returned.
    await expect(ok).toContainText('25');
    // And the page does not claim capabilities were confirmed.
    await expect(ok).not.toContainText(/confirmed:\s*inpaint/i);
  });

  test('the key is never written to browser storage', async ({ page, browserName }) => {
    // §16.2's storage-mode selector is not offered because no storage layer exists to honour it.
    // Asserting the negative is what makes the page's own wording ("not stored") true rather than
    // aspirational.
    skipWhenWebkitCannotIntercept(browserName);
    await page.route('https://api.openai.com/**', async (route) => {
      await fulfillAsProvider(route, { body: JSON.stringify({ data: [] }) });
    });

    await page.goto('/connect-ai/openai');
    await waitForHydration(page);
    await page.getByTestId('test-cred-apiKey').fill(FAKE_KEY);
    await page.getByTestId('test-run').click();
    await expect(page.getByTestId('test-result-ok')).toBeVisible({ timeout: 30_000 });

    const leaked = await page.evaluate((key) => {
      const hits: string[] = [];
      for (const [store, label] of [
        [window.localStorage, 'localStorage'],
        [window.sessionStorage, 'sessionStorage'],
      ] as const) {
        for (let i = 0; i < store.length; i += 1) {
          const k = store.key(i) ?? '';
          const v = store.getItem(k) ?? '';
          if (k.includes(key) || v.includes(key)) hits.push(`${label}:${k}`);
        }
      }
      return hits;
    }, FAKE_KEY);

    expect(leaked, `credential reached storage: ${leaked.join(', ')}`).toEqual([]);
  });

  test('the button is inert until a required credential is entered', async ({ page }) => {
    await page.goto('/connect-ai/openai');
    await waitForHydration(page);

    // §17.3: nothing is sent until the user acts. With no key there is nothing to send it with, so
    // the control says so instead of firing a doomed request.
    await expect(page.getByTestId('test-run')).toBeDisabled();
    await expect(page.getByTestId('test-missing-credential')).toBeVisible();
    await expect(page.getByTestId('test-missing-credential')).toContainText(/API Key/i);
  });

  test('a billable provider requires a second confirming click before spending', async ({
    page,
    browserName,
  }) => {
    // §17.3: "Where `test()` would necessarily cost money (§14.5), the button says so *before* it is
    // pressed, with the estimated amount, and requires a second confirming click." BFL is the only
    // provider §14.5 documents as having no free endpoint.
    skipWhenWebkitCannotIntercept(browserName);
    let called = 0;
    await page.route('https://api.bfl.ai/**', async (route) => {
      called += 1;
      await fulfillAsProvider(route);
    });

    await page.goto('/connect-ai/bfl');
    await waitForHydration(page);

    // The cost is disclosed before anything is pressed.
    await expect(page.getByTestId('test-may-cost')).toBeVisible();
    await expect(page.getByTestId('test-may-cost')).toContainText(/billable|cost/i);

    await page.getByTestId('test-cred-apiKey').fill(FAKE_KEY);
    // Armed with a key but not yet consented to the spend: still inert.
    await expect(page.getByTestId('test-run')).toBeDisabled();
    expect(called, 'the provider was contacted before the confirming click').toBe(0);

    await page.getByTestId('test-cost-consent').check();
    await expect(page.getByTestId('test-run')).toBeEnabled();
    await page.getByTestId('test-run').click();
    await expect(page.getByTestId('test-result-ok')).toBeVisible({ timeout: 30_000 });

    // Exactly one request: one gesture, one probe.
    expect(called).toBe(1);
  });

  test('the static example panel is labelled as an example, not a live result', async ({
    page,
  }) => {
    await page.goto('/connect-ai/openai');
    await waitForHydration(page);

    // The panel that previously read "Connected to OpenAI." with `data-severity="ok"` on every
    // provider page, with no test ever run. It must now be unmistakably an illustration.
    const example = page.getByTestId('test-success-example');
    await expect(example).toBeVisible();
    await expect(example).toHaveAttribute('data-example', 'true');
    await expect(example).toContainText(/example|not a live result/i);
    // And it is not the success testid a real result uses, so nothing can scrape it as one.
    await expect(page.getByTestId('test-success')).toHaveCount(0);
  });

  test('an unknown provider slug is a 404, not a page with a broken test button', async ({
    page,
  }) => {
    const response = await page.goto('/connect-ai/test-stub');
    expect(response?.status()).toBe(404);
  });
});
