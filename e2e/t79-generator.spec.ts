import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const waitForHydration = (page: Page) => page.locator('html[data-hydrated="true"]').waitFor();

async function readBlobUrl(page: Page, url: string): Promise<Buffer> {
  const bytes = await page.evaluate(
    async (blobUrl) =>
      new Promise<number[]>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('GET', blobUrl);
        request.responseType = 'arraybuffer';
        request.onload = () => {
          if (!(request.response instanceof ArrayBuffer)) {
            reject(new Error('The generated preview did not return binary data.'));
            return;
          }
          resolve([...new Uint8Array(request.response)]);
        };
        request.onerror = () => reject(new Error('The generated preview could not be read.'));
        request.send();
      }),
    url,
  );
  return Buffer.from(bytes);
}

function control(page: Page, name: 'width' | 'height' | 'seed' | 'mode') {
  const option = page.getByTestId(`option-generator-${name}`);
  return name === 'mode' ? option : option.locator('input');
}

async function installFakeWorker(page: Page, behavior: 'throws-post' | 'error' | 'late-result') {
  await page.evaluate((kind) => {
    const fakeWorker = class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;

      postMessage() {
        if (kind === 'throws-post') throw new Error('mock postMessage failure');
        if (kind === 'error') {
          queueMicrotask(() => this.onerror?.(new ErrorEvent('error')));
          return;
        }
        (window as Window & { __t79EmitLateResult?: () => void }).__t79EmitLateResult = () => {
          this.onmessage?.({
            data: { type: 'error', kind: 'processing-failed' },
          } as MessageEvent);
        };
      }

      terminate() {
        (window as Window & { __t79WorkerTerminated?: boolean }).__t79WorkerTerminated = true;
      }
    };
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: fakeWorker,
    });
  }, behavior);
}

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`T79 ${locale} route has localized prerendered discovery content`, async ({ page }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/generate`);
    await waitForHydration(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(control(page, 'width')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com${prefix}/generate`,
    );
    await expect(page.locator('link[rel="alternate"]')).toHaveCount(4);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/og\/tools\.svg$/u,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', /.+/u);
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    expect(
      (await page.locator('meta[name="description"]').getAttribute('content'))?.length,
    ).toBeLessThanOrEqual(155);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(
      page.getByRole('heading', {
        name: locale === 'ar' ? 'أسئلة حول هذه الأداة' : /Questions about this tool/u,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: locale === 'ar' ? 'أدوات ذات صلة' : /Related tools/u })
        .getByRole('link'),
    ).toHaveCount(2);

    const graph = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    ) as {
      '@graph': Array<{ '@type': string; mainEntity?: unknown[] }>;
    };
    expect(graph['@graph'].map((entry) => entry['@type'])).toEqual([
      'SoftwareApplication',
      'FAQPage',
      'BreadcrumbList',
    ]);
    expect(graph['@graph'][1]?.mainEntity).toHaveLength(3);
  });
}

test('T79 seeded noise preview and downloaded PNG use stable local bytes', async ({ page }) => {
  const externalRequests: string[] = [];
  let origin = '';
  page.on('request', (request) => {
    if (!origin) return;
    const url = new URL(request.url());
    if (url.origin !== origin) externalRequests.push(url.href);
  });

  await page.goto('/generate');
  await waitForHydration(page);
  origin = new URL(page.url()).origin;
  await control(page, 'width').fill('64');
  await control(page, 'height').fill('48');
  await control(page, 'seed').fill('731');
  const valueNoiseChoice = control(page, 'mode').getByRole('button', {
    name: 'Value noise (seeded)',
  });
  await valueNoiseChoice.focus();
  await page.keyboard.press('Enter');
  await expect(valueNoiseChoice).toHaveAttribute('aria-pressed', 'true');
  await control(page, 'mode').getByRole('button', { name: 'Fractal noise (seeded)' }).click();
  const generate = page.getByTestId('t79-generate');
  await generate.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('t79-preview-image')).toHaveJSProperty('naturalWidth', 64);
  await expect(page.getByTestId('t79-preview-image')).toHaveJSProperty('naturalHeight', 48);
  await expect(page.getByTestId('t79-status')).toContainText(
    'Created a 64 × 48 pixel PNG locally.',
  );

  const previewUrl = await page.getByTestId('t79-preview-image').getAttribute('src');
  expect(previewUrl).toMatch(/^blob:/u);
  const previewBytes = await readBlobUrl(page, previewUrl!);
  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId('t79-download').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('procedural-fbm.png');
  const downloadPath = await download.path();
  expect(await readFile(downloadPath!)).toEqual(previewBytes);

  await generate.click();
  await expect(page.getByTestId('t79-preview-image')).toHaveJSProperty('naturalWidth', 64);
  const repeatedUrl = await page.getByTestId('t79-preview-image').getAttribute('src');
  const repeatedBytes = await readBlobUrl(page, repeatedUrl!);
  expect(repeatedBytes).toEqual(previewBytes);

  await control(page, 'mode').getByRole('button', { name: 'Value noise (seeded)' }).click();
  await generate.click();
  await expect(page.getByTestId('t79-preview-image')).toHaveJSProperty('naturalWidth', 64);
  const valueNoiseUrl = await page.getByTestId('t79-preview-image').getAttribute('src');
  const valueNoiseBytes = await readBlobUrl(page, valueNoiseUrl!);
  expect(valueNoiseBytes).not.toEqual(previewBytes);
  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T79 radial gradient runs and generated controls reject unsupported dimensions and seeds', async ({
  page,
}) => {
  await page.goto('/ar/generate');
  await waitForHydration(page);
  await control(page, 'mode').getByRole('button', { name: 'تدرج شعاعي' }).click();
  await expect(page.getByText('لا يستخدم التدرج الشعاعي البذرة.')).toBeVisible();

  for (const [name, value] of [
    ['width', '15'],
    ['width', '513'],
    ['height', '16.5'],
    ['seed', '2147483648'],
  ] as const) {
    await control(page, name).fill(value);
    await page.getByTestId('t79-generate').click();
    await expect(page.getByTestId('t79-error')).toHaveAttribute(
      'data-error-kind',
      'invalid-options',
    );
  }

  await control(page, 'width').fill('32');
  await control(page, 'height').fill('32');
  await control(page, 'seed').fill('42');
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-preview-image')).toHaveJSProperty('naturalWidth', 32);
  await expect(page.getByTestId('t79-status')).toContainText('أُنشئت صورة PNG');
  await expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T79 localized markup is present without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/ar/generate');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('مولّد الصور الإجرائي');
  await expect(page.getByTestId('t79-generate')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'أسئلة حول هذه الأداة' })).toBeVisible();
  await context.close();
});

