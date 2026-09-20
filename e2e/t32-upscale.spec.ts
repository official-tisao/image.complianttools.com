import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function generatedPng(page: Page, width = 3, height = 2) {
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
          image.data[offset] = (x * 71 + y * 19) % 256;
          image.data[offset + 1] = (x * 23 + y * 97) % 256;
          image.data[offset + 2] = (x * 43 + y * 37) % 256;
          image.data[offset + 3] = x === 0 && y === 0 ? 0 : 255;
        }
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated T32 fixture.');
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

async function focusWithTab(page: Page, locator: Locator, attempts = 100) {
  for (let index = 0; index < attempts; index += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Could not reach the requested T32 control using Tab.');
}

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`${locale}/upscale is prerendered with localized SEO content`, async ({ page }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/upscale`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com${prefix}/upscale`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    await expect(page.locator('.tool-completion details')).toHaveCount(4);
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    expect(
      (await page.locator('meta[name="description"]').getAttribute('content'))?.length,
    ).toBeLessThanOrEqual(155);
  });
}

test('T32 static HTML is useful without JavaScript and the route is listed in the sitemap', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/upscale');
  await expect(page.locator('h1')).toHaveText('Image Upscaler');
  await expect(page.locator('input[type=file]')).toBeVisible();
  await expect(page.getByText(/Still PNG only/u)).toBeVisible();
  await context.close();

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain('/upscale</loc>');
});

test('T32 DCCI and NEDI scale PNGs in a worker, preview and download match, and no external requests occur', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  let origin = '';
  page.on('request', (request) => {
    if (!origin) return;
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });

  await page.goto('/upscale');
  origin = new URL(page.url()).origin;
  const source = await generatedPng(page);
  await page.getByTestId('t32-file-input').setInputFiles({
    name: 'pattern.png',
    mimeType: 'image/png',
    buffer: source,
  });
  await expect(page.getByTestId('t32-status')).toHaveText(
    'PNG ready. Choose a method and scale factor.',
  );

  for (const method of ['dcci', 'nedi'] as const) {
    await page.getByTestId('t32-method').selectOption(method);
    await page.getByTestId('t32-factor').selectOption('2');
    await page.getByTestId('t32-run').click();
    await expect(page.getByTestId('t32-output-dimensions')).toContainText('6 × 4');
    await expect(page.locator('.compare-stage .before')).toHaveJSProperty('naturalWidth', 3);
    await expect(page.locator('.compare-stage .after')).toHaveJSProperty('naturalWidth', 6);
    await expect(page.getByTestId('t32-download')).toBeEnabled();
  }

  const previewUrl = await page.locator('.compare-stage .after').getAttribute('src');
  expect(previewUrl).toMatch(/^blob:/u);
  const previewBytes = await page.evaluate(async (url) => {
    return Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer()));
  }, previewUrl);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('t32-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pattern-nedi-2x.png');
  expect(await readFile((await download.path())!)).toEqual(Buffer.from(previewBytes));
  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T32 reports unsupported, oversized, animated, and output-limited inputs with typed remedies', async ({
  page,
}) => {
  await page.goto('/upscale');
  const input = page.getByTestId('t32-file-input');
  await input.setInputFiles({
    name: 'not-an-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a PNG'),
  });
  await expect(page.getByTestId('t32-error')).toHaveAttribute(
    'data-error-kind',
    'unsupported-file',
  );

  await input.evaluate((element) => {
    const oversized = new File([new Uint8Array([0])], 'oversized.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { configurable: true, value: 32 * 1024 * 1024 + 1 });
    const transfer = new DataTransfer();
    transfer.items.add(oversized);
    const fileInput = element as HTMLInputElement;
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByTestId('t32-error')).toHaveAttribute('data-error-kind', 'file-too-large');
  await expect(page.getByTestId('t32-error')).toContainText('Choose a PNG smaller than 32 MiB');

  const animated = Buffer.from(await generatedPng(page));
  const animationChunk = Buffer.alloc(12);
  animationChunk.writeUInt32BE(0, 0);
  animationChunk.write('acTL', 4, 'ascii');
  const idat = animated.indexOf(Buffer.from('IDAT'));
  expect(idat).toBeGreaterThan(0);
  animated.set(animationChunk, idat - 4);
  await input.setInputFiles({ name: 'animated.png', mimeType: 'image/png', buffer: animated });
  await expect(page.getByTestId('t32-error')).toHaveAttribute(
    'data-error-kind',
    'unsupported-file',
  );
  await expect(page.getByTestId('t32-error')).toContainText('Animated PNG is not supported');

  await input.setInputFiles({
    name: 'factor-four-limit.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page, 600, 600),
  });
  await page.getByTestId('t32-factor').selectOption('4');
  await page.getByTestId('t32-run').click();
  await expect(page.getByTestId('t32-error')).toHaveAttribute(
    'data-error-kind',
    'output-too-large',
  );
  await expect(page.getByTestId('t32-error')).toContainText('Choose a lower scale factor');
});

