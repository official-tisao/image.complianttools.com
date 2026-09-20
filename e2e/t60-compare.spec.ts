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
  await context.close();

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain('/compare</loc>');
});

test('T60 compares registered CC0 reference and JPEG fixtures locally', async ({ page }) => {
  const externalRequests: string[] = [];
  let origin = '';
  page.on('request', (request) => {
    if (!origin) return;
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });

  await page.goto('/compare');
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

  await expect(page.getByTestId('t60-results')).toBeVisible();
  await expect(page.getByTestId('t60-proxy-size')).toHaveText('Metrics proxy: 128 × 128');
  await expect(page.getByTestId('t60-verdict')).toHaveText('Nearly identical');
  await expect(page.getByTestId('t60-results')).toContainText('dB');
  await expect(page.getByTestId('compare-canvas')).toBeVisible();
  await expect(page.locator('.compare-stage .before')).toHaveJSProperty('naturalWidth', 128);
  await page.getByRole('button', { name: 'side', exact: true }).click();
  await expect(page.locator('.compare-stage')).toHaveAttribute('data-mode', 'side');
  await page.getByRole('button', { name: 'onion', exact: true }).click();
  await expect(page.locator('.compare-stage')).toHaveAttribute('data-mode', 'onion');
  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T60 withholds pixel metrics for different source dimensions but keeps the visual comparison', async ({
  page,
}) => {
  await page.goto('/compare');
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
