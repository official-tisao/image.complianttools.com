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

test('encodes lossy and lossless raster JPEG XL then decodes real output to PNG locally', async ({
  page,
}) => {
  const crossOrigin: string[] = [];
  const localRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
    else localRequests.push(url.pathname);
  });
  await page.goto('/jxl-converter');
  await page.waitForLoadState('networkidle');
  expect(localRequests.some((path) => /jxl_enc|jxl-encode/u.test(path))).toBe(false);
  const png = await pngFixture(page);

  await page.getByRole('button', { name: 'Image to JPEG XL' }).click();
  const lossy = await uploadAndRead(page, 'red.png', 'image/png', png);
  await expect(page.getByRole('status').last()).toContainText('Created lossy quality 75');
  expect(lossy.length).toBeGreaterThan(20);
  expect(localRequests.some((path) => /jxl_enc|jxl-encode/u.test(path))).toBe(true);

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
  expect(crossOrigin).toEqual([]);
});

test('reports malformed JPEG XL with a typed remedy and no network fallback', async ({ page }) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/jxl-converter');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.jxl',
    mimeType: 'image/jxl',
    buffer: Buffer.from('not-jxl'),
  });
  await expect(page.getByRole('alert')).toContainText('Choose a valid, non-corrupted JXL file', {
    timeout: 30_000,
  });
  expect(crossOrigin).toEqual([]);
});