test('T32 source and output dimension limits reject decompression and scale bombs before processing', async ({
  page,
}) => {
  await page.goto('/upscale');
  const oversizedDimensions = Buffer.from(await generatedPng(page));
  oversizedDimensions.writeUInt32BE(4_000, 16);
  oversizedDimensions.writeUInt32BE(4_000, 20);
  await page.getByTestId('t32-file-input').setInputFiles({
    name: 'source-too-large.png',
    mimeType: 'image/png',
    buffer: oversizedDimensions,
  });
  await expect(page.getByTestId('t32-error')).toHaveAttribute('data-error-kind', 'image-too-large');
  await expect(page.getByTestId('t32-error')).toContainText('12 megapixels');
});

test('T32 rejects an encoded PNG that exceeds the output-byte limit', async ({ page }) => {
  await page.goto('/upscale');
  await page.getByTestId('t32-file-input').setInputFiles({
    name: 'small.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      // Override only the reported size, avoiding a 32 MiB allocation in this boundary test.
      const oversized = new Blob([]);
      Object.defineProperty(oversized, 'size', { value: 32 * 1024 * 1024 + 1 });
      callback(oversized);
    };
  });
  await page.getByTestId('t32-run').click();
  await expect(page.getByTestId('t32-error')).toHaveAttribute(
    'data-error-kind',
    'output-too-large',
  );
  await expect(page.getByTestId('t32-error')).toContainText('Choose a lower scale factor');
});

test('T32 cancel terminates its active processing worker and reports a typed cancellation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const instrumentation = window as typeof window & {
      t32Posted?: boolean;
      t32Terminated?: boolean;
    };
    instrumentation.t32Posted = false;
    instrumentation.t32Terminated = false;
    class HangingWorker {
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage() {
        instrumentation.t32Posted = true;
      }
      terminate() {
        instrumentation.t32Terminated = true;
      }
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: HangingWorker });
  });
  await page.goto('/upscale');
  await page.getByTestId('t32-file-input').setInputFiles({
    name: 'cancel-me.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page, 12, 12),
  });
  await page.getByTestId('t32-run').click();
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { t32Posted?: boolean }).t32Posted))
    .toBe(true);
  await page.getByTestId('t32-cancel').click();
  await expect(page.getByTestId('t32-error')).toHaveAttribute('data-error-kind', 'cancelled');
  expect(
    await page.evaluate(
      () => (window as typeof window & { t32Terminated?: boolean }).t32Terminated,
    ),
  ).toBe(true);
  await expect(page.getByTestId('t32-run')).toBeEnabled();
});

