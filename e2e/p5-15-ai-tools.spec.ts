import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * P5-15 — the AI-only routes in the shipped product (README §4.9).
 *
 * Two things are being verified, and they are deliberately kept apart:
 *
 * - **T71's local descriptive skeleton**, which must work with no provider, no key, no consent, and
 *   zero outbound requests. Every assertion here about egress is a *negative* one — the skeleton
 *   must produce a report while nothing leaves the origin. This is the strongest form of §4.9's
 *   "without a key" promise.
 * - **The provider gate on all three routes**, which must stay shut until the user has taken the
 *   action, supplied configuration, and ticked consent. No real provider is contacted: the tests stop
 *   at the gates, or intercept the request with a mock route so a "success" costs nothing.
 *
 * No live provider, no real credential, no charge. The only outbound traffic the suite permits is to
 * a `page.route` mock the test itself installs.
 */

const APP_ORIGIN = /^https?:\/\/127\.0\.0\.1:\d+$/u;

/** A request that left the app origin. Used to prove a local action really is local. */
function isOffOrigin(url: string): boolean {
  try {
    return !APP_ORIGIN.test(new URL(url).origin);
  } catch {
    return true;
  }
}

/** A 16×9 solid PNG, generated in-page so the suite carries no binary fixture. */
async function generatedPng(page: Page, width = 16, height = 9): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.fillStyle = '#3a6fd8';
      context.fillRect(0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the P5-15 PNG fixture.');
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

/** A 1×1 PNG in base64, for the mocked generate response. Real bytes, no network involved. */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// --- T71: the local descriptive skeleton -------------------------------------------------------

test.describe('T71 local descriptive skeleton (README §4.9, no key required)', () => {
  test('produces its local report with no provider, no key, no consent, and zero outbound requests', async ({
    page,
  }) => {
    const offOrigin: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (isOffOrigin(url)) offOrigin.push(url);
    });

    await page.goto('/ai/describe');
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });

    // Nothing is configured, and nothing needs to be.
    await expect(page.getByTestId('ai-key')).toHaveValue('');
    await expect(page.getByTestId('ai-consent')).not.toBeChecked();
    await expect(page.getByTestId('ai-local-empty')).toBeVisible();

    await page.getByTestId('ai-local-image').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page, 16, 9),
    });

    const skeleton = page.getByTestId('describe-skeleton');
    await expect(skeleton).toBeVisible();

    // §4.9's seven named fields are all present, each carrying its own status.
    for (const key of [
      'dimensions',
      'aspectRatio',
      'dominantPalette',
      'transparency',
      'orientation',
      'faceCount',
      'embeddedText',
      'exifSubjectFields',
    ]) {
      const field = page.getByTestId(`skeleton-field-${key}`);
      await expect(field).toBeVisible();
      await expect(field).toHaveAttribute(
        'data-status',
        /measured|uncertain|unavailable|unsupported/u,
      );
    }

    // Measured facts about the generated fixture.
    await expect(page.getByTestId('skeleton-field-dimensions')).toContainText('16');
    await expect(page.getByTestId('skeleton-field-dimensions')).toHaveAttribute(
      'data-status',
      'measured',
    );
    await expect(page.getByTestId('skeleton-field-aspectRatio')).toContainText('16:9');

    // The report is labelled as a skeleton, not as recognition or finished alt text.
    await expect(page.getByTestId('skeleton-disclaimer')).toContainText(/not AI recognition/u);
    await expect(page.getByTestId('skeleton-disclaimer')).toContainText(/not finished alt text/u);

    // The whole point: a local action stayed local.
    expect(offOrigin, `off-origin requests: ${offOrigin.join(', ')}`).toEqual([]);
  });

  test('reports missing OCR data and unavailable face detection honestly', async ({ page }) => {
    const offOrigin: string[] = [];
    page.on('request', (request) => {
      if (isOffOrigin(request.url())) offOrigin.push(request.url());
    });

    await page.goto('/ai/describe');
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });
    await page.getByTestId('ai-local-image').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });

    // No OCR model is bundled except Cyrillic, and the report must not download one.
    const text = page.getByTestId('skeleton-field-embeddedText');
    await expect(text).toHaveAttribute('data-status', 'unavailable');
    await expect(text).toContainText(/never downloads/u);
    await expect(text).not.toContainText('0');

    // Face detection has no bundled weights, and a count of zero would be a claim it cannot support.
    const faces = page.getByTestId('skeleton-field-faceCount');
    await expect(faces).toHaveAttribute('data-status', 'unavailable');
    await expect(faces).toContainText(/zero/i);
    await expect(faces).toContainText(/never downloads|not downloaded/u);

    // EXIF subject fields are a measurement of absence, not a gap.
    const exif = page.getByTestId('skeleton-field-exifSubjectFields');
    await expect(exif).toHaveAttribute('data-status', 'measured');

    expect(offOrigin, `the report downloaded something: ${offOrigin.join(', ')}`).toEqual([]);
  });

  test('labels an approximate palette as approximate rather than as a measurement', async ({
    page,
  }) => {
    await page.goto('/ai/describe');
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });
    await page.getByTestId('ai-local-image').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });

    const palette = page.getByTestId('skeleton-field-dominantPalette');
    await expect(palette).toHaveAttribute('data-status', 'uncertain');
    // The dominant colour of a solid fill is the fill colour, not an invented one.
    await expect(palette).toContainText('#3A6FD8');
    await expect(palette).toContainText(/approximate quantisation/u);
  });

  test('says nothing about what the image depicts', async ({ page }) => {
    await page.goto('/ai/describe');
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });
    await page.getByTestId('ai-local-image').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });
    // Wait for a computed row, not just the container: the skeleton renders its shell immediately.
    await expect(page.getByTestId('skeleton-field-dominantPalette')).toBeVisible();

    // Assert on the *reported values*, not the whole report: the disclaimer legitimately uses some of
    // these words to say what the report does NOT do ("nothing here says what the image depicts").
    const rows = page.locator('[data-testid^="skeleton-field-"]');
    const rendered = (await rows.allInnerTexts()).join('\n').toLowerCase();
    // A blue rectangle is the worst case for a guesser: colour and shape strongly suggest "sky".
    for (const claim of ['sky', 'landscape', 'photograph', 'a photo', 'appears to be', 'depicts']) {
      expect(rendered, `skeleton asserted content: "${claim}"`).not.toContain(claim);
    }
  });

  test('the skeleton needs neither the provider form nor consent, and works while it is untouched', async ({
    page,
  }) => {
    await page.goto('/ai/describe');
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });

    // Deliberately leave every provider control empty and unticked.
    await page.getByTestId('ai-local-image').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });
    await expect(page.getByTestId('describe-skeleton')).toBeVisible();
    await expect(page.getByTestId('ai-key')).toHaveValue('');
    await expect(page.getByTestId('ai-consent')).not.toBeChecked();
  });

  test('the local report is announced as a region and passes axe', async ({ page }) => {
    await page.goto('/ai/describe');
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });
    await page.getByTestId('ai-local-image').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });
    await expect(page.getByTestId('describe-skeleton')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the localized route keeps its direction and canonical link', async ({ page }) => {
    await page.goto('/ar/ai/describe');
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });
    await expect(page.locator('main')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://image.complianttools.com/ar/ai/describe',
    );

    // The skeleton's own strings are localized too, not left in English.
    await page.getByTestId('ai-local-image').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });
    await expect(page.getByTestId('skeleton-heading')).toContainText('الهيكل');
  });
});

