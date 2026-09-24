import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function generatedPng(page: import('@playwright/test').Page, width = 16, height = 16) {
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
          image.data[offset] = (x * 17 + y * 3) % 256;
          image.data[offset + 1] = (x * 5 + y * 19) % 256;
          image.data[offset + 2] = (x * 23 + y * 7) % 256;
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated privacy fixture.');
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

async function openPrivacyRoute(
  page: import('@playwright/test').Page,
  locale: 'en' | 'en-XA' | 'ar',
  tool: 'blur-image' | 'redact',
) {
  const prefix = locale === 'en' ? '' : `/${locale}`;
  await page.goto(`${prefix}/${tool}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `https://image.complianttools.com${prefix}/${tool}`,
  );
  await expect(page.locator('link[rel="alternate"]')).toHaveCount(4);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await expect(page.locator('main')).toHaveAttribute('lang', locale);
  await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  if (locale === 'en-XA') await expect(page.locator('h1')).toContainText('⟦');
}

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  for (const tool of ['blur-image', 'redact'] as const) {
    test(`${locale}/${tool} exposes localized metadata and the local-only warning`, async ({
      page,
    }) => {
      await openPrivacyRoute(page, locale, tool);
      await expect(
        page.getByTestId(tool === 'blur-image' ? 't56-warning' : 't58-warning'),
      ).toBeVisible();
      await expect(page.locator('input[type="file"]')).toHaveCount(1);
    });
  }
}

test('T56 applies a selected rectangle locally and exports the changed PNG offline', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  await page.goto('/blur-image');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  const appOrigin = new URL(page.url()).origin;
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== appOrigin) externalRequests.push(request.url());
  });
  const source = await generatedPng(page);
  await page
    .getByTestId('t56-input')
    .setInputFiles({ name: 'privacy.png', mimeType: 'image/png', buffer: source });
  await expect(page.getByTestId('t56-canvas')).toBeVisible();
  const before = await page.getByTestId('t56-canvas').evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d');
    if (!context) throw new Error('Canvas context is unavailable.');
    return [...context.getImageData(4, 4, 1, 1).data];
  });
  await page.getByTestId('option-t56-effect').getByRole('button', { name: 'Solid fill' }).click();
  await page.getByTestId('t56-x').fill('0');
  await page.getByTestId('t56-y').fill('0');
  await page.getByTestId('t56-width').fill('8');
  await page.getByTestId('t56-height').fill('8');
  await page.getByTestId('t56-add').click();
  await expect(page.getByTestId('t56-status')).toContainText('1 region');
  const after = await page.getByTestId('t56-canvas').evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d');
    if (!context) throw new Error('Canvas context is unavailable.');
    return [...context.getImageData(4, 4, 1, 1).data];
  });
  expect(before).not.toEqual(after);
  expect(after).toEqual([0, 0, 0, 255]);
  await page.context().setOffline(true);
  try {
    const downloadEvent = page.waitForEvent('download');
    await page.getByTestId('t56-download').click();
    expect((await downloadEvent).suggestedFilename()).toBe('privacy-protected.png');
    expect(externalRequests).toEqual([]);
  } finally {
    await page.context().setOffline(false);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T58 requires confirmation and exports irreversible solid redaction locally', async ({
  page,
}) => {
  await page.goto('/redact');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  await page.getByTestId('t58-input').setInputFiles({
    name: 'sensitive.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  await page.getByTestId('t58-x').fill('0');
  await page.getByTestId('t58-y').fill('0');
  await page.getByTestId('t58-width').fill('8');
  await page.getByTestId('t58-height').fill('8');
  await page.getByTestId('t58-add').click();
  const noDownload = page.waitForEvent('download', { timeout: 500 }).catch(() => undefined);
  await page.getByTestId('t58-download').click();
  expect(await noDownload).toBeUndefined();
  await expect(page.getByTestId('t58-notice')).toContainText('Confirm destructive redaction');
  await page.getByTestId('t58-confirm').check();
  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId('t58-download').click();
  expect((await downloadEvent).suggestedFilename()).toBe('sensitive-redacted.png');
  const redacted = await page.getByTestId('t58-canvas').evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d');
    if (!context) throw new Error('Canvas context is unavailable.');
    return [...context.getImageData(4, 4, 1, 1).data];
  });
  expect(redacted).toEqual([0, 0, 0, 255]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T56 and T58 return actionable typed errors for non-PNG input', async ({ page }) => {
  for (const [path, testId] of [
    ['/blur-image', 't56-input'],
    ['/redact', 't58-input'],
  ] as const) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
    await page.getByTestId(testId).setInputFiles({
      name: 'not-an-image.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a PNG'),
    });
    await expect(page.getByRole('alert')).toHaveAttribute('data-error-kind', 'unsupported');
    await expect(page.getByRole('alert')).toContainText('Choose a valid PNG image');
  }
});
