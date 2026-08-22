import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const fixture = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('GIF maker exposes and uses local quantization and animation controls', async ({ page }) => {
  await page.goto('/gif-maker');
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Quantizer')).toHaveValue('median-cut');
  await expect(page.getByLabel('Dithering')).toHaveValue('floyd-steinberg');
  await expect(page.getByLabel('Frame disposal')).toHaveValue('auto');
  await page.getByLabel('Quantizer').selectOption('octree');
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: fixture,
  });
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  expect((await readFile(path!)).subarray(0, 6).toString('ascii')).toBe('GIF89a');
  await expect(page.getByRole('status')).toContainText('octree');
  await expect(page.getByRole('status')).toContainText('floyd-steinberg');
  await expect(page.getByRole('status')).toContainText('auto disposal');
});
