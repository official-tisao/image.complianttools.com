import { expect, test } from '@playwright/test';

async function pngFixture(page: import('@playwright/test').Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.fillStyle = '#ef1808';
    context.fillRect(0, 0, 16, 16);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
        'image/png',
      ),
    );
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  return Buffer.from(bytes);
}

async function uploadAndRead(
  page: import('@playwright/test').Page,
  name: string,
  mimeType: string,
  buffer: Buffer,
) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({ name, mimeType, buffer });
  const download = await downloadPromise;
  return Buffer.concat(await (await download.createReadStream()).toArray());
}

test('encodes lossy and lossless AVIF then decodes the real output to PNG locally', async ({
  page,
  context,
}) => {
  const crossOrigin: string[] = [];
  const localRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173' && url.protocol !== 'blob:')
      crossOrigin.push(request.url());
    if (url.origin === 'http://127.0.0.1:4173') localRequests.push(url.pathname);
  });
  await page.goto('/avif-converter');
  await page.waitForLoadState('networkidle');
  expect(localRequests.some((path) => /avif_enc|avif-encode/u.test(path))).toBe(false);
  const png = await pngFixture(page);

  await page.getByRole('button', { name: 'Image to AVIF' }).click();
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Encoding speed value' }).fill('10');
  await page.getByRole('button', { name: '4:4:4' }).click();
  await page.getByRole('spinbutton', { name: 'Bit depth' }).fill('10');
  const lossy = await uploadAndRead(page, 'red.png', 'image/png', png);
  await expect(page.getByRole('status').last()).toContainText('Created lossy quality 50');
  expect(lossy.subarray(4, 8).toString('ascii')).toBe('ftyp');
  expect(lossy.subarray(8, 32).toString('ascii')).toMatch(/avi[fs]/u);
  expect(localRequests.some((path) => /avif_enc|avif-encode/u.test(path))).toBe(true);

  await page.getByLabel('Use lossless encoding').check();
  const lossless = await uploadAndRead(page, 'red.png', 'image/png', png);
  await expect(page.getByRole('status').last()).toContainText('Created lossless');
  expect(lossless.subarray(4, 8).toString('ascii')).toBe('ftyp');
  const previewBytes = await page.evaluate(async () => {
    const image = document.querySelector('img[alt="Exact converted output preview"]');
    if (!(image instanceof HTMLImageElement)) throw new Error('AVIF preview is missing.');
    return [...new Uint8Array(await (await fetch(image.src)).arrayBuffer())];
  });
  expect(Buffer.from(previewBytes)).toEqual(lossless);

  await page.getByRole('button', { name: 'AVIF to PNG' }).click();
  const decodedPng = await uploadAndRead(page, 'red.avif', 'image/avif', lossless);
  await expect(page.getByRole('status').last()).toContainText('AVIF image to PNG locally');
  expect(decodedPng.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const decodedPreviewBytes = await page.evaluate(async () => {
    const image = document.querySelector('img[alt="Exact converted output preview"]');
    if (!(image instanceof HTMLImageElement)) throw new Error('PNG preview is missing.');
    return [...new Uint8Array(await (await fetch(image.src)).arrayBuffer())];
  });
  expect(Buffer.from(decodedPreviewBytes)).toEqual(decodedPng);
  const pixel = await page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable.');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return [...context.getImageData(0, 0, 1, 1).data];
    },
    [...decodedPng],
  );
  expect(pixel).toEqual([239, 24, 8, 255]);
  await context.setOffline(true);
  const offlineDecodedPng = await uploadAndRead(page, 'offline-red.avif', 'image/avif', lossless);
  expect(offlineDecodedPng.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  await context.setOffline(false);
  expect(crossOrigin).toEqual([]);
});

test('AVIF direction and encoding controls are keyboard operable', async ({ page }) => {
  await page.goto('/avif-converter');
  await page.waitForLoadState('networkidle');
  const directions = page.getByTestId('option-avif-direction').locator('.segments button');
  await directions.first().focus();
  await page.keyboard.press('Tab');
  await expect(directions.nth(1)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(directions.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Use lossless encoding')).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} AVIF route exports exact preview bytes with locale layout`, async ({ page }) => {
    await page.goto(`/${locale}/avif-converter`);
    await page.waitForLoadState('networkidle');
    const png = await pngFixture(page);
    await page.getByTestId('option-avif-direction').locator('.segments button').nth(1).click();
    const avif = await uploadAndRead(page, `${locale}.png`, 'image/png', png);
    expect(avif.subarray(4, 8).toString('ascii')).toBe('ftyp');
    const preview = page.locator('figure img');
    await expect(preview).toBeVisible();
    const previewUrl = await preview.getAttribute('src');
    const previewBytes = Buffer.from(
      await page.evaluate(
        async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
        previewUrl,
      ),
    );
    expect(previewBytes).toEqual(avif);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/avif-converter`,
    );
  });
}

test('reports malformed AVIF with a typed remedy and no network fallback', async ({ page }) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/avif-converter');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.avif',
    mimeType: 'image/avif',
    buffer: Buffer.from('not-avif'),
  });
  await expect(page.getByRole('alert')).toContainText('Choose a valid, non-corrupted AVIF file');
  expect(crossOrigin).toEqual([]);
});