test('T79 reports worker-construction, postMessage, and worker-runtime errors with remedies', async ({
  page,
}) => {
  await page.goto('/generate');
  await waitForHydration(page);
  await page.evaluate(() => {
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: class {
        constructor() {
          throw new Error('mock constructor failure');
        }
      },
    });
  });
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-error')).toHaveAttribute(
    'data-error-kind',
    'worker-unavailable',
  );
  await expect(page.getByTestId('t79-error')).toContainText('supports module workers');

  await page.reload();
  await waitForHydration(page);
  await installFakeWorker(page, 'throws-post');
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-error')).toHaveAttribute('data-error-kind', 'worker-failed');
  await expect(page.getByTestId('t79-error')).toContainText('Reload the page');

  await page.reload();
  await waitForHydration(page);
  await installFakeWorker(page, 'error');
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-error')).toHaveAttribute('data-error-kind', 'worker-failed');
  await expect(page.getByTestId('t79-error')).toContainText('Reload the page');
});

test('T79 reports Canvas and PNG encoding failures with specific remedies', async ({ page }) => {
  await page.goto('/generate');
  await waitForHydration(page);
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-error')).toHaveAttribute(
    'data-error-kind',
    'canvas-unavailable',
  );
  await expect(page.getByTestId('t79-error')).toContainText('Canvas 2D support');

  await page.reload();
  await waitForHydration(page);
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = ((callback: BlobCallback) =>
      callback(null)) as typeof HTMLCanvasElement.prototype.toBlob;
  });
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-error')).toHaveAttribute(
    'data-error-kind',
    'png-encoding-failed',
  );
  await expect(page.getByTestId('t79-error')).toContainText('smaller dimensions');
});

test('T79 cancellation terminates the worker and ignores a late message', async ({ page }) => {
  await page.goto('/generate');
  await waitForHydration(page);
  await installFakeWorker(page, 'late-result');
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-cancel')).toBeVisible();
  await page.getByTestId('t79-cancel').click();
  await expect(page.getByTestId('t79-error')).toHaveAttribute('data-error-kind', 'cancelled');
  await expect(page.getByTestId('t79-error')).toContainText('Choose Generate preview');
  expect(
    await page.evaluate(
      () => (window as Window & { __t79WorkerTerminated?: boolean }).__t79WorkerTerminated,
    ),
  ).toBe(true);
  await page.evaluate(() =>
    (window as Window & { __t79EmitLateResult?: () => void }).__t79EmitLateResult?.(),
  );
  await expect(page.getByTestId('t79-error')).toHaveAttribute('data-error-kind', 'cancelled');
});

test('T79 generates after its worker is warmed and the page is offline', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The route offline check is recorded on Chromium.');
  const externalRequests: string[] = [];
  let origin = '';
  page.on('request', (request) => {
    if (origin && new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  await page.goto('/generate');
  await waitForHydration(page);
  origin = new URL(page.url()).origin;
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-preview-image')).toBeVisible();
  await page.context().setOffline(true);
  await control(page, 'seed').fill('99');
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-preview-image')).toBeVisible();
  await expect(page.getByTestId('t79-error')).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('T79 measures route preview latency at maximum supported dimensions', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The route latency budget is recorded on Chromium.');
  await page.goto('/generate');
  await waitForHydration(page);
  await control(page, 'width').fill('512');
  await control(page, 'height').fill('512');
  const startedAt = await page.evaluate(() => performance.now());
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-preview-image')).toHaveJSProperty('naturalWidth', 512);
  const durationMs = await page.evaluate((start) => performance.now() - start, startedAt);
  expect(durationMs).toBeLessThan(3000);
});
