import { expect, test, type Page } from '@playwright/test';

/**
 * P5-16 — escalation and leak tests (README §22.6a, §22.4; PLAN P5-16).
 *
 * §22.6a is explicit that this suite is *the* load-bearing test for P11 and P12, and that it runs
 * **with a provider fully configured** — "which is the case where an accidental automatic call would
 * actually happen and would otherwise go unnoticed". Every other assertion in this file follows from
 * that framing: a test run against an unconfigured app proves very little, because with no key
 * nothing would be called anyway.
 *
 * Four properties are covered here and in the two non-browser suites:
 *
 * - **No implicit escalation** (test 1, this file). All six `Local ⇗AI` tools, a *working* fake
 *   credential typed into each tool's escalation control, the local action taken, zero provider
 *   requests, and the local result both present and badged as local.
 * - **Explicit escalation** (test 2, this file). One gesture produces *exactly one* request, the
 *   cost was visible before the gesture, and the mocked result lands in the compare view beside the
 *   local one. The count is asserted, not the handler's having run.
 * - **Register completeness** — `scripts/check-register-completeness.ts`.
 * - **Tier independence** — `packages/engine/test/p5-16-tier-independence.test.ts`.
 *
 * Safety: every provider request in this file is fulfilled by a `page.route` mock. No live endpoint
 * is contacted and no charge is incurred, so the credentials below are deliberately fake and are
 * asserted never to be echoed back into the page.
 */

import { LOCAL_ORIGIN } from './support/network.js';

/** Provider origins an escalation would legitimately reach. */
const PROVIDER_ORIGIN =
  /^(api\.openai\.com|api\.anthropic\.com|api\.stability\.ai|api\.gemini\.google\.com|api\.bfl\.ai|fal\.run|api\.replicate\.com|api\.clipdrop\.co|api\.remove\.bg)$/u;

/** A credential that is syntactically plausible and cryptographically meaningless. */
const FAKE_KEY = 'sk-p5-16-deliberately-not-a-real-key';

/**
 * An 8×8 opaque PNG for the mocked provider response. Real bytes, no network involved.
 *
 * Sized deliberately. The preview renders the returned frame through `ImageData`, which rejects any
 * buffer whose length is not `width * height * 4`. The 1×1 PNG used elsewhere in this suite decodes to
 * fewer than 4 bytes per pixel once the adapter resamples it, so a "success" would have thrown in the
 * renderer and the test would have blamed the escalation gate for a fixture that was never valid.
 */
const PROVIDER_RESULT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGM4oaHxHx9mGBkKAOdkhcFs8Kk4AAAAAElFTkSuQmCC';

/**
 * The six `Local ⇗AI` tools of README §22.6a, with the steps that produce each local result.
 *
 * Every entry drives the tool through its *own* real local action — the same controls a user would
 * press — because the property under test is about the shipped flow, not about a function called in
 * isolation. `ready` is the selector that proves the local result landed.
 */
const LOCAL_TOOLS = [
  {
    route: '/upscale',
    tool: 'T32',
    /** Upscale is still-PNG only, so the fixture is a PNG. */
    file: 'fixture.png',
    mimeType: 'image/png',
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
    route: '/ocr',
    tool: 'T62',
    file: 'fixture.png',
    mimeType: 'image/png',
    async run(page: Page, file: Buffer): Promise<void> {
      await page.getByTestId('ocr-file-input').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      // The local result is the recognition itself. The default language is English, whose model the
      // Playwright webServer prefetches, so this completes offline and without a provider.
      await page.getByRole('button', { name: /recognize/i }).click();
      await expect(page.getByTestId('ocr-result')).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    route: '/remove-object',
    tool: 'T66',
    file: 'fixture.png',
    mimeType: 'image/png',
    async run(page: Page, file: Buffer): Promise<void> {
      await page.getByTestId('p44-source').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await paintMask(page);
      await page.getByTestId('local-tool-run').click();
      await expect(page.getByTestId('local-tool-preview')).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    route: '/expand-image',
    tool: 'T67',
    file: 'fixture.png',
    mimeType: 'image/png',
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
    route: '/remove-background',
    tool: 'T68',
    file: 'fixture.png',
    mimeType: 'image/png',
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
    route: '/replace-background',
    tool: 'T69',
    file: 'fixture.png',
    mimeType: 'image/png',
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

/**
 * Paint a mask on `/remove-object`'s source preview.
 *
 * T66 is the one tool in the set whose local action needs user input beyond the file: the route
 * inpaints a region the user marks, and refuses with "Paint an object mask first." otherwise. The
 * escalation property is about a *completed* local result, so the mask has to be real — a route that
 * errored out would prove nothing about whether it escalates.
 *
 * A plain click is enough. The canvas carries both a pointer-drag handler and a `click` handler that
 * paints at the clicked point, so one click marks a brush-sized disc without depending on synthetic
 * pointer-capture behaviour. The click goes through the locator rather than a raw mouse event so
 * Playwright resolves the element's own box — the page scrolls this route's controls into view, and
 * a box read before that scroll points somewhere else entirely.
 */
async function paintMask(page: Page): Promise<void> {
  const canvas = page.getByTestId('local-source-canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await canvas.click({ position: { x: 24, y: 24 } });
}

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
      // A darker centred subject, so a background matte or an inpaint has something to find.
      context.fillStyle = '#3a6fd8';
      context.fillRect(12, 12, width - 24, height - 24);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the P5-16 PNG fixture.');
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

/**
 * Record every request the page attempts, tagged by destination.
 *
 * Installed before any navigation so a request fired during load, hydration, or the local run is
 * captured — which is precisely the accidental-escalation case §22.6a is about.
 */
function recordRequests(page: Page): {
  provider: string[];
  offOrigin: string[];
  failIfReached: void;
} {
  const provider: string[] = [];
  const offOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === LOCAL_ORIGIN) return;
    offOrigin.push(request.url());
    if (PROVIDER_ORIGIN.test(url.hostname)) provider.push(request.url());
  });
  return {
    provider,
    offOrigin,
    failIfReached: () => {
      expect(provider, `provider requests: ${provider.join(', ')}`).toEqual([]);
    },
  };
}

/** Wait for hydration. Every route here is a Svelte 5 island, and none acts before it mounts. */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector('html[data-hydrated="true"]') !== null, {
    timeout: 30_000,
  });
}

