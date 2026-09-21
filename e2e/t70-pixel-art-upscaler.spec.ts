import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function generatedPng(page: import('@playwright/test').Page, width = 3, height = 2) {
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
          const colour = (x + y) % 2 === 0 ? [240, 32, 16] : [16, 48, 240];
          image.data[offset] = colour[0]!;
          image.data[offset + 1] = colour[1]!;
          image.data[offset + 2] = colour[2]!;
          image.data[offset + 3] = x === 0 && y === 0 ? 0 : 255;
        }
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated pixel-art fixture.');
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

async function focusWithTab(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
  attempts = 100,
) {
  for (let index = 0; index < attempts; index += 1) {
    const focused = await locator.evaluate((element) => element === document.activeElement);
    if (focused) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Could not reach the requested T70 control using Tab.');
}

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`${locale}/pixel-art-upscaler is prerendered with localized SEO content`, async ({
    page,
  }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/pixel-art-upscaler`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com${prefix}/pixel-art-upscaler`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    await expect(page.locator('.tool-completion details')).toHaveCount(5);
    await expect(page.locator('.tool-completion nav a')).toHaveCount(6);
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    expect(
      (await page.locator('meta[name="description"]').getAttribute('content'))?.length,
    ).toBeLessThanOrEqual(155);
    const graph = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    )['@graph'] as Array<{ '@type': string }>;
    expect(graph.map((entry) => entry['@type'])).toEqual([
      'SoftwareApplication',
      'FAQPage',
      'BreadcrumbList',
    ]);
  });
}

test('T70 static HTML remains useful without JavaScript and is listed in the sitemap', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/pixel-art-upscaler');
  await expect(page.locator('h1')).toHaveText('Pixel-Art Upscaler');
  await expect(page.locator('input[type=file]')).toBeVisible();
  await expect(page.getByText('Questions about this tool')).toBeVisible();
  await expect(page.getByText(/Still PNG only/u)).toBeVisible();
  await context.close();

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain('/pixel-art-upscaler</loc>');
});

test('T70 defaults to a byte-identical no-op and the preview blob is exactly the PNG export', async ({
  page,
}) => {
  const requestsOutsideApp: string[] = [];
  let origin = '';
  page.on('request', (request) => {
    if (!origin) return;
    const url = new URL(request.url());
    if (url.origin !== origin) requestsOutsideApp.push(url.href);
  });

  await page.goto('/pixel-art-upscaler');
  origin = new URL(page.url()).origin;
  const source = await generatedPng(page);
  const fileInput = page.getByTestId('t70-file-input');
  const enabled = page.getByTestId('option-pixelArt-enabled').locator('input[type=checkbox]');
  await expect(enabled).not.toBeChecked();
  await fileInput.setInputFiles({ name: 'palette.png', mimeType: 'image/png', buffer: source });
  await expect(page.getByTestId('t70-status')).toHaveText('Original PNG is unchanged.');
  await expect(page.getByTestId('t70-download')).toBeEnabled();
  await expect(page.locator('.compare-stage .after')).toHaveJSProperty('naturalWidth', 3);

  const originalDownload = page.waitForEvent('download');
  await page.getByTestId('t70-download').click();
  const originalPath = await (await originalDownload).path();
  expect(await readFile(originalPath!)).toEqual(source);

  await enabled.check();
  await expect(page.getByTestId('t70-output-dimensions')).toContainText('6 × 4');
  await expect(page.locator('.compare-stage .after')).toHaveJSProperty('naturalWidth', 6);
  const previewUrl = await page.locator('.compare-stage .after').getAttribute('src');
  expect(previewUrl).toMatch(/^blob:/u);
  const previewBytes = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url!)).arrayBuffer());
    return Array.from(bytes);
  }, previewUrl);
  const scaledDownload = page.waitForEvent('download');
  await page.getByTestId('t70-download').click();
  const scaled = await scaledDownload;
  expect(scaled.suggestedFilename()).toBe('palette-2x.png');
  const scaledPath = await scaled.path();
  expect(await readFile(scaledPath!)).toEqual(Buffer.from(previewBytes));
  expect(requestsOutsideApp).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T70 reports unsupported input as a typed error with a recovery remedy', async ({ page }) => {
  await page.goto('/pixel-art-upscaler');
  await page.getByTestId('t70-file-input').setInputFiles({
    name: 'not-a-png.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'unsupported-file');
  await expect(alert).toContainText('Choose a valid PNG image');
  await expect(alert).toContainText('PNG only');
});

