import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const redPixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('embedded converter emits an LVGL v9 RGB565A8 descriptor locally', async ({
  page,
  context,
}) => {
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
  expect(source).toContain('LV_IMAGE_HEADER_MAGIC');
  expect(source).toContain('.stride = 2');
  expect(source).toContain('lv_image_dsc_t status_icon');
  expect(source).toContain('0x00, 0x00, 0xff');
  await expect(page.getByRole('status')).toContainText('3 bytes flash footprint');
  expect(await page.getByLabel('Exact embedded output').inputValue()).toBe(source);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Generate output' }).click();
  await expect(page.getByLabel('Exact embedded output')).toHaveValue(/LV_COLOR_FORMAT_RGB565A8/u);
  await context.setOffline(false);
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

test('embedded converter supports keyboard-only option changes', async ({ page }) => {
  await page.goto('/embedded-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Target').focus();
  await page.keyboard.press('End');
  await expect(page.getByLabel('Target')).toHaveValue('esp-idf');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Dithering')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Dithering')).toHaveValue('ordered');
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} embedded converter generates and downloads exact generic bytes`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/embedded-converter`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/embedded-converter`,
    );
    await page.getByLabel(locale === 'ar' ? 'الهدف' : /Tàrgët/u).selectOption('generic-bin');
    await page
      .getByLabel(locale === 'ar' ? 'تنسيق البكسل' : /Pïxël fôrmàt/u)
      .selectOption('rgba8888');
    await page.locator('input[type=file]').setInputFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: redPixelPng,
    });
    await page
      .getByRole('button', { name: locale === 'ar' ? 'إنشاء الناتج' : /Gënëràtë ôütpüt/u })
      .click();
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', { name: locale === 'ar' ? 'تنزيل الناتج' : /Dôwnlôàd ôütpüt/u })
      .click();
    const path = await (await pending).path();
    expect(path).not.toBeNull();
    expect(await readFile(path!)).toEqual(Buffer.from([0, 0, 0, 255]));
  });
}