test('T32 replacing the source settles the old worker task and allows a fresh upscale', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const instrumentation = window as typeof window & {
      t32WorkerCount?: number;
      t32TerminationCount?: number;
    };
    instrumentation.t32WorkerCount = 0;
    instrumentation.t32TerminationCount = 0;
    class ReplaceableWorker {
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      readonly id: number;
      constructor() {
        this.id = (instrumentation.t32WorkerCount ?? 0) + 1;
        instrumentation.t32WorkerCount = this.id;
      }
      postMessage(message: { width: number; height: number; factor: number }) {
        if (this.id === 1) return;
        const width = message.width * message.factor;
        const height = message.height * message.factor;
        queueMicrotask(() =>
          this.onmessage?.({
            data: { type: 'result', width, height, data: new ArrayBuffer(width * height * 4) },
          } as MessageEvent),
        );
      }
      terminate() {
        instrumentation.t32TerminationCount = (instrumentation.t32TerminationCount ?? 0) + 1;
      }
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: ReplaceableWorker });
  });
  await page.goto('/upscale');
  const input = page.getByTestId('t32-file-input');
  await input.setInputFiles({
    name: 'first.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page, 3, 2),
  });
  await page.getByTestId('t32-run').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { t32WorkerCount?: number }).t32WorkerCount),
    )
    .toBe(1);

  const replacementBytes = await generatedPng(page, 2, 2);
  await input.evaluate((element, base64) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const replacement = new File([bytes], 'replacement.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(replacement);
    const fileInput = element as HTMLInputElement;
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  }, replacementBytes.toString('base64'));
  await expect(page.getByTestId('t32-status')).toHaveText(
    'PNG ready. Choose a method and scale factor.',
  );
  await expect(page.getByTestId('t32-source-dimensions')).toContainText('2 × 2');
  expect(
    await page.evaluate(
      () => (window as typeof window & { t32TerminationCount?: number }).t32TerminationCount,
    ),
  ).toBeGreaterThan(0);

  await page.getByTestId('t32-run').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { t32WorkerCount?: number }).t32WorkerCount),
    )
    .toBe(2);
  await expect(page.getByTestId('t32-output-dimensions')).toContainText('4 × 4');
});

test('T32 keyboard users can choose an image, scale, and download the result', async ({ page }) => {
  await page.goto('/upscale');
  const input = page.getByTestId('t32-file-input');
  await focusWithTab(page, input);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (
    await chooserPromise
  ).setFiles({
    name: 'keyboard.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  const method = page.getByTestId('t32-method');
  await focusWithTab(page, method);
  await page.keyboard.press('ArrowDown');
  await expect(method).toHaveValue('nedi');
  const run = page.getByTestId('t32-run');
  await focusWithTab(page, run);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('t32-output-dimensions')).toContainText('6 × 4');
  const download = page.getByTestId('t32-download');
  await focusWithTab(page, download);
  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await downloadPromise).suggestedFilename()).toBe('keyboard-nedi-2x.png');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T32 keeps model delivery opt-in and uses the configured backup after a primary 403', async ({
  page,
  context,
}) => {
  const primaryUrl = 'https://primary.invalid/realesrgan-x2.onnx';
  const fallbackUrl = 'https://backup.invalid/realesrgan-x2.onnx';
  let primaryRequests = 0;
  let fallbackRequests = 0;
  await context.route('**/t32-runtime-config.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 1,
        tier2: {
          x2: {
            primaryUrlBase64: Buffer.from(primaryUrl).toString('base64'),
            fallbackUrlBase64: Buffer.from(fallbackUrl).toString('base64'),
          },
          x4: { primaryUrlBase64: '', fallbackUrlBase64: '' },
        },
      }),
    }),
  );
  await context.route(primaryUrl, async (route) => {
    primaryRequests += 1;
    await route.fulfill({ status: 403, body: 'model host unavailable' });
  });
  await context.route(fallbackUrl, async (route) => {
    fallbackRequests += 1;
    await route.fulfill({ status: 503, body: 'backup unavailable' });
  });

  await page.goto('/upscale');
  await expect(page.getByTestId('t32-tier2-download')).toBeVisible();
  expect(primaryRequests).toBe(0);
  expect(fallbackRequests).toBe(0);

  await page.getByTestId('t32-tier2-download').click();
  await expect(page.getByTestId('t32-tier2-error')).toContainText('HTTP 503');
  expect(primaryRequests).toBe(1);
  expect(fallbackRequests).toBe(1);
  await expect(page.getByTestId('t32-run')).toBeEnabled();
});
