import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function generatedPng(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
  first: readonly [number, number, number],
  second: readonly [number, number, number],
) {
  const base64 = await page.evaluate(
    async ({ width, height, first, second }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const color = (x + y) % 2 === 0 ? first : second;
          image.data[offset] = color[0];
          image.data[offset + 1] = color[1];
          image.data[offset + 2] = color[2];
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
    { width, height, first, second },
  );
  return Buffer.from(base64, 'base64');
}

async function generatedPair(page: import('@playwright/test').Page) {
  return {
    source: await generatedPng(page, 4, 2, [10, 20, 30], [50, 60, 70]),
    reference: await generatedPng(page, 3, 2, [100, 120, 140], [200, 220, 240]),
  };
}

async function pngWithAnimationControl(page: import('@playwright/test').Page) {
  const png = await generatedPng(page, 2, 2, [30, 50, 70], [90, 110, 130]);
  const idatType = png.indexOf(Buffer.from('IDAT'));
  if (idatType < 4) throw new Error('Generated PNG has no IDAT chunk.');
  const animationChunk = Buffer.alloc(20);
  animationChunk.writeUInt32BE(8, 0);
  animationChunk.write('acTL', 4, 'ascii');
  animationChunk.writeUInt32BE(1, 8);
  animationChunk.writeUInt32BE(0, 12);
  return Buffer.concat([png.subarray(0, idatType - 4), animationChunk, png.subarray(idatType - 4)]);
}

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`${locale}/color-match is prerendered with localized SEO content`, async ({ page }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/color-match`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(2);
    await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com${prefix}/color-match`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    await expect(page.locator('.t80-faq details')).toHaveCount(3);
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    expect(
      (await page.locator('meta[name="description"]').getAttribute('content'))?.length,
    ).toBeLessThanOrEqual(155);
    await expect(page.locator('main')).toHaveAttribute('lang', locale);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  });
}

test('T80 static Arabic HTML includes its tool content and FAQ without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/ar/color-match');
  await expect(page.locator('h1')).toHaveText('مطابقة الألوان');
  await expect(page.getByText('أسئلة حول هذه الأداة')).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(2);
  await context.close();
});

test('T80 locally matches a generated still-PNG pair and downloads the exact preview bytes', async ({
  page,
}) => {
  const outsideRequests: string[] = [];
  let appOrigin = '';
  await page.goto('/color-match');
  appOrigin = new URL(page.url()).origin;
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== appOrigin) outsideRequests.push(request.url());
  });

  const { source, reference } = await generatedPair(page);
  await page
    .getByTestId('t80-source-input')
    .setInputFiles({ name: 'source.png', mimeType: 'image/png', buffer: source });
  await page
    .getByTestId('t80-reference-input')
    .setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: reference });
  await expect(page.getByTestId('t80-run')).toBeEnabled();
  await page.getByRole('radio', { name: /Per-channel histogram matching/u }).check();
  await page.getByTestId('t80-run').click();

  await expect(page.getByTestId('t80-before')).toHaveJSProperty('naturalWidth', 4);
  await expect(page.getByTestId('t80-after')).toHaveJSProperty('naturalWidth', 4);
  await expect(page.getByRole('status')).toContainText('Preview ready');
  const outputUrl = await page.getByTestId('t80-after').getAttribute('src');
  expect(outputUrl).toMatch(/^blob:/u);
  const outputPixels = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url!;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
  }, outputUrl);
  const sourcePixels = Array.from({ length: 2 }, (_, y) =>
    Array.from({ length: 4 }, (_, x) => [
      ...((x + y) % 2 === 0 ? [10, 20, 30, 255] : [50, 60, 70, 255]),
    ]).flat(),
  ).flat();
  expect(outputPixels).not.toEqual(sourcePixels);
  const previewBytes = await page.evaluate(
    async (url) => Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer())),
    outputUrl,
  );
  const downloadWaiter = page.waitForEvent('download');
  await page.getByTestId('t80-download').click();
  const download = await downloadWaiter;
  expect(download.suggestedFilename()).toBe('source-color-matched.png');
  const downloadPath = await download.path();
  expect(await readFile(downloadPath!)).toEqual(Buffer.from(previewBytes));
  expect(outsideRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T80 matching controls work with the keyboard', async ({ page }) => {
  await page.goto('/color-match');
  const { source, reference } = await generatedPair(page);
  await page
    .getByTestId('t80-source-input')
    .setInputFiles({ name: 'source.png', mimeType: 'image/png', buffer: source });
  await page
    .getByTestId('t80-reference-input')
    .setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: reference });
  const histogram = page.getByRole('radio', { name: /Per-channel histogram matching/u });
  await histogram.focus();
  await page.keyboard.press('Space');
  await expect(histogram).toBeChecked();
  const run = page.getByTestId('t80-run');
  await run.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('t80-after')).toBeVisible();
});

test('T80 rejects unsupported, oversized, and animated PNG inputs with typed recovery messages', async ({
  page,
}) => {
  await page.goto('/color-match');
  const sourceInput = page.getByTestId('t80-source-input');
  await sourceInput.setInputFiles({
    name: 'not-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a PNG'),
  });
  await expect(page.getByRole('alert')).toHaveAttribute('data-error-kind', 'unsupported-file');
  await expect(page.getByRole('alert')).toContainText('Export the image as a still PNG');

  const valid = await generatedPng(page, 2, 2, [20, 30, 40], [80, 90, 100]);
  await sourceInput.setInputFiles({
    name: 'animated.png',
    mimeType: 'image/png',
    buffer: await pngWithAnimationControl(page),
  });
  await expect(page.getByRole('alert')).toHaveAttribute('data-error-kind', 'animated-image');
  await expect(page.getByRole('alert')).toContainText('Export one still frame');

  await sourceInput.evaluate((element) => {
    const file = new File([new Uint8Array([1])], 'oversized.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { configurable: true, value: 16 * 1024 * 1024 + 1 });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = element as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByRole('alert')).toHaveAttribute('data-error-kind', 'file-too-large');
  await expect(page.getByRole('alert')).toContainText('Choose a PNG smaller than 16 MiB');

  const tooManyPixels = Buffer.from(valid);
  tooManyPixels.writeUInt32BE(3_000, 16);
  tooManyPixels.writeUInt32BE(3_000, 20);
  await sourceInput.setInputFiles({
    name: 'large-dimensions.png',
    mimeType: 'image/png',
    buffer: tooManyPixels,
  });
  await expect(page.getByRole('alert')).toHaveAttribute('data-error-kind', 'image-too-large');
  await expect(page.getByRole('alert')).toContainText('6 megapixels');
});
