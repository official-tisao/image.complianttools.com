import { expect, test, type Page } from '@playwright/test';

/**
 * P12 / §22.6a — no implicit escalation, with a **working** provider configured.
 *
 * ## Why this file exists alongside `p5-16-escalation.spec.ts`
 *
 * `p5-16-escalation.spec.ts` proves the local tier stands alone, but it fills a *syntactically valid
 * key* with nothing behind it: no route is installed for the provider origin, so a call would fail
 * anyway. That makes "zero provider requests" partly vacuous — an unconfigured provider cannot be
 * called successfully.
 *
 * §22.6a is explicit that this is the case that matters:
 *
 * > It runs **with a provider fully configured**, which is the case where an accidental automatic
 * > call would actually happen and would otherwise go unnoticed.
 *
 * So this file installs a `page.route` mock that would **succeed** — returning a real PNG for any
 * provider request — and then asserts that none is made. Now the assertion is real: the app had a
 * working, one-click-away path to a successful provider call at every step, and did not take it.
 *
 * The mock is what makes that possible without a credential or a charge. Nothing in this file
 * contacts a live endpoint, and the key is fake by construction.
 *
 * ## What is asserted, per README §22.6a
 *
 * - every applicable `Local ⇗AI` route completes its local action end to end;
 * - the escalation control is fully configured — provider selected, key entered, consent **given** —
 *   so the button is enabled and one click from a real request;
 * - zero provider requests occur;
 * - a companion test then presses the button exactly once and asserts **exactly one** request.
 *
 * The consent box is checked in the no-implicit test deliberately. Leaving it unchecked would make
 * the button inert and the test trivial — the request could not fire regardless of what the app did.
 * Enabling it is what makes the zero-request assertion mean something.
 */

import { LOCAL_ORIGIN } from './support/network.js';

/** Provider origins an escalation could legitimately reach (§22.6a's list). */
const PROVIDER_ORIGIN =
  /^(api\.openai\.com|api\.anthropic\.com|api\.stability\.ai|api\.gemini\.googleapis\.com|generativelanguage\.googleapis\.com|api\.bfl\.ai|fal\.run|queue\.fal\.run|api\.replicate\.com|clipdrop-api\.co|api\.remove\.bg)$/u;

/** A credential that is syntactically plausible and cryptographically meaningless. */
const FAKE_KEY = 'sk-p5-16-p12-deliberately-not-a-real-key';

/**
 * An 8×8 opaque PNG for the mocked provider response.
 *
 * Sized deliberately: the compare view renders the returned frame through `ImageData`, which
 * rejects any buffer whose length is not `width * height * 4`. A 1×1 PNG decodes to fewer than 4
 * bytes per pixel once the adapter resamples it, so a "success" would throw in the renderer and
 * blame the escalation gate for a fixture that was never valid.
 */
const PROVIDER_RESULT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGM4oaHxHx9mGBkKAOdkhcFs8Kk4AAAAAElFTkSuQmCC';

/** A 48×48 PNG generated in-page, so the suite carries no binary fixture. */
async function generatedPng(page: Page, width = 48, height = 48): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.fillStyle = '#e8d8c8';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#3a6fd8';
      context.fillRect(12, 12, width - 24, height - 24);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the P12 fixture.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      }
      return btoa(binary);
    },
    { width, height },
  );
  return Buffer.from(base64, 'base64');
}

/** Wait for hydration. Every route here is a Svelte 5 island. */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector('html[data-hydrated="true"]') !== null, {
    timeout: 30_000,
  });
}

/**
 * Wait for the escalation control to finish lazy-loading.
 *
 * `EscalationControl` is imported through `LazyEscalationControl`, so it arrives on a second round
 * trip once a route has both a capability and a local result to offer. Without this wait, `fill()`
 * races the import and fails on a locator that is about to exist — which reads as a product bug and
 * is not one.
 */
async function waitForEscalationControl(page: Page): Promise<void> {
  await expect(page.getByTestId('escalation-control')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('escalation-key')).toBeVisible({ timeout: 30_000 });
}

