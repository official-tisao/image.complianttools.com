import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function generatedPng(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
  pattern: 'textured' | 'uniform' = 'textured',
) {
  const base64 = await page.evaluate(
    async ({ width, height, pattern }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const value =
            pattern === 'uniform' ? 128 : 18 + ((x * 17 + y * 31 + Math.floor((x * y) / 7)) % 220);
          image.data[offset] = value;
          image.data[offset + 1] = pattern === 'uniform' ? value : 18 + ((value + x * 3) % 220);
          image.data[offset + 2] = pattern === 'uniform' ? value : 18 + ((value + y * 5) % 220);
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated PNG fixture.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      }
      return btoa(binary);
    },
    { width, height, pattern },
  );
  return Buffer.from(base64, 'base64');
}

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`${locale}/adaptive-resize is prerendered with localized SEO content`, async ({ page }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/adaptive-resize`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com${prefix}/adaptive-resize`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    await expect(page.locator('.t81-faq details')).toHaveCount(3);
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    expect(
      (await page.locator('meta[name="description"]').getAttribute('content'))?.length,
    ).toBeLessThanOrEqual(155);
    await expect(page.locator('main')).toHaveAttribute('lang', locale);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  });
}

test('T81 static Arabic HTML includes its localized tool content without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/ar/adaptive-resize');
  await expect(page.locator('h1')).toHaveText('تغيير الحجم التكيفي');
  await expect(page.getByText('هل يستخدم هذا الأسلوب نحت المسارات؟')).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(1);
  await context.close();
});

test('T81 retargets a generated PNG, paints an approximate mask, and downloads the preview', async ({
  page,
}) => {
  await page.goto('/adaptive-resize');
  const appOrigin = new URL(page.url()).origin;
  const outsideRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== appOrigin) outsideRequests.push(request.url());
  });
  const png = await generatedPng(page, 48, 40);
  await page
    .getByTestId('t81-input')
    .setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByTestId('t81-run')).toBeEnabled();
  await page.getByTestId('option-t81-width').locator('input[type="number"]').fill('38');
  await page.getByTestId('option-t81-height').locator('input[type="number"]').fill('30');
  await page.getByTestId('option-t81-protectEnabled').locator('input[type="checkbox"]').check();

  const canvas = page.getByTestId('t81-mask-canvas');
  await expect(canvas).toHaveAttribute('width', '48');
  await expect(canvas).toHaveAttribute('height', '40');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('The protection mask canvas is not visible.');
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  const beforeKeyboardMark = Number(
    (await page.locator('.t81-mask-actions').textContent())?.match(/\d+/u)?.[0] ?? 0,
  );
  await canvas.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  const afterKeyboardMark = Number(
    (await page.locator('.t81-mask-actions').textContent())?.match(/\d+/u)?.[0] ?? 0,
  );
  expect(afterKeyboardMark).toBeGreaterThan(beforeKeyboardMark);

  await page.getByTestId('t81-run').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('t81-before')).toHaveJSProperty('naturalWidth', 48);
  await expect(page.getByTestId('t81-after')).toHaveJSProperty('naturalWidth', 38);
  await expect(page.getByTestId('t81-after')).toHaveJSProperty('naturalHeight', 30);
  await expect(page.getByRole('status')).toContainText('Preview ready');

  const outputUrl = await page.getByTestId('t81-after').getAttribute('src');
  expect(outputUrl).toMatch(/^blob:/u);
  const previewBytes = await page.evaluate(
    async (url) => Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer())),
    outputUrl,
  );
  const downloadWaiter = page.waitForEvent('download');
  await page.getByTestId('t81-download').click();
  const download = await downloadWaiter;
  expect(download.suggestedFilename()).toBe('fixture-adaptive-resized.png');
  const downloadPath = await download.path();
  expect(await readFile(downloadPath!)).toEqual(Buffer.from(previewBytes));
  expect(outsideRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T81 reports the unchanged-image fallback for a uniform saliency profile', async ({
  page,
}) => {
  await page.goto('/adaptive-resize');
  const png = await generatedPng(page, 32, 24, 'uniform');
  await page
    .getByTestId('t81-input')
    .setInputFiles({ name: 'uniform.png', mimeType: 'image/png', buffer: png });
  await page.getByTestId('option-t81-width').locator('input[type="number"]').fill('24');
  await page.getByTestId('option-t81-height').locator('input[type="number"]').fill('18');
  await page.getByTestId('t81-run').click();
  await expect(page.getByRole('status')).toContainText(
    'engine returned the original image unchanged',
  );
  await expect(page.getByTestId('t81-after')).toHaveCount(0);
  await expect(page.getByTestId('t81-download')).toHaveCount(0);
});

test('T81 rejects invalid dimensions and an over-constrained painted mask with recovery advice', async ({
  page,
}) => {
  await page.goto('/adaptive-resize');
  const png = await generatedPng(page, 48, 40);
  await page
    .getByTestId('t81-input')
    .setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: png });
  await page.getByTestId('option-t81-width').locator('input[type="number"]').fill('0');
  await page.getByTestId('t81-run').click();
  await expect(page.getByRole('alert')).toHaveAttribute('data-error-kind', 'invalid-dimensions');
  await expect(page.getByRole('alert')).toContainText('Set both target dimensions');

  await page.getByTestId('option-t81-width').locator('input[type="number"]').fill('1');
  await page.getByTestId('option-t81-height').locator('input[type="number"]').fill('1');
  await page.getByTestId('option-t81-protectEnabled').locator('input[type="checkbox"]').check();
  const canvas = page.getByTestId('t81-mask-canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('The protection mask canvas is not visible.');
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await page.getByTestId('t81-run').click();
  await expect(page.getByRole('alert')).toHaveAttribute('data-error-kind', 'mask-does-not-fit');
  await expect(page.getByRole('alert')).toContainText(
    'Increase the target size or clear/reduce the protected area',
  );
});
