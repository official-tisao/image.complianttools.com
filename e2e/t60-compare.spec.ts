import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const fixtureRoot = new URL(
  '../packages/engine/bench/escalation/t60-t61/fixtures/artifacts/',
  import.meta.url,
);

async function generatedPng(page: import('@playwright/test').Page, width = 12, height = 8) {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          image.data[offset] = (x * 19) % 256;
          image.data[offset + 1] = (y * 31) % 256;
          image.data[offset + 2] = ((x + y) * 13) % 256;
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the comparison fixture.');
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

async function waitForHydration(page: import('@playwright/test').Page) {
  await page.locator('html[data-hydrated="true"]').waitFor();
}

async function generatedSolidPng(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
) {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.fillStyle = '#8294a6';
      context.fillRect(0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the solid PNG fixture.');
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

test('T60 compare route exposes static content and is listed in the sitemap', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/compare');
  await expect(page.locator('h1')).toHaveText('Compare Images');
  await expect(page.getByLabel('Choose before image')).toBeVisible();
  await expect(page.getByLabel('Choose after image')).toBeVisible();
  await expect(page.getByText('Files stay on your device. Images are not uploaded.')).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('lang', 'en');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://image.complianttools.com/compare',
  );
  await expect(page.locator('link[rel="alternate"]')).toHaveCount(4);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://image.complianttools.com/og/tools.svg',
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    'content',
    'https://image.complianttools.com/og/tools.svg',
  );
  await expect(page.locator('.tool-completion details')).toHaveCount(3);
  await expect(page.locator('.tool-completion nav a')).toHaveCount(6);
  const graph = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
  )['@graph'] as Array<{ '@type': string }>;
  expect(graph.map((entry) => entry['@type'])).toEqual([
    'SoftwareApplication',
    'FAQPage',
    'BreadcrumbList',
  ]);
  await context.close();

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain('/compare</loc>');
});

test('T60 localized routes render Arabic and pseudo-localized SEO and related links', async ({
  page,
}) => {
  await page.goto('/en-XA/compare');
  await expect(page.locator('main')).toHaveAttribute('lang', 'en-XA');
  await expect(page.locator('main')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('h1')).toHaveText(/^［.+~+］$/u);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://image.complianttools.com/en-XA/compare',
  );
  await expect(page.locator('.tool-completion nav a')).toHaveCount(6);

  await page.goto('/ar/compare');
  await expect(page.locator('main')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('h1')).toHaveText('مقارنة الصور');
  await expect(page.getByLabel('اختر الصورة قبل التعديل')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://image.complianttools.com/ar/compare',
  );
  await expect(page.locator('.tool-completion nav a')).toHaveCount(6);
  await expect(page.locator('.tool-completion nav a').first()).toHaveText('تحويل');
});

test('T60 compares registered CC0 reference and JPEG fixtures locally', async ({ page }) => {
  const externalRequests: string[] = [];
  let origin = '';
  page.on('request', (request) => {
    if (!origin) return;
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });

  await page.goto('/compare');
  await waitForHydration(page);
  origin = new URL(page.url()).origin;
  await page.getByTestId('t60-before-input').setInputFiles({
    name: 'gold-weight-reference.png',
    mimeType: 'image/png',
    buffer: await readFile(new URL('gold-weight-reference.png', fixtureRoot)),
  });
  await page.getByTestId('t60-after-input').setInputFiles({
    name: 'gold-weight-jpeg-q90.png',
    mimeType: 'image/png',
    buffer: await readFile(new URL('gold-weight-jpeg-q90.png', fixtureRoot)),
  });

  await expect(page.getByTestId('t60-results')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('t60-proxy-size')).toHaveText('Metrics proxy: 128 × 128');
  await expect(page.getByTestId('t60-verdict')).toHaveText('Nearly identical');
  await expect(page.getByTestId('t60-results')).toContainText('dB');
  await expect(page.getByTestId('compare-canvas')).toBeVisible();
  await expect(page.locator('.compare-stage .before')).toHaveJSProperty('naturalWidth', 128);
  await page.getByLabel('Comparison mode').selectOption('side');
  await expect(page.locator('.compare-stage')).toHaveAttribute('data-mode', 'side');
  await page.getByLabel('Comparison mode').selectOption('onion');
  await expect(page.locator('.compare-stage')).toHaveAttribute('data-mode', 'onion');
  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T60 withholds pixel metrics for different source dimensions but keeps the visual comparison', async ({
  page,
}) => {
  await page.goto('/compare');
  await waitForHydration(page);
  await page.getByTestId('t60-before-input').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: await readFile(new URL('gold-weight-reference.png', fixtureRoot)),
  });
  await page.getByTestId('t60-after-input').setInputFiles({
    name: 'smaller.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page, 12, 8),
  });

  await expect(page.getByTestId('t60-error')).toContainText('Metrics require matching dimensions');
  await expect(page.getByTestId('t60-results')).toHaveCount(0);
  await expect(page.getByTestId('compare-canvas')).toBeVisible();
});

