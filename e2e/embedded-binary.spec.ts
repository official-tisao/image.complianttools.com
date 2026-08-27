import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const blackPixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function exportBinary(page: Page, target: string, format: string): Promise<Buffer> {
  await page.goto('/embedded-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Target').selectOption(target);
  await page.getByLabel('Pixel format').selectOption(format);
  await page.locator('input[type=file]').setInputFiles({
    name: 'black.png',
    mimeType: 'image/png',
    buffer: blackPixelPng,
  });
  await page.getByRole('button', { name: 'Generate output' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download output' }).click();
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

test('embedded converter downloads exact LVGL v8 and v9 binary bytes', async ({ page }) => {
  expect(await exportBinary(page, 'lvgl-v8-bin', 'rgb565')).toEqual(Buffer.from([0, 0]));
  expect(await exportBinary(page, 'lvgl-v9-bin', 'rgb565')).toEqual(Buffer.from([0, 0]));
});

test('embedded converter downloads exact generic raw bytes', async ({ page }) => {
  expect(await exportBinary(page, 'generic-bin', 'rgba8888')).toEqual(Buffer.from([0, 0, 0, 255]));
});