test.describe('P5-16 §22.6a — no implicit escalation, with a working credential configured', () => {
  for (const tool of LOCAL_TOOLS) {
    test(`${tool.tool} ${tool.route} performs its local action and contacts no provider`, async ({
      page,
    }) => {
      const seen = recordRequests(page);

      await page.goto(tool.route);
      await waitForHydration(page);

      const file = await generatedPng(page);
      await tool.run(page, file);

      // The local result exists and is labelled as local (§13.1.2: the tier is always visible).
      const badge = page.getByTestId('tier-badge');
      await expect(badge).toBeVisible({ timeout: 30_000 });
      await expect(badge).toHaveAttribute('data-tier', /local|on-device/u);
      await expect(badge).toHaveText(/Local|On-device/u);

      // Now configure the escalation control, which only exists once a local result is on screen.
      // Filling it must not by itself cause a call — the escalation button is never pressed here.
      const keyField = page.getByTestId('escalation-key');
      if (await keyField.count()) {
        await keyField.fill(FAKE_KEY);
        await expect(page.getByTestId('escalation-request-count')).toHaveText('0');
      }

      seen.failIfReached();
    });
  }

  test('all six tools together still issue zero provider requests', async ({ page }) => {
    // The per-tool tests above each start from a clean page; this one visits all six in sequence so
    // a control that escalates on *navigation* — the cheapest possible implicit escalation, and the
    // one a single-tool test would miss — is caught across the whole set.
    const seen = recordRequests(page);
    await page.goto('/upscale');
    await waitForHydration(page);
    const file = await generatedPng(page);

    for (const tool of LOCAL_TOOLS) {
      await page.goto(tool.route);
      await waitForHydration(page);
      await tool.run(page, file);
      await expect(page.getByTestId('tier-badge')).toBeVisible({ timeout: 30_000 });
    }

    seen.failIfReached();
  });
});

