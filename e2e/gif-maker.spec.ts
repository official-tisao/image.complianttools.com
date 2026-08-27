import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const fixture = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('GIF maker exposes and uses local quantization and animation controls', async ({ page }) => {
  await page.goto('/gif-maker');
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Frame delay (ms)')).toHaveValue('100');
  await expect(page.getByLabel('Loop count (0 = infinite)')).toHaveValue('0');
  await expect(page.getByLabel('Frame generator')).toHaveValue('forward');
  await expect(page.getByLabel('Quantizer')).toHaveValue('median-cut');
  await expect(page.getByLabel('Palette mode')).toHaveValue('adaptive');
  await expect(page.getByLabel('Palette size (2–256)')).toHaveValue('256');
  await expect(page.getByLabel('Transparency index (0–255)')).toHaveValue('0');
  await expect(page.getByLabel('Dithering')).toHaveValue('floyd-steinberg');
  await expect(page.getByLabel('Dither amount (0–100)')).toHaveValue('100');
  await expect(page.getByLabel('Frame disposal')).toHaveValue('auto');
  await expect(page.getByLabel('Interlace rows')).not.toBeChecked();
  await page.getByLabel('Quantizer').selectOption('neural');
  await page.getByLabel('Optimization level').selectOption('0');
  await page.getByLabel('Frame generator').selectOption('crossfade');
  await page.getByLabel('Crossfade frames').fill('1');
  await page.getByLabel('Palette size (2–256)').fill('16');
  await page.getByLabel('Transparency index (0–255)').fill('5');
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles([
    { name: 'pixel-a.png', mimeType: 'image/png', buffer: fixture },
    { name: 'pixel-b.png', mimeType: 'image/png', buffer: fixture },
  ]);
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  expect((await readFile(path!)).subarray(0, 6).toString('ascii')).toBe('GIF89a');
  await expect(page.getByRole('status')).toContainText('neural');
  await expect(page.getByRole('status')).toContainText('with 3 frame(s)');
  await expect(page.getByRole('status')).toContainText('crossfade');
  await expect(page.getByRole('status')).toContainText('adaptive palette up to 16 entries');
  await expect(page.getByRole('status')).toContainText('transparency index 5');
  await expect(page.getByRole('status')).toContainText('floyd-steinberg');
  await expect(page.getByRole('status')).toContainText('auto disposal');
});