test('T70 rejects files above the 32 MiB input limit with a typed remedy', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/pixel-art-upscaler');
  await page.locator('html[data-hydrated="true"]').waitFor();
  await page.getByTestId('t70-file-input').evaluate((element) => {
    const file = new File([new Uint8Array([0])], 'oversized.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: 32 * 1024 * 1024 + 1,
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = element as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'file-too-large');
  await expect(alert).toContainText('Choose a PNG smaller than 32 MiB');
});

test('T70 refuses PNG headers above the 20-megapixel source limit', async ({ page }) => {
  await page.goto('/pixel-art-upscaler');
  const oversizedDimensions = Buffer.from(await generatedPng(page));
  oversizedDimensions.writeUInt32BE(5_000, 16);
  oversizedDimensions.writeUInt32BE(5_000, 20);
  await page.getByTestId('t70-file-input').setInputFiles({
    name: 'oversized-dimensions.png',
    mimeType: 'image/png',
    buffer: oversizedDimensions,
  });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'image-too-large');
  await expect(alert).toContainText('Choose a smaller image');
});

test('T70 reports a browser PNG decoder failure with a typed remedy', async ({ page }) => {
  await page.goto('/pixel-art-upscaler');
  const fixture = await generatedPng(page);
  await page.evaluate(() => {
    Object.defineProperty(window, 'createImageBitmap', {
      configurable: true,
      value: async () => {
        throw new Error('Simulated PNG decoder failure.');
      },
    });
  });
  await page.getByTestId('t70-file-input').setInputFiles({
    name: 'decoder-failure.png',
    mimeType: 'image/png',
    buffer: fixture,
  });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'decode-failed');
  await expect(alert).toContainText('Export a valid, non-animated PNG');
});

test('T70 stops outputs above 16 megapixels before decoding for scale', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/pixel-art-upscaler');
  await page.getByTestId('t70-file-input').setInputFiles({
    name: 'two-megapixels.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page, 2_000, 1_000),
  });
  await page.getByTestId('option-pixelArt-factor').getByRole('button', { name: '4×' }).click();
  await page.getByTestId('option-pixelArt-enabled').locator('input[type=checkbox]').check();
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'image-too-large');
  await expect(alert).toContainText('lower scale factor');
});

test('T70 displays a worker-supplied invalid-options error with its remedy', async ({ page }) => {
  await page.addInitScript(() => {
    class InvalidFactorWorker {
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;

      postMessage() {
        this.onmessage?.({
          data: {
            type: 'error',
            kind: 'invalid-options',
            detail: 'The worker rejected an unsupported scale factor.',
            remedy: 'Choose an integer scale factor of 2, 3, or 4.',
          },
        } as MessageEvent);
      }

      terminate() {}
    }
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: InvalidFactorWorker,
    });
  });
  await page.goto('/pixel-art-upscaler');
  await page.getByTestId('t70-file-input').setInputFiles({
    name: 'worker-invalid-factor.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  await page.getByTestId('option-pixelArt-enabled').locator('input[type=checkbox]').check();
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'invalid-options');
  await expect(alert).toContainText('Choose an integer scale factor of 2, 3, or 4');
});

test('T70 reports a worker crash as a typed processing error with a remedy', async ({ page }) => {
  await page.addInitScript(() => {
    class FailingWorker {
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;

      postMessage() {
        queueMicrotask(() =>
          this.onerror?.(new ErrorEvent('error', { message: 'test worker failure' })),
        );
      }

      terminate() {}
    }
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: FailingWorker,
    });
  });
  await page.goto('/pixel-art-upscaler');
  await page.getByTestId('t70-file-input').setInputFiles({
    name: 'worker-error.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  await page.getByTestId('option-pixelArt-enabled').locator('input[type=checkbox]').check();
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'processing-failed');
  await expect(alert).toContainText('Try a smaller PNG or a lower scale factor');
});