test('T60 reports an unsupported file with a typed remedy', async ({ page }) => {
  await page.goto('/compare');
  await waitForHydration(page);
  await page.getByTestId('t60-before-input').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });

  await expect(page.getByTestId('t60-error')).toHaveAttribute(
    'data-error-kind',
    'unsupported-file',
    { timeout: 15_000 },
  );
  await expect(page.getByTestId('t60-error')).toContainText('Choose a PNG, JPEG, or WebP image.');
});

test('T60 rejects an oversized file before decoding it', async ({ page }) => {
  await page.goto('/compare');
  await waitForHydration(page);
  await page.getByTestId('t60-before-input').setInputFiles({
    name: 'oversized.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(32 * 1024 * 1024 + 1),
  });

  await expect(page.getByTestId('t60-error')).toHaveAttribute('data-error-kind', 'file-too-large');
  await expect(page.getByTestId('t60-error')).toContainText('smaller than 32 MiB');
});

test('T60 rejects an image over the pixel cap with a typed remedy', async ({ page }) => {
  await page.goto('/compare');
  await waitForHydration(page);
  const largeImage = await generatedSolidPng(page, 4600, 4600);
  expect(largeImage.byteLength).toBeLessThan(32 * 1024 * 1024);
  await page.getByTestId('t60-before-input').setInputFiles({
    name: 'small.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  await page.getByTestId('t60-after-input').setInputFiles({
    name: 'over-20mp.png',
    mimeType: 'image/png',
    buffer: largeImage,
  });

  await expect(page.getByTestId('t60-error')).toHaveAttribute('data-error-kind', 'image-too-large');
  await expect(page.getByTestId('t60-error')).toContainText(
    'Choose images no larger than 20 megapixels each.',
  );
});

test('T60 reports unavailable canvas support with an actionable remedy', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
  });
  await page.goto('/compare');
  await waitForHydration(page);
  const reference = await readFile(new URL('gold-weight-reference.png', fixtureRoot));
  await page.getByTestId('t60-before-input').setInputFiles({
    name: 'before.png',
    mimeType: 'image/png',
    buffer: reference,
  });
  await page.getByTestId('t60-after-input').setInputFiles({
    name: 'after.png',
    mimeType: 'image/png',
    buffer: reference,
  });

  await expect(page.getByTestId('t60-error')).toHaveAttribute(
    'data-error-kind',
    'canvas-unavailable',
  );
  await expect(page.getByTestId('t60-error')).toContainText(
    'Try a modern browser with 2D image-canvas support.',
  );
});

test('T60 reports a typed decode error for corrupt image bytes', async ({ page }) => {
  await page.goto('/compare');
  await waitForHydration(page);
  await page.getByTestId('t60-before-input').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  await page.getByTestId('t60-after-input').setInputFiles({
    name: 'corrupt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a PNG'),
  });

  await expect(page.getByTestId('t60-error')).toHaveAttribute('data-error-kind', 'decode-failed');
  await expect(page.getByTestId('t60-error')).toContainText(
    'The browser could not decode this image.',
  );
});

test('T60 reports a typed worker error when comparison workers cannot start', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: class {
        constructor() {
          throw new Error('worker unavailable');
        }
      },
    });
  });
  await page.goto('/compare');
  await waitForHydration(page);
  const png = await generatedPng(page);
  await page.getByTestId('t60-before-input').setInputFiles({
    name: 'before.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.getByTestId('t60-after-input').setInputFiles({
    name: 'after.png',
    mimeType: 'image/png',
    buffer: png,
  });

  await expect(page.getByTestId('t60-error')).toHaveAttribute('data-error-kind', 'worker-failed');
  await expect(page.getByTestId('t60-error')).toContainText('worker unavailable');
});

