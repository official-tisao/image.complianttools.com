import { expect, test } from '@playwright/test';
import { allowAllNetwork, denyAllNetwork, LOCAL_ORIGIN } from './support/network.js';

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

test('encodes lossy and lossless raster JPEG XL then decodes real output to PNG locally', async ({
  page,
  context,
}) => {
  // This round trip runs two encodes, two decodes, and an offline decode in one test.
  test.setTimeout(60_000);
  const crossOrigin: string[] = [];
  const localRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== LOCAL_ORIGIN) crossOrigin.push(request.url());
    else localRequests.push(url.pathname);
  });
  await page.goto('/jxl-converter');
  await page.waitForLoadState('networkidle');
  expect(localRequests.some((path) => /jxl_enc|jxl-encode/u.test(path))).toBe(false);
  const png = await pngFixture(page);

  await page.getByRole('button', { name: 'Image to JPEG XL' }).click();
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Encoding effort value' }).fill('9');
  const lossy = await uploadAndRead(page, 'red.png', 'image/png', png);
  await expect(page.getByRole('status').last()).toContainText('Created lossy quality 75');
  expect(lossy.length).toBeGreaterThan(20);
  expect(localRequests.some((path) => /jxl_enc|jxl-encode/u.test(path))).toBe(true);
  expect(localRequests.some((path) => /format-encode-worker/u.test(path))).toBe(true);

  await page.getByLabel('Use lossless raster encoding').check();
  const lossless = await uploadAndRead(page, 'red.png', 'image/png', png);
  await expect(page.getByRole('status').last()).toContainText('Created lossless raster');
  expect(lossless.length).toBeGreaterThan(20);

  await page.getByRole('button', { name: 'JPEG XL to PNG' }).click();
  const decodedPng = await uploadAndRead(page, 'red.jxl', 'image/jxl', lossless);
  await expect(page.getByRole('status').last()).toContainText('JPEG XL image to PNG locally');
  expect(decodedPng.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const previewBytes = await page.evaluate(async () => {
    const image = document.querySelector('figure img');
    if (!(image instanceof HTMLImageElement)) throw new Error('PNG preview is missing.');
    return [...new Uint8Array(await (await fetch(image.src)).arrayBuffer())];
  });
  expect(Buffer.from(previewBytes)).toEqual(decodedPng);
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
  await denyAllNetwork(context);
  const offlineDecodedPng = await uploadAndRead(page, 'offline-red.jxl', 'image/jxl', lossless);
  expect(offlineDecodedPng.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  await allowAllNetwork(context);
  expect(crossOrigin).toEqual([]);
});

test('reports malformed JPEG XL with a typed remedy and no network fallback', async ({ page }) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== LOCAL_ORIGIN) crossOrigin.push(request.url());
  });
  await page.goto('/jxl-converter');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.jxl',
    mimeType: 'image/jxl',
    buffer: Buffer.from('not-jxl'),
  });
  await expect(page.getByRole('alert')).toContainText('Decoding error', {
    timeout: 30_000,
  });
  expect(crossOrigin).toEqual([]);
});

test('JPEG XL direction and raster encoding controls are keyboard operable', async ({ page }) => {
  await page.goto('/jxl-converter');
  await page.waitForLoadState('networkidle');
  const directions = page.getByTestId('option-jxl-direction').locator('.segments button');
  await directions.first().focus();
  await page.keyboard.press('Tab');
  await expect(directions.nth(1)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(directions.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Use lossless raster encoding')).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} JPEG XL route completes a real lossless raster round trip`, async ({ page }) => {
    await page.goto(`/${locale}/jxl-converter`);
    await page.waitForLoadState('networkidle');
    const png = await pngFixture(page);
    const directions = page.getByTestId('option-jxl-direction').locator('.segments button');
    await directions.nth(1).click();
    await page.getByTestId('option-jxl-lossless').locator('input[type=checkbox]').check();
    const jxl = await uploadAndRead(page, `${locale}.png`, 'image/png', png);
    expect(jxl.length).toBeGreaterThan(20);

    await directions.first().click();
    const decoded = await uploadAndRead(page, `${locale}.jxl`, 'image/jxl', jxl);
    expect(decoded.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const previewUrl = await page.locator('figure img').getAttribute('src');
    const preview = Buffer.from(
      await page.evaluate(
        async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
        previewUrl,
      ),
    );
    expect(preview).toEqual(decoded);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/jxl-converter`,
    );
  });
}
