import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function generatedPng(page: Page, width = 4, height = 2) {
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
          image.data[offset] = x < width / 2 ? 240 : 20;
          image.data[offset + 1] = (x * 53 + y * 31) % 256;
          image.data[offset + 2] = (x * 17 + y * 89) % 256;
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated T27 fixture.');
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

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`${locale}/smart-crop is prerendered with localized SEO`, async ({ page }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/smart-crop`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('t27-file-input')).toHaveCount(1);
    await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com${prefix}/smart-crop`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  });
}

test('T27 uses local center, thirds, and approximate saliency crops and the PNG download matches its preview', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  let origin = '';
  page.on('request', (request) => {
    if (origin && new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  await page.goto('/smart-crop');
  origin = new URL(page.url()).origin;
  await page.getByTestId('t27-file-input').setInputFiles({
    name: 'pattern.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  await expect(page.getByTestId('t27-selected')).toContainText('4 × 2');

  await page.getByTestId('t27-run').click();
  await expect(page.getByTestId('t27-output-dimensions')).toContainText('2 × 2');
  await expect(page.getByTestId('t27-crop-box')).toHaveAttribute('data-x', '1');
  await expect(page.getByTestId('t27-output')).toHaveJSProperty('naturalWidth', 2);

  for (const method of ['thirds', 'saliency'] as const) {
    await page
      .getByRole('radio', {
        name: new RegExp(method === 'thirds' ? 'Rule-of-thirds' : 'Visual-saliency', 'u'),
      })
      .check();
    await page.getByTestId('t27-run').click();
    await expect(page.getByTestId('t27-output')).toBeVisible();
    await expect(page.getByTestId('t27-crop-box')).toBeVisible();
  }

  const previewUrl = await page.getByTestId('t27-output').getAttribute('src');
  expect(previewUrl).toMatch(/^blob:/u);
  const previewBytes = await page.evaluate(
    async (url) => Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer())),
    previewUrl,
  );
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('t27-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pattern-crop.png');
  expect(await readFile((await download.path())!)).toEqual(Buffer.from(previewBytes));
  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T27 rejects unsupported and dimension-bomb inputs before processing', async ({ page }) => {
  await page.goto('/smart-crop');
  const input = page.getByTestId('t27-file-input');
  await input.setInputFiles({
    name: 'not-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByTestId('t27-error')).toHaveAttribute(
    'data-error-kind',
    'unsupported-file',
  );

  const tooLarge = await generatedPng(page);
  tooLarge.writeUInt32BE(4_000, 16);
  tooLarge.writeUInt32BE(4_000, 20);
  await input.setInputFiles({
    name: 'dimensions-too-large.png',
    mimeType: 'image/png',
    buffer: tooLarge,
  });
  await expect(page.getByTestId('t27-error')).toHaveAttribute('data-error-kind', 'image-too-large');
  await expect(page.getByTestId('t27-error')).toContainText('12 megapixels');
});

test('T27 static HTML exposes the local crop tool without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/smart-crop');
  await expect(page.locator('h1')).toHaveText('Smart Crop');
  await expect(page.getByTestId('t27-file-input')).toBeVisible();
  await expect(page.getByTestId('t27-run')).toBeDisabled();
  await context.close();
});