test('T70 supports keyboard-only file selection, scaling controls, and download', async ({
  page,
}) => {
  await page.goto('/pixel-art-upscaler');
  const fileInput = page.getByTestId('t70-file-input');
  await focusWithTab(page, fileInput);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (
    await chooserPromise
  ).setFiles({
    name: 'keyboard-palette.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });

  const enabled = page.getByTestId('option-pixelArt-enabled').locator('input[type=checkbox]');
  await focusWithTab(page, enabled);
  await page.keyboard.press('Space');
  await expect(enabled).toBeChecked();
  const factor = page.getByTestId('option-pixelArt-factor');
  const factor3 = factor.getByRole('button', { name: '3×' });
  await expect(page.getByTestId('t70-status')).toContainText('Scaled output dimensions');
  await expect(factor3).toBeEnabled();
  await focusWithTab(page, factor3);
  await expect(factor3).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(factor3).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('t70-output-dimensions')).toContainText('9 × 6');

  const download = page.getByTestId('t70-download');
  await focusWithTab(page, download);
  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await downloadPromise).suggestedFilename()).toBe('keyboard-palette-3x.png');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T70 remains usable at a 320 CSS-pixel viewport without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/pixel-art-upscaler');
  await page.getByTestId('t70-file-input').setInputFiles({
    name: 'mobile-palette.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  const enabled = page.getByTestId('option-pixelArt-enabled').locator('input[type=checkbox]');
  await enabled.check();
  await expect(page.getByTestId('t70-output-dimensions')).toContainText('6 × 4');
  await expect(page.getByTestId('t70-download')).toBeVisible();
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    overflowingElements: Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: element.className,
          text: element.textContent?.trim().slice(0, 48),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        };
      })
      .filter((element) => element.left < -1 || element.right > window.innerWidth + 1),
  }));
  expect(
    layout.document,
    `Document overflows at 320 CSS px: ${JSON.stringify(layout)}`,
  ).toBeLessThanOrEqual(layout.viewport);
  expect(
    layout.body,
    `Body overflows at 320 CSS px: ${JSON.stringify(layout)}`,
  ).toBeLessThanOrEqual(layout.viewport);
});

test('T70 reuses the local worker and scaler after the page is warmed and the browser goes offline', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const externalRequests: string[] = [];
  let offline = false;
  page.on('request', (request) => {
    if (offline && new URL(request.url()).origin !== new URL(page.url()).origin)
      externalRequests.push(request.url());
  });
  await page.goto('/pixel-art-upscaler');
  await page.getByTestId('t70-file-input').setInputFiles({
    name: 'offline-palette.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  const enabled = page.getByTestId('option-pixelArt-enabled').locator('input[type=checkbox]');
  await enabled.check();
  await expect(page.getByTestId('t70-output-dimensions')).toContainText('6 × 4');

  offline = true;
  await context.setOffline(true);
  try {
    await page.getByTestId('option-pixelArt-factor').getByRole('button', { name: '4×' }).click();
    await expect(page.getByTestId('t70-output-dimensions')).toContainText('12 × 8', {
      timeout: 30_000,
    });
    expect(externalRequests).toEqual([]);
  } finally {
    offline = false;
    if (!page.isClosed()) await context.setOffline(false);
  }
});

test('T70 measures one-megapixel 2× processing and PNG export against the existing 12 s upscale budget', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The deterministic latency measurement runs in Chromium.');
  test.setTimeout(60_000);
  await page.goto('/pixel-art-upscaler');
  const source = await generatedPng(page, 1000, 1000);
  await page.getByTestId('t70-file-input').setInputFiles({
    name: 'one-megapixel-palette.png',
    mimeType: 'image/png',
    buffer: source,
  });
  const enabled = page.getByTestId('option-pixelArt-enabled').locator('input[type=checkbox]');
  await enabled.check();
  await expect(page.getByTestId('t70-output-dimensions')).toContainText('2000 × 2000', {
    timeout: 30_000,
  });
  const latencyText = await page.getByTestId('t70-latency').textContent();
  const measuredMs = Number(latencyText?.match(/(\d+) ms/u)?.[1]);
  expect(Number.isFinite(measuredMs), `Unexpected latency label: ${latencyText}`).toBe(true);
  expect(measuredMs).toBeLessThanOrEqual(12_000);
});
