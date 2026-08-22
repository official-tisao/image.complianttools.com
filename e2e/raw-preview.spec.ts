import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

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

test('RAW converter labels and downloads the largest embedded camera preview', async ({ page }) => {
  const container = Buffer.alloc(96);
  container.set([0x46, 0x55, 0x4a, 0x49], 0);
  container.set([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9], 8);
  const preview = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 1, 2, 3, 4, 5, 6, 7, 8, 0xff, 0xd9]);
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
    "camera's embedded JPEG preview, not a RAW develop",
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
  await expect(page.getByRole('alert')).toContainText('No embedded JPEG camera preview');
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
});
