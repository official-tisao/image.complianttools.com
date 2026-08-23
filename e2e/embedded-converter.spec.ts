import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const redPixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('embedded converter emits an LVGL v9 RGB565A8 descriptor locally', async ({ page }) => {
  await page.goto('/embedded-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Target').selectOption('lvgl-v9');
  await page.getByLabel('Pixel format').selectOption('rgb565a8');
  await page.getByLabel('C symbol name').fill('status_icon');
  await page.locator('input[type=file]').setInputFiles({
    name: 'status.png',
    mimeType: 'image/png',
    buffer: redPixelPng,
  });
  await page.getByRole('button', { name: 'Generate output' }).click();
  await expect(page.getByLabel('Exact embedded output')).toHaveValue(/LV_COLOR_FORMAT_RGB565A8/u);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download output' }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const source = await readFile(path!, 'utf8');
  expect(source).toContain('LV_COLOR_FORMAT_RGB565A8');
  expect(source).toContain('lv_image_dsc_t status_icon');
  expect(source).toContain('0x00, 0x00, 0xff');
  await expect(page.getByRole('status')).toContainText('3 bytes flash footprint');
  expect(await page.getByLabel('Exact embedded output').inputValue()).toBe(source);
});

test('embedded converter reports corrupt input with a typed remedy', async ({ page }) => {
  await page.goto('/embedded-converter');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
  await page.getByRole('button', { name: 'Generate output' }).click();
  await expect(page.getByRole('alert')).toContainText('Remedy:');
  await expect(page.getByRole('button', { name: 'Download output' })).toBeDisabled();
});
