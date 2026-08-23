import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const redPixelPng = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1,
  255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

async function exportBinary(page: Page, target: string, format: string): Promise<Buffer> {
  await page.goto('/embedded-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Target').selectOption(target);
  await page.getByLabel('Pixel format').selectOption(format);
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'red.png',
    mimeType: 'image/png',
    buffer: redPixelPng,
  });
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

test('embedded converter downloads exact LVGL v8 and v9 binary bytes', async ({ page }) => {
  expect(await exportBinary(page, 'lvgl-v8-bin', 'rgb565')).toEqual(Buffer.from([0x00, 0xf8]));
  expect(await exportBinary(page, 'lvgl-v9-bin', 'rgb565')).toEqual(Buffer.from([0x00, 0xf8]));
});

test('embedded converter downloads exact generic raw bytes', async ({ page }) => {
  expect(await exportBinary(page, 'generic-bin', 'rgba8888')).toEqual(
    Buffer.from([255, 0, 0, 255]),
  );
});