// --- The provider gate on all three routes -----------------------------------------------------

for (const capability of ['generate', 'edit', 'describe'] as const) {
  test(`T${capability === 'generate' ? '64' : capability === 'edit' ? '65' : '71'} /ai/${capability}: no request without consent`, async ({
    page,
  }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (isOffOrigin(url)) external.push(url);
    });

    await page.goto(`/ai/${capability}`);
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });

    await page.getByTestId('ai-key').fill('sk-test-not-real');
    await page.getByTestId('ai-submit').click();

    const error = page.getByTestId('ai-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/consent/i);
    expect(external, `off-origin requests: ${external.join(', ')}`).toEqual([]);
  });

  test(`T${capability === 'generate' ? '64' : capability === 'edit' ? '65' : '71'} /ai/${capability}: consent without a key still sends nothing`, async ({
    page,
  }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (isOffOrigin(url)) external.push(url);
    });

    await page.goto(`/ai/${capability}`);
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });

    // Satisfy the gates that sit in front of the credential check, so the *credential* gate is what
    // stops the request. Consent alone is never sufficient on any of the three routes.
    if (capability === 'generate') await page.getByTestId('ai-prompt').fill('a red square');
    if (capability === 'edit') {
      await page.getByTestId('ai-prompt').fill('make it winter');
      await page.getByTestId('ai-image').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: await generatedPng(page),
      });
    }
    await page.getByTestId('ai-consent').check();
    await page.getByTestId('ai-submit').click();

    const error = page.getByTestId('ai-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/key/i);
    expect(external, `off-origin requests: ${external.join(', ')}`).toEqual([]);
  });

  test(`/ai/${capability}: a cost estimate is shown before the request, labelled as an estimate`, async ({
    page,
  }) => {
    await page.goto(`/ai/${capability}`);
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });

    const estimate = page.getByTestId('ai-estimate');
    await expect(estimate).toBeVisible();
    // Either a documented figure, or an explicit "no documented price". Never a bare number.
    await expect(estimate).toHaveAttribute('data-available', /true|false/u);
    await expect(estimate).toContainText(/estimate|price table/u);
    await expect(estimate).toHaveAttribute('data-table', /[A-Za-z0-9_.-]+/u);
  });
}