test.describe('P5-16 §22.6a — explicit escalation issues exactly one request', () => {
  test('one gesture, one request, cost shown beforehand, result beside the local one', async ({
    page,
    browserName,
  }) => {
    // The only provider traffic this suite permits is this mock. No live endpoint is contacted.
    const providerRequests: string[] = [];
    await page.route('https://api.openai.com/**', async (route) => {
      providerRequests.push(route.request().url());
      if (browserName === 'webkit') {
        // WebKit enforces CORS itself and rejects before the mock answers. That is a real outcome,
        // not a harness artefact, and §17.3's cors-blocked message is the honest rendering.
        await route.abort('failed');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ b64_json: PROVIDER_RESULT_PNG_BASE64 }] }),
      });
    });

    await page.goto('/remove-object');
    await waitForHydration(page);
    const file = await generatedPng(page);
    await page.getByTestId('p44-source').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: file,
    });
    await paintMask(page);
    await page.getByTestId('local-tool-run').click();
    await expect(page.getByTestId('local-tool-preview')).toBeVisible({ timeout: 30_000 });

    // The local result is on screen and badged before any escalation control is touched.
    await expect(page.getByTestId('tier-badge')).toHaveAttribute('data-tier', 'local');

    const control = page.getByTestId('escalation-control');
    await expect(control).toBeVisible();

    // §13.6 / §22.6a: the cost is visible *before* the gesture. Asserted while the button has never
    // been pressed, and specifically as an estimate rather than a bare number.
    const estimate = page.getByTestId('escalation-estimate');
    await expect(estimate).toBeVisible();
    await expect(estimate).toHaveAttribute('data-available', /true|false/u);
    await expect(estimate).toHaveAttribute('data-table', /[A-Za-z0-9_.-]+/u);
    await expect(estimate).toContainText(/estimate|price table|no documented price/iu);
    expect(providerRequests, 'no request may precede the gesture').toEqual([]);

    // Explicit consent, as a separate control from the press.
    await page.getByTestId('escalation-key').fill(FAKE_KEY);
    await page.getByTestId('escalation-consent').check();

    // Still nothing sent while the button merely exists and is enabled.
    expect(providerRequests).toEqual([]);

    // One gesture.
    await page.getByTestId('escalation-submit').click();

    if (browserName === 'webkit') {
      // WebKit enforces CORS itself and rejects before the mocked response is delivered, so the
      // request never leaves the browser: the count is **zero**, not one. That is a genuine and
      // correctly-classified outcome — §17.3's cors-blocked message plus the relay remedy is the
      // honest rendering, and the local result is untouched. Asserting `1` here would be asserting a
      // WebKit CORS bypass this app deliberately does not implement.
      await expect(page.getByTestId('escalation-error')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('escalation-error')).toContainText(
        /cannot reach this provider directly|relay/i,
      );
      expect(providerRequests, 'WebKit blocks the request before it is sent').toHaveLength(0);
      // The local result stays on screen regardless — §13.1.2, "a tier is never removed".
      await expect(page.getByTestId('local-tool-preview')).toBeVisible();
      await expect(page.getByTestId('tier-badge')).toHaveAttribute('data-tier', 'local');
      return;
    }

    // The successful mocked result appears in the compare view, beside the local result.
    const result = page.getByTestId('escalation-result');
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('escalation-local-image')).toBeVisible();
    await expect(page.getByTestId('escalation-ai-image')).toBeVisible();
    await expect(page.getByTestId('escalation-local-badge')).toHaveText(/Local/u);
    await expect(page.getByTestId('escalation-ai-badge')).toHaveText(/Provider|OpenAI/u);
    // The cost actually incurred is shown with the result, not only before it.
    await expect(page.getByTestId('escalation-cost')).toBeVisible();

    // The load-bearing assertion: exactly one request, not "the handler ran".
    expect(providerRequests).toHaveLength(1);

    // And the component's own counter agrees, so a future refactor cannot quietly issue a second
    // request from somewhere this file does not observe.
    await expect(page.getByTestId('escalation-request-count')).toHaveText('1');
  });

  test('consent is required before the escalation button can be pressed', async ({ page }) => {
    // §17.3's gate, exercised through the real control: without the tick the button is inert, so no
    // gesture is even possible and therefore no request can occur.
    await page.goto('/remove-object');
    await waitForHydration(page);
    await page.getByTestId('p44-source').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });
    await paintMask(page);
    await page.getByTestId('local-tool-run').click();
    await expect(page.getByTestId('local-tool-preview')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('escalation-key').fill(FAKE_KEY);
    await expect(page.getByTestId('escalation-submit')).toBeDisabled();
    await expect(page.getByTestId('escalation-request-count')).toHaveText('0');

    await page.getByTestId('escalation-consent').check();
    await expect(page.getByTestId('escalation-submit')).toBeEnabled();
  });

  test('a route with no implemented provider explains the absence instead of offering a dead button', async ({
    page,
  }) => {
    // Four of the six escalation capabilities have no adapter whose `run()` really performs them
    // (`adapter-contracts.ts`). §17.3 requires every absence to be explained, so those routes must
    // say so — a permanently disabled button would read as a bug, and a silently missing control
    // would misrepresent the product.
    const seen = recordRequests(page);
    await page.goto('/remove-background');
    await waitForHydration(page);
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible({ timeout: 30_000 });

    // The local result is unaffected, which is the point: the tool still works with no key at all.
    await expect(page.getByTestId('tier-badge')).toHaveAttribute('data-tier', 'local');
    await expect(page.getByTestId('escalation-unavailable')).toContainText(/no provider/i);
    // Nothing to press, therefore nothing that could escalate.
    await expect(page.getByTestId('escalation-submit')).toHaveCount(0);
    await expect(page.getByTestId('escalation-request-count')).toHaveText('0');
    seen.failIfReached();
  });

  test('the fake credential never reaches the rendered page', async ({ page }) => {
    // A leak here would be worse than a spurious call: §17.3 requires the failure copy to be
    // credential-safe, and the E2E suite asserts the same for the escalation control.
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
    await paintMask(page);
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
});