/**
 * Install a **working** provider mock and start counting requests.
 *
 * This is the load-bearing difference from the sibling spec: any request the app did make would be
 * answered with a real image and would succeed. So a request count of zero is a statement about the
 * app's behaviour, not about an unreachable endpoint.
 */
async function installWorkingProvider(page: Page): Promise<string[]> {
  const requests: string[] = [];

  await page.route('https://api.openai.com/**', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ b64_json: PROVIDER_RESULT_PNG_BASE64 }] }),
    });
  });

  // Any other provider origin is fulfilled too, so a call to a different adapter also *succeeds*.
  // Otherwise the app could be "not calling" only because it chose an origin we had not stubbed.
  await page.route(PROVIDER_ORIGIN, async (route) => {
    const url = route.request().url();
    if (!requests.includes(url)) requests.push(url);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ b64_json: PROVIDER_RESULT_PNG_BASE64 }] }),
    });
  });

  return requests;
}

/** Record every off-origin request, so a call to an unstubbed origin is still caught. */
function watchOffOrigin(page: Page): string[] {
  const offOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== LOCAL_ORIGIN) offOrigin.push(request.url());
  });
  return offOrigin;
}

/**
 * The six `Local ⇗AI` tools of §22.6a, with the real local action for each.
 *
 * `escalatable` marks whether the route can actually offer a provider. Only `openai` and `anthropic`
 * have a `run()` that really performs a capability (`adapter-contracts.ts`'s allowlist), and between
 * them those two cover exactly two of the six: `describe` (T62, OCR) and `inpaint` (T66, remove
 * object). The other four — `/upscale`, `/expand-image`, `/remove-background`, `/replace-background`
 * — render §17.3's *explained absence* instead of a key field, because offering a button there would
 * mean offering a provider that returns a request description instead of an image.
 *
 * All six are still exercised. For the four non-escalatable routes "no request" is trivially true,
 * which is precisely why it is worth asserting explicitly: it proves the explained absence is not
 * accompanied by a control that quietly tries anyway.
 */
