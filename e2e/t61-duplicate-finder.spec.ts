import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function generatedPng(
  page: import('@playwright/test').Page,
  options: { width?: number; height?: number; variation?: number } = {},
) {
  const { width = 24, height = 16, variation = 0 } = options;
  const base64 = await page.evaluate(
    async ({ width, height, variation }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const base = (x * 11 + y * 7) % 180;
          image.data[offset] = Math.min(255, base + variation);
          image.data[offset + 1] = (x * 5 + y * 13) % 210;
          image.data[offset + 2] = (x * 3 + y * 9) % 170;
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
    { width, height, variation },
  );
  return Buffer.from(base64, 'base64');
}

test('T61 default route is prerendered with local-only upload copy and SEO metadata', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/find-duplicates');
  await expect(page.locator('h1')).toHaveText('Find Duplicate Images');
  await expect(page.locator('main')).toHaveAttribute('lang', 'en-XA');
  await expect(page.getByText('Files stay on your device. Images are not uploaded.')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://image.complianttools.com/find-duplicates',
  );
  await context.close();
});

test('T61 localized Arabic route is prerendered right-to-left with translated content', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/ar/find-duplicates');
  await expect(page.locator('h1')).toHaveText('العثور على الصور المكررة');
  await expect(page.locator('main')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('تبقى الملفات على جهازك. لا يتم رفع الصور.')).toBeVisible();
  await context.close();
});

test('T61 finds exact copies and conservative near matches locally; review CSV does not delete files', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  let origin = '';
  page.on('request', (request) => {
    if (origin && new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });

  await page.goto('/find-duplicates');
  origin = new URL(page.url()).origin;
  const first = await generatedPng(page);
  const slightlyChanged = await generatedPng(page, { variation: 1 });
  await page.getByTestId('t61-input').setInputFiles([
    { name: 'scan-original.png', mimeType: 'image/png', buffer: first },
    { name: 'scan-copy.png', mimeType: 'image/png', buffer: first },
    { name: 'scan-adjusted.png', mimeType: 'image/png', buffer: slightlyChanged },
  ]);
  await expect(page.getByTestId('t61-selection')).toContainText('3');
  await page.getByTestId('t61-scan').click();

  await expect(page.getByTestId('t61-exact-group')).toHaveCount(1);
  await expect(page.getByTestId('t61-exact-group')).toContainText('scan-original.png');
  await expect(page.getByTestId('t61-exact-group')).toContainText('scan-copy.png');
  await expect(page.getByTestId('t61-near-pair').first()).toBeVisible();
  await expect(page.getByTestId('t61-report')).toBeVisible();
  await page.getByTestId('t61-near-pair').first().getByRole('radio').nth(1).check();
  await expect(page.getByTestId('t61-near-pair').first()).toContainText('Review for removal');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('t61-report').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('duplicate-review.csv');
  await expect(page.getByText('This page never deletes or changes your original files.')).toBeVisible();
  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T61 reports bounded-input and decode errors with actionable remedies', async ({ page }) => {
  await page.goto('/find-duplicates');
  const input = page.getByTestId('t61-input');
  await input.setInputFiles(
    Array.from({ length: 25 }, (_, index) => ({
      name: `image-${index}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from([index]),
    })),
  );
  await expect(page.getByTestId('t61-error')).toContainText('Choose no more than 24 images.');
  await expect(page.getByTestId('t61-error')).toContainText('Remedy: Split the selection');

  await input.setInputFiles([
    { name: 'invalid-a.png', mimeType: 'image/png', buffer: Buffer.from('not a png') },
    { name: 'invalid-b.png', mimeType: 'image/png', buffer: Buffer.from('not a png either') },
  ]);
  await page.getByTestId('t61-scan').click();
  await expect(page.getByTestId('t61-error')).toContainText('The browser could not read one');
  await expect(page.getByTestId('t61-error')).toContainText('Remedy: Re-export that file');
});

test('T61 supports keyboard operation and cancellation without uploading inputs', async ({ page }) => {
  await page.addInitScript(() => {
    const subtle = crypto.subtle as any;
    const nativeDigest = subtle.digest.bind(subtle);
    subtle.digest = (...args: any[]) =>
      new Promise((resolve, reject) => {
        window.setTimeout(() => nativeDigest(...args).then(resolve, reject), 750);
      });
  });
  await page.goto('/find-duplicates');
  const input = page.getByTestId('t61-input');
  await input.focus();
  await expect(input).toBeFocused();
  await input.setInputFiles([
    { name: 'cancel-a.png', mimeType: 'image/png', buffer: await generatedPng(page) },
    { name: 'cancel-b.png', mimeType: 'image/png', buffer: await generatedPng(page, { variation: 1 }) },
  ]);
  await page.getByTestId('t61-scan').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('t61-status')).toBeVisible();
  await page.getByTestId('t61-cancel').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('t61-error')).toContainText('The scan was cancelled.');
  await expect(page.getByTestId('t61-error')).toContainText('Remedy: Choose images');
});
