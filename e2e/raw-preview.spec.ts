import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

function validJpeg(width = 320, height = 240): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0,
    11,
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    1,
    1,
    0x11,
    0,
    0xff,
    0xd9,
  ]);
}

function uncompressedDng(): Buffer {
  const tags: Array<readonly [number, number, number, number]> = [
    [256, 4, 1, 2],
    [257, 4, 1, 2],
    [258, 3, 1, 16],
    [259, 3, 1, 1],
    [262, 3, 1, 32803],
    [273, 4, 1, 256],
    [279, 4, 1, 8],
    [33421, 3, 2, 0x0002_0002],
    [33422, 1, 4, 0x0201_0100],
    [50714, 4, 1, 64],
    [50717, 4, 1, 4095],
  ];
  const bytes = Buffer.alloc(264);
  bytes.set([0x49, 0x49, 42, 0]);
  bytes.writeUInt32LE(8, 4);
  bytes.writeUInt16LE(tags.length, 8);
  tags.forEach(([tag, type, count, value], index) => {
    const offset = 10 + index * 12;
    bytes.writeUInt16LE(tag, offset);
    bytes.writeUInt16LE(type, offset + 2);
    bytes.writeUInt32LE(count, offset + 4);
    bytes.writeUInt32LE(value, offset + 8);
  });
  [64, 1024, 2048, 4095].forEach((value, index) => bytes.writeUInt16LE(value, 256 + index * 2));
  return bytes;
}

test('RAW controls are generated with the bounded schema defaults', async ({ page }) => {
  await page.goto('/raw-converter');
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Extract embedded preview first')).toBeChecked();
  await expect(page.getByLabel('Demosaic')).toHaveValue('ahd');
  await expect(page.getByLabel('White balance')).toHaveValue('as-shot');
  await expect(page.getByLabel('Highlight recovery')).toHaveValue('clip');
  await expect(page.getByLabel('Output colour space')).toHaveValue('srgb');
  await expect(page.getByLabel('Output bit depth')).toHaveValue('8');
  await expect(page.getByLabel('Exposure')).toHaveValue('0');
  await page.getByText('Advanced', { exact: true }).click();
  await expect(page.getByLabel('Custom temperature')).toHaveAttribute('min', '2000');
  await expect(page.getByLabel('Custom temperature')).toHaveAttribute('max', '50000');
  await expect(page.getByLabel('Gamma')).toHaveAttribute('step', '0.1');
  await expect(page.getByLabel('Noise-reduction threshold')).toHaveValue('0');
  await expect(page.getByLabel('Chromatic-aberration correction')).not.toBeChecked();
});

test('RAW converter labels and downloads the largest embedded camera preview', async ({ page }) => {
  const container = Buffer.alloc(96);
  container.set([0x46, 0x55, 0x4a, 0x49], 0);
  container.set([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9], 8);
  const preview = validJpeg();
  container.set(preview, 48);

  await page.goto('/raw-converter');
  await page.waitForLoadState('networkidle');
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'camera.raf',
    mimeType: 'application/octet-stream',
    buffer: container,
  });
  const download = await pending;
  expect(download.suggestedFilename()).toBe('camera-camera-preview.jpg');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!)).toEqual(preview);
  await expect(page.getByRole('status')).toContainText(
    "camera's embedded rendering, not a RAW develop",
  );
  await expect(page.getByRole('status')).toContainText(
    'proprietary sensor-data decoding is not shipped',
  );
});

test('RAW converter surfaces a useful malformed-input error', async ({ page }) => {
  await page.goto('/raw-converter');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.nef',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(32),
  });
  await expect(page.getByRole('alert')).toContainText('No embedded camera preview');
  await expect(page.getByRole('alert')).toContainText('Remedy:');
});

test('RAW converter reports a specific reason for an unverified legacy extension', async ({
  page,
}) => {
  await page.goto('/raw-converter');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'legacy.ptx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(32),
  });
  await expect(page.getByRole('alert')).toContainText('Pentax PTX preview extraction');
  await expect(page.getByRole('alert')).toContainText('no hash-pinned');
  await expect(page.getByRole('alert')).toContainText('Remedy:');
  await expect(page.getByRole('alert')).toContainText('export DNG, TIFF, or JPEG');
});

test('RAW converter runs a selected 16-bit DNG develop path', async ({ page }) => {
  await page.goto('/raw-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Demosaic').selectOption('ppg');
  await page.getByLabel('Output bit depth').selectOption('16');
  await page.locator('input[type=file]').setInputFiles({
    name: 'minimal.dng',
    mimeType: 'image/x-adobe-dng',
    buffer: uncompressedDng(),
  });
  await expect(page.getByRole('status')).toHaveText('DNG develop complete at 16-bit using PPG.');
  const link = page.getByRole('link', { name: 'Download 16-bit developed output' });
  await expect(link).toHaveAttribute('download', 'minimal-2x2-rgba16le.raw');
  const raw16 = Buffer.from(
    await page.evaluate(
      async (href) => [...new Uint8Array(await (await fetch(href!)).arrayBuffer())],
      await link.getAttribute('href'),
    ),
  );
  expect(raw16.byteLength).toBe(2 * 2 * 4 * 2);
  const previewUrl = await page
    .getByRole('img', { name: 'Developed DNG preview' })
    .getAttribute('src');
  const preview = Buffer.from(
    await page.evaluate(
      async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
      previewUrl,
    ),
  );
  expect(preview.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect({ width: preview.readUInt32BE(16), height: preview.readUInt32BE(20) }).toEqual({
    width: 2,
    height: 2,
  });
});

test('RAW generated controls begin with a keyboard-operable preview toggle', async ({ page }) => {
  await page.goto('/raw-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Extract embedded preview first').focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Extract embedded preview first')).not.toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Demosaic')).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} RAW route develops exact DNG preview dimensions with locale layout`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/raw-converter`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[type=file]').setInputFiles({
      name: `${locale}.dng`,
      mimeType: 'image/x-adobe-dng',
      buffer: uncompressedDng(),
    });
    await expect(page.getByRole('status')).toContainText('8-');
    const previewUrl = await page.locator('main img').last().getAttribute('src');
    const preview = Buffer.from(
      await page.evaluate(
        async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
        previewUrl,
      ),
    );
    expect({ width: preview.readUInt32BE(16), height: preview.readUInt32BE(20) }).toEqual({
      width: 2,
      height: 2,
    });
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/raw-converter`,
    );
  });
}