const ESCALATION_ROUTES = [
  {
    tool: 'T32',
    route: '/upscale',
    escalatable: false,
    async run(page: Page, file: Buffer): Promise<void> {
      await page.getByTestId('t32-file-input').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await page.getByTestId('t32-run').click();
      await expect(page.getByTestId('t32-output-dimensions')).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    tool: 'T62',
    route: '/ocr',
    // `describe`: implemented by both openai and anthropic, so this route can offer a provider.
    escalatable: true,
    async run(page: Page, file: Buffer): Promise<void> {
      await page.getByTestId('ocr-file-input').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await page.getByRole('button', { name: /recognize/i }).click();
      await expect(page.getByTestId('ocr-result')).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    tool: 'T66',
    route: '/remove-object',
    // `inpaint`: implemented by openai, so this route can offer a provider.
    escalatable: true,
    async run(page: Page, file: Buffer): Promise<void> {
      await page.getByTestId('p44-source').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      const canvas = page.getByTestId('local-source-canvas');
      await expect(canvas).toBeVisible({ timeout: 30_000 });
      await canvas.click({ position: { x: 24, y: 24 } });
      await page.getByTestId('local-tool-run').click();
      await expect(page.getByTestId('local-tool-preview')).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    tool: 'T67',
    route: '/expand-image',
    escalatable: false,
    async run(page: Page, file: Buffer): Promise<void> {
      await page.getByTestId('p4-file-input').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await page.getByTestId('p4-run').click();
      await expect(page.getByTestId('p4-preview')).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    tool: 'T68',
    route: '/remove-background',
    escalatable: false,
    async run(page: Page, file: Buffer): Promise<void> {
      await page.getByTestId('p4-file-input').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await page.getByTestId('p4-run').click();
      await expect(page.getByTestId('p4-preview')).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    tool: 'T69',
    route: '/replace-background',
    escalatable: false,
    async run(page: Page, file: Buffer): Promise<void> {
      await page.getByTestId('p4-file-input').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await page.getByTestId('p4-run').click();
      await expect(page.getByTestId('p4-preview')).toBeVisible({ timeout: 30_000 });
    },
  },
] as const;

test.describe('§22.6a — a configured, working provider is never called without a gesture', () => {
  for (const tool of ESCALATION_ROUTES) {
    test(`${tool.tool} ${tool.route}: local result, escalation fully armed, zero requests`, async ({
      page,
    }) => {
      // A provider that would answer successfully if it were called. This is what makes the
      // zero-request assertion below a statement about the app rather than about a dead endpoint.
      const providerRequests = await installWorkingProvider(page);
      const offOrigin = watchOffOrigin(page);

      await page.goto(tool.route);
      await waitForHydration(page);

      const file = await generatedPng(page);
      await tool.run(page, file);

      // The local result exists and is badged as local (§13.1.2: a tier is never removed).
      const badge = page.getByTestId('tier-badge');
      await expect(badge).toBeVisible({ timeout: 30_000 });
      await expect(badge).toHaveAttribute('data-tier', /local|on-device/u);

      if (!tool.escalatable) {
        // No adapter really performs this capability, so the route explains the absence rather than
        // offering a button that cannot work (§17.3: every absence is explained).
        await expect(page.getByTestId('escalation-unavailable')).toContainText(/no provider/i);
        await expect(page.getByTestId('escalation-submit')).toHaveCount(0);
      } else {
        // Arm the control completely: a provider is selected by default, the key is entered, and
        // consent is given. After this the button is enabled and one click from a successful call.
        await waitForEscalationControl(page);
        await page.getByTestId('escalation-key').fill(FAKE_KEY);
        await page.getByTestId('escalation-consent').check();

        // Armed, enabled, and still nothing sent.
        await expect(page.getByTestId('escalation-submit')).toBeEnabled();
        await expect(page.getByTestId('escalation-request-count')).toHaveText('0');
        expect(
          providerRequests,
          'a request was issued before any gesture, while the control was fully configured',
        ).toEqual([]);
      }

      // The component's own counter and the network observer must both agree on zero.
      await expect(page.getByTestId('escalation-request-count')).toHaveText('0');
      expect(
        providerRequests,
        `${tool.route} called a provider without a gesture: ${providerRequests.join(', ')}`,
      ).toEqual([]);
      // And nothing reached any provider origin at all, including one we did not stub.
      expect(
        offOrigin.filter((url) => PROVIDER_ORIGIN.test(new URL(url).hostname)),
        `${tool.route} reached a provider origin: ${offOrigin.join(', ')}`,
      ).toEqual([]);
    });
  }

  test('all six routes in sequence: still zero provider requests', async ({ page }) => {
    // Each per-tool test starts from a clean page. This one walks all six, so a control that
    // escalates on *navigation* — the cheapest implicit escalation, and the one a single-route test
    // cannot see — would be caught here.
    //
    // The six routes, six navigations, and six local image runs do not fit the 30s default. This is
    // not slack for slowness: it failed on Chromium at exactly 30s while passing on Firefox and
    // WebKit, because a run that fits on two engines sits right on the limit on the third. The
    // budget below is still far under the 600s suite timeout, so a genuine hang fails too.
    test.slow();
    test.setTimeout(180_000);
    const providerRequests = await installWorkingProvider(page);
    const offOrigin = watchOffOrigin(page);

    await page.goto('/upscale');
    await waitForHydration(page);
    const file = await generatedPng(page);

    for (const tool of ESCALATION_ROUTES) {
      await page.goto(tool.route);
      await waitForHydration(page);
      await tool.run(page, file);

      if (tool.escalatable) {
        await waitForEscalationControl(page);
        await page.getByTestId('escalation-key').fill(FAKE_KEY);
        await page.getByTestId('escalation-consent').check();
        await expect(page.getByTestId('escalation-submit')).toBeEnabled();
      }
    }

    expect(providerRequests, `provider calls: ${providerRequests.join(', ')}`).toEqual([]);
    expect(offOrigin.filter((url) => PROVIDER_ORIGIN.test(new URL(url).hostname))).toEqual([]);
  });

  test('the armed credential never reaches the rendered page', async ({ page }) => {
    // A leak here would be worse than a spurious call: the key is now typed into a control on every
    // route, so §17.3's failure copy has to be credential-safe wherever it renders.
    await page.route('https://api.openai.com/**', async (route) => {
      // The provider echoes the key back in its error body — the worst case for redaction.
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: `Incorrect API key provided: ${FAKE_KEY}` } }),
      });
    });

    await page.goto('/remove-object');
    await waitForHydration(page);
    await page.getByTestId('p44-source').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });
    const canvas = page.getByTestId('local-source-canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await canvas.click({ position: { x: 24, y: 24 } });
    await page.getByTestId('local-tool-run').click();
    await expect(page.getByTestId('local-tool-preview')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('escalation-key').fill(FAKE_KEY);
    await page.getByTestId('escalation-consent').check();
    await page.getByTestId('escalation-submit').click();

    const error = page.getByTestId('escalation-error');
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).not.toContainText(FAKE_KEY);
    await expect(page.locator('body')).not.toContainText(FAKE_KEY);
  });

  test('exactly one gesture produces exactly one request', async ({ page, browserName }) => {
    // The companion §22.6a requires. Distinct from the no-implicit tests above: here the button IS
    // pressed, and the count is asserted as a number rather than inferred from the handler running.
    const providerRequests = await installWorkingProvider(page);

    await page.goto('/remove-object');
    await waitForHydration(page);
    await page.getByTestId('p44-source').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });
    const canvas = page.getByTestId('local-source-canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await canvas.click({ position: { x: 24, y: 24 } });
    await page.getByTestId('local-tool-run').click();
    await expect(page.getByTestId('local-tool-preview')).toBeVisible({ timeout: 30_000 });

    // The cost is visible before the gesture, and labelled as an estimate.
    const estimate = page.getByTestId('escalation-estimate');
    await expect(estimate).toBeVisible();
    await expect(estimate).toContainText(/estimate|price table|no documented price/iu);
    expect(providerRequests, 'no request may precede the gesture').toEqual([]);

    await page.getByTestId('escalation-key').fill(FAKE_KEY);
    await page.getByTestId('escalation-consent').check();
    await page.getByTestId('escalation-submit').click();

    if (browserName === 'webkit') {
      // WebKit enforces CORS itself and rejects before the mock answers, so the request never
      // leaves the browser. That is a real outcome and §17.3's cors-blocked message is the honest
      // rendering; asserting `1` here would be asserting a WebKit CORS bypass the app does not
      // implement.
      await expect(page.getByTestId('escalation-error')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('escalation-error')).toContainText(
        /cannot reach this provider directly|relay/i,
      );
      expect(providerRequests, 'WebKit blocks the request before it is sent').toHaveLength(0);
      // The local result stays on screen regardless — §13.1.2, "a tier is never removed".
      await expect(page.getByTestId('local-tool-preview')).toBeVisible();
      return;
    }

    // The mocked result appears in the compare view, beside the local one.
    await expect(page.getByTestId('escalation-result')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('escalation-local-image')).toBeVisible();
    await expect(page.getByTestId('escalation-ai-image')).toBeVisible();
    await expect(page.getByTestId('escalation-local-badge')).toHaveText(/Local/u);
    await expect(page.getByTestId('escalation-cost')).toBeVisible();

    // The load-bearing assertion: exactly one request, not "the handler ran".
    expect(providerRequests).toHaveLength(1);
    // And the component's own counter agrees, so a future refactor cannot quietly issue a second
    // request from somewhere this file does not observe.
    await expect(page.getByTestId('escalation-request-count')).toHaveText('1');
  });
});
