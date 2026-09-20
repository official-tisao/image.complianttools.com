import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function readBlobUrl(page: import('@playwright/test').Page, url: string): Promise<Buffer> {
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

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`T79 ${locale} route has localized prerendered page metadata and controls`, async ({
    page,
  }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/generate`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('t79-width')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com${prefix}/generate`,
    );
    await expect(page.locator('link[rel="alternate"]')).toHaveCount(4);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    expect(
      (await page.locator('meta[name="description"]').getAttribute('content'))?.length,
    ).toBeLessThanOrEqual(155);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
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
  origin = new URL(page.url()).origin;
  await page.getByTestId('t79-width').fill('64');
  await page.getByTestId('t79-height').fill('48');
  await page.getByTestId('t79-seed').fill('731');
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

  await page.getByTestId('t79-mode').selectOption('value-noise');
  await generate.click();
  await expect(page.getByTestId('t79-preview-image')).toHaveJSProperty('naturalWidth', 64);
  const valueNoiseUrl = await page.getByTestId('t79-preview-image').getAttribute('src');
  const valueNoiseBytes = await readBlobUrl(page, valueNoiseUrl!);
  expect(valueNoiseBytes).not.toEqual(previewBytes);
  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T79 radial gradient runs and oversized dimensions receive an accessible bound error', async ({
  page,
}) => {
  await page.goto('/ar/generate');
  await page.getByTestId('t79-mode').selectOption('radial-gradient');
  await expect(page.getByTestId('t79-seed')).toBeDisabled();
  await page.getByTestId('t79-width').fill('513');
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-error')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('t79-error')).toContainText('16');
  await expect(page.getByTestId('t79-error')).toContainText('512');
  await expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByTestId('t79-width').fill('32');
  await page.getByTestId('t79-generate').click();
  await expect(page.getByTestId('t79-preview-image')).toHaveJSProperty('naturalWidth', 32);
  await expect(page.getByTestId('t79-status')).toContainText('أُنشئت صورة PNG');
});

test('T79 localized markup is present without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/ar/generate');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('مولّد الصور الإجرائي');
  await expect(page.getByTestId('t79-generate')).toBeVisible();
  await context.close();
});