test('the picker offers only providers whose adapter really implements the capability', async ({
  page,
}) => {
  await page.goto('/ai/generate');
  await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });

  const options = await page.getByTestId('ai-provider').locator('option').allTextContents();
  expect(options.length).toBeGreaterThan(0);
  // These adapters document generate/edit/describe but return a request description, not a result,
  // so offering them would promise an image the app cannot deliver.
  for (const stubbed of [
    'fal',
    'replicate',
    'gemini',
    'stability',
    'FLUX',
    'Gemini',
    'Replicate',
  ]) {
    expect(options.join(' '), `"${stubbed}" must not be offered for generate`).not.toContain(
      stubbed,
    );
  }
  // OpenAI's adapter does implement generation, so it must be there.
  expect(options.join(' ')).toContain('OpenAI');
});

test('a withheld provider is explained rather than silently missing', async ({ page }) => {
  await page.goto('/ai/generate');
  await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });

  const summary = page.getByTestId('ai-withheld-summary');
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(page.getByTestId('ai-withheld-list')).toContainText(/no verified implementation/u);
});

test('a mocked provider request succeeds only after consent and configuration', async ({
  page,
}) => {
  // The only provider call the suite permits is this mocked one. No live endpoint is contacted.
  const seen: string[] = [];
  await page.route('https://api.openai.com/**', async (route) => {
    seen.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ b64_json: TINY_PNG_BASE64 }] }),
    });
  });

  await page.goto('/ai/generate');
  await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });

  await page.getByTestId('ai-prompt').fill('a solid red square');
  await page.getByTestId('ai-key').fill('sk-test-not-real');
  await page.getByTestId('ai-consent').check();
  await page.getByTestId('ai-submit').click();

  await expect(page.getByTestId('ai-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('ai-result-images').locator('img')).toHaveCount(1);
  expect(seen.length).toBe(1);
  await expect(page.getByTestId('ai-path')).toHaveAttribute('data-path', 'direct');
});

test('an empty provider response is reported as a failure, not as a generated image', async ({
  page,
}) => {
  // A 200 with no image is exactly what a stub adapter looks like to the UI.
  await page.route('https://api.openai.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.goto('/ai/generate');
  await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });
  await page.getByTestId('ai-prompt').fill('a solid red square');
  await page.getByTestId('ai-key').fill('sk-test-not-real');
  await page.getByTestId('ai-consent').check();
  await page.getByTestId('ai-submit').click();

  // An empty result must never render as a generated image. Two shapes are rejected in two places:
  // the adapter throws on a missing `data` array, and `resultIsUsable` rejects an array with no
  // images. Either way, the only requirement is that nothing is claimed to have been generated.
  const error = page.getByTestId('ai-error');
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('ai-result')).toHaveCount(0);
  await expect(page.getByTestId('ai-result-images')).toHaveCount(0);
});

test('a provider rejection renders a specific, credential-safe message', async ({ page }) => {
  await page.route('https://api.openai.com/**', async (route) => {
    // The provider echoes the key back in its error body — the worst case for redaction.
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test-not-real' } }),
    });
  });

  await page.goto('/ai/generate');
  await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });
  await page.getByTestId('ai-prompt').fill('a solid red square');
  await page.getByTestId('ai-key').fill('sk-test-not-real');
  await page.getByTestId('ai-consent').check();
  await page.getByTestId('ai-submit').click();

  const error = page.getByTestId('ai-error');
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error).toContainText(/rejected|key/u);
  // The key must not be echoed back into the UI.
  await expect(error).not.toContainText('sk-test-not-real');
});

test('the relay path is preserved and never silently downgraded to direct', async ({ page }) => {
  await page.route('https://relay.example.workers.dev/**', async (route) => {
    await route.abort('failed');
  });

  await page.goto('/ai/generate');
  await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });

  await page.getByTestId('ai-prompt').fill('a solid red square');
  await page.getByTestId('ai-key').fill('sk-test-not-real');
  await page.getByTestId('ai-consent').check();
  await page.getByTestId('ai-connection-relay').check();
  await page.getByTestId('ai-relay-url').fill('https://relay.example.workers.dev');
  await page.getByTestId('ai-submit').click();

  // The path is reported as relay even though the request failed.
  await expect(page.getByTestId('ai-path')).toHaveAttribute('data-path', 'relay', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('ai-path')).toContainText('relay.example.workers.dev');
});