test('T60 cancellation terminates a pending worker and reports a restart remedy', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: ErrorEvent) => void) | null = null;
        postMessage() {
          (window as Window & { __t60WorkerPosted?: boolean }).__t60WorkerPosted = true;
        }
        terminate() {
          (window as Window & { __t60WorkerTerminated?: boolean }).__t60WorkerTerminated = true;
        }
      },
    });
  });
  await page.goto('/compare');
  await waitForHydration(page);
  const png = await generatedPng(page);
  await page.getByTestId('t60-before-input').setInputFiles({
    name: 'before.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.getByTestId('t60-after-input').setInputFiles({
    name: 'after.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.waitForFunction(
    () => (window as Window & { __t60WorkerPosted?: boolean }).__t60WorkerPosted === true,
  );

  await page.getByTestId('t60-cancel').click();
  await expect(page.getByTestId('t60-error')).toHaveAttribute('data-error-kind', 'cancelled');
  await expect(page.getByTestId('t60-error')).toContainText('Choose either image again');
  expect(
    await page.evaluate(
      () => (window as Window & { __t60WorkerTerminated?: boolean }).__t60WorkerTerminated,
    ),
  ).toBe(true);
});

test('T60 comparison modes and split control work with the keyboard', async ({ page }) => {
  await page.goto('/compare');
  await waitForHydration(page);
  const png = await generatedPng(page);
  await page.getByTestId('t60-before-input').setInputFiles({
    name: 'before.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.getByTestId('t60-after-input').setInputFiles({
    name: 'after.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(page.getByTestId('t60-results')).toBeVisible();

  const mode = page.getByLabel('Comparison mode');
  await expect(mode).toHaveValue('split');
  await mode.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.compare-stage')).toHaveAttribute('data-mode', 'side');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.compare-stage')).toHaveAttribute('data-mode', 'onion');
  await mode.selectOption('split');
  const reset = page.getByTestId('option-mode').locator('button.reset');
  await expect(reset).toBeDisabled();
  await mode.selectOption('side');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(mode).toHaveValue('split');
  const split = page.getByLabel('Split position', { exact: true });
  await split.focus();
  await expect(split).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(split).toHaveValue('51');
});

test('T60 compares a 12 MP image pair within the Chromium route latency budget', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The route latency threshold is calibrated on Chromium.');
  test.setTimeout(30_000);
  await page.goto('/compare');
  await waitForHydration(page);
  const source = await generatedSolidPng(page, 4000, 3000);
  expect(source.byteLength).toBeLessThan(32 * 1024 * 1024);
  await page.getByTestId('t60-before-input').setInputFiles({
    name: '12mp-before.png',
    mimeType: 'image/png',
    buffer: source,
  });

  const startedAt = performance.now();
  await page.getByTestId('t60-after-input').setInputFiles({
    name: '12mp-after.png',
    mimeType: 'image/png',
    buffer: source,
  });
  await expect(page.getByTestId('t60-results')).toBeVisible({ timeout: 10_000 });
  const elapsedMs = performance.now() - startedAt;
  console.info(`T60 12 MP pair route latency: ${elapsedMs.toFixed(1)} ms`);
  expect(elapsedMs).toBeLessThanOrEqual(5_000);
});

test('T60 repeats comparison after same-page worker warm-up with browser networking offline', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit cannot decode a local Blob through createImageBitmap while offline in this app context; Chromium and Firefox cover the warm-cache operation.',
  );
  await page.goto('/compare');
  await waitForHydration(page);
  const source = await generatedPng(page, 128, 96);
  const before = { name: 'warm-before.png', mimeType: 'image/png', buffer: source };
  const after = { name: 'warm-after.png', mimeType: 'image/png', buffer: source };
  await page.getByTestId('t60-before-input').setInputFiles(before);
  await page.getByTestId('t60-after-input').setInputFiles(after);
  await expect(page.getByTestId('t60-results')).toBeVisible();

  // Create local fixture bytes while online so the offline pass uses only the
  // page's already-loaded app code and the browser's in-memory worker cache.
  const offlineSource = await generatedPng(page, 128, 96);
  const failedRequests: string[] = [];
  let offline = false;
  page.on('requestfailed', (request) => {
    if (offline) failedRequests.push(request.url());
  });
  await context.setOffline(true);
  offline = true;
  try {
    await page.getByTestId('t60-after-input').setInputFiles({
      name: 'offline-after.png',
      mimeType: 'image/png',
      buffer: offlineSource,
    });
    await expect(page.getByTestId('t60-results')).toBeVisible();
    expect(failedRequests).toEqual([]);
  } finally {
    offline = false;
    await context.setOffline(false);
  }
});
