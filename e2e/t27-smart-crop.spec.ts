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

async function generatedSolidPng(page: Page, width: number, height: number) {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.fillStyle = '#526c80';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#ded6c8';
      context.fillRect(width / 4, height / 3, width / 3, height / 4);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the large T27 fixture.');
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

const localizedControlNames = {
  en: {
    aspect: 'Crop aspect ratio',
    originalRatio: 'Original ratio',
    placement: 'Crop placement',
    thirds: 'Rule-of-thirds placement',
  },
  'en-XA': {
    aspect: '⟦Crôp áspëct rátïô⟧',
    originalRatio: '⟦ôrïgïnál rátïô⟧',
    placement: '⟦Crôp plácëmënt⟧',
    thirds: '⟦Rülë-ôf-thïrds plácëmënt⟧',
  },
  ar: {
    aspect: 'نسبة أبعاد الاقتصاص',
    originalRatio: 'النسبة الأصلية',
    placement: 'موضع الاقتصاص',
    thirds: 'موضع وفق قاعدة الأثلاث',
  },
} as const;

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`${locale}/smart-crop is prerendered with localized SEO`, async ({ page }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/smart-crop`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('t27-file-input')).toHaveCount(1);
    await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com${prefix}/smart-crop`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    const ratio = page.getByLabel(localizedControlNames[locale].aspect);
    await expect(ratio).toHaveValue('original');
    await expect(ratio.locator('option').first()).toHaveText(
      localizedControlNames[locale].originalRatio,
    );
    const placement = page.getByRole('group', { name: localizedControlNames[locale].placement });
    const thirds = placement.getByRole('button', {
      name: localizedControlNames[locale].thirds,
      exact: true,
    });
    await thirds.focus();
    await page.keyboard.press('Enter');
    await expect(thirds).toHaveAttribute('aria-pressed', 'true');
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
  await expect(page.getByLabel('Crop aspect ratio')).toHaveValue('original');

  await page.getByTestId('t27-run').click();
  await expect(page.getByTestId('t27-output-dimensions')).toContainText('4 × 2');
  await expect(page.getByTestId('t27-crop-box')).toHaveAttribute('data-x', '0');
  await expect(page.getByTestId('t27-output')).toHaveJSProperty('naturalWidth', 4);

  await page.getByLabel('Crop aspect ratio').selectOption('square');
  await page.getByTestId('t27-run').click();
  await expect(page.getByTestId('t27-output-dimensions')).toContainText('2 × 2');
  await expect(page.getByTestId('t27-crop-box')).toHaveAttribute('data-x', '1');
  await expect(page.getByTestId('t27-output')).toHaveJSProperty('naturalWidth', 2);

  for (const [index, method] of ['thirds', 'saliency'].entries()) {
    const option = page.getByRole('button', {
      name: new RegExp(method === 'thirds' ? 'Rule-of-thirds' : 'Visual-saliency', 'u'),
    });
    if (index === 0) {
      await option.focus();
      await page.keyboard.press('Enter');
    } else {
      await option.click();
    }
    await expect(option).toHaveAttribute('aria-pressed', 'true');
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
  await page.waitForLoadState('networkidle');
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

  await input.setInputFiles({
    name: 'oversized.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await expect(page.getByTestId('t27-error')).toHaveAttribute('data-error-kind', 'file-too-large');

  await input.setInputFiles({
    name: 'malformed.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a PNG image'),
  });
  await expect(page.getByTestId('t27-error')).toHaveAttribute('data-error-kind', 'invalid-image');

  const animated = await generatedPng(page);
  const animationControl = Buffer.alloc(16);
  animationControl.writeUInt32BE(8, 0);
  animationControl.write('acTL', 4);
  animationControl.writeUInt32BE(1, 8);
  await input.setInputFiles({
    name: 'animated.png',
    mimeType: 'image/png',
    buffer: Buffer.concat([animated.subarray(0, 33), animationControl, animated.subarray(33)]),
  });
  await expect(page.getByTestId('t27-error')).toHaveAttribute('data-error-kind', 'animated-image');

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

test('T27 gives actionable errors for decode, canvas, and export failures', async ({ page }) => {
  const fixture = await generatedPng(page);
  const chooseFixture = async () => {
    await page.getByTestId('t27-file-input').setInputFiles({
      name: 'error-fixture.png',
      mimeType: 'image/png',
      buffer: fixture,
    });
    await expect(page.getByTestId('t27-selected')).toBeVisible();
  };

  await page.goto('/smart-crop');
  await page.waitForLoadState('networkidle');
  await chooseFixture();
  await page.evaluate(() => {
    Object.defineProperty(window, 'createImageBitmap', {
      configurable: true,
      value: async () => {
        throw new Error('mock decoder rejection');
      },
    });
  });
  await page.getByTestId('t27-run').click();
  await expect(page.getByTestId('t27-error')).toHaveAttribute('data-error-kind', 'decode-failed');
  await expect(page.getByTestId('t27-error')).toContainText('Try this');

  await page.reload();
  await page.waitForLoadState('networkidle');
  await chooseFixture();
  await page.evaluate(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
  });
  await page.getByTestId('t27-run').click();
  await expect(page.getByTestId('t27-error')).toHaveAttribute(
    'data-error-kind',
    'canvas-unavailable',
  );

  await page.reload();
  await page.waitForLoadState('networkidle');
  await chooseFixture();
  await page.evaluate(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: (callback: BlobCallback) =>
        callback(new Blob([new Uint8Array(24 * 1024 * 1024 + 1)], { type: 'image/png' })),
    });
  });
  await page.getByTestId('t27-run').click();
  await expect(page.getByTestId('t27-error')).toHaveAttribute(
    'data-error-kind',
    'output-too-large',
  );

  await page.reload();
  await page.waitForLoadState('networkidle');
  await chooseFixture();
  await page.evaluate(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: (callback: BlobCallback) => callback(null),
    });
  });
  await page.getByTestId('t27-run').click();
  await expect(page.getByTestId('t27-error')).toHaveAttribute(
    'data-error-kind',
    'processing-failed',
  );
});

test('T27 measures local crop preview latency at the 12 MP input limit', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The route latency budget is recorded on Chromium.');
  const fixture = await generatedSolidPng(page, 4_000, 3_000);
  await page.goto('/smart-crop');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('t27-file-input').setInputFiles({
    name: 't27-12mp.png',
    mimeType: 'image/png',
    buffer: fixture,
  });
  await expect(page.getByTestId('t27-selected')).toBeVisible();
  await page.getByLabel('Crop aspect ratio').selectOption('square');
  const startedAt = await page.evaluate(() => performance.now());
  await page.getByTestId('t27-run').click();
  await expect(page.getByTestId('t27-output')).toBeVisible();
  const durationMs = await page.evaluate((start) => performance.now() - start, startedAt);
  console.log(`T27 12 MP square preview: ${durationMs.toFixed(1)} ms`);
  expect(durationMs).toBeLessThanOrEqual(3_000);
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
