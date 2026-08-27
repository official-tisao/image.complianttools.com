import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createPdfFromPngPages } from '../packages/engine/src/documents/pdf.js';
import { allowAllNetwork, denyAllNetwork } from './support/network.js';

const onePixelPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1,
  255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

function inspectPng(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('PDF to Image reads a real document page count before rendering', async ({ page }) => {
  const fixture = await createPdfFromPngPages([
    { pngBytes: onePixelPng, width: 72, height: 36 },
    { pngBytes: onePixelPng, width: 144, height: 216 },
  ]);

  await page.goto('/pdf-to-image');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Page').fill('3');
  await page.locator('input[type=file]').setInputFiles({
    name: 'two-pages.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(fixture),
  });
  await expect(page.getByRole('alert')).toContainText(
    'PDF has 2 pages; the selected page is unavailable.',
  );
  await expect(page.getByRole('alert')).toContainText('Remedy:');
});

test('PDF to Image renders a real page at the selected DPI', async ({ page, context }) => {
  const fixture = await createPdfFromPngPages([{ pngBytes: onePixelPng, width: 72, height: 36 }]);
  await page.goto('/pdf-to-image');
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Page')).toHaveValue('1');
  await expect(page.getByLabel('Output DPI')).toHaveValue('72');
  await page.getByLabel('Output DPI').fill('144');
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'one-page.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(fixture),
  });
  const download = await pending;
  expect(download.suggestedFilename()).toBe('one-page-page-1.png');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(inspectPng(await readFile(path!))).toEqual({ width: 144, height: 72 });
  await expect(page.getByRole('status')).toHaveText(
    'Rendered page 1 of 1 at 144 DPI (144×72) locally.',
  );
  await denyAllNetwork(context);
  const offlinePending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'offline-one-page.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(fixture),
  });
  const offlinePath = await (await offlinePending).path();
  expect(offlinePath).not.toBeNull();
  expect(inspectPng(await readFile(offlinePath!))).toEqual({
    width: 144,
    height: 72,
  });
  await allowAllNetwork(context);
});

test('PDF to Image accepts modern PDF-compatible AI and names legacy AI', async ({ page }) => {
  const fixture = await createPdfFromPngPages([{ pngBytes: onePixelPng, width: 72, height: 36 }]);
  await page.goto('/pdf-to-image');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Page').fill('2');
  await page.locator('input[type=file]').setInputFiles({
    name: 'modern.ai',
    mimeType: 'application/postscript',
    buffer: Buffer.from(fixture),
  });
  await expect(page.getByRole('alert')).toContainText(
    'PDF has 1 page; the selected page is unavailable.',
  );

  await page.locator('input[type=file]').setInputFiles({
    name: 'legacy.ai',
    mimeType: 'application/postscript',
    buffer: Buffer.from('%!PS-Adobe-3.0'),
  });
  await expect(page.getByRole('alert')).toContainText('legacy pre-PDF Illustrator');
});

test('PDF page and DPI controls lead to the file picker by keyboard', async ({ page }) => {
  await page.goto('/pdf-to-image');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Page').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Output DPI')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('input[type=file]')).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} PDF route renders exact PNG dimensions with locale layout`, async ({ page }) => {
    const fixture = await createPdfFromPngPages([{ pngBytes: onePixelPng, width: 72, height: 36 }]);
    await page.goto(`/${locale}/pdf-to-image`);
    await page.waitForLoadState('networkidle');
    const pending = page.waitForEvent('download');
    await page.locator('input[type=file]').setInputFiles({
      name: `${locale}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(fixture),
    });
    const path = await (await pending).path();
    expect(path).not.toBeNull();
    expect(inspectPng(await readFile(path!))).toEqual({ width: 72, height: 36 });
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/pdf-to-image`,
    );
    await expect(page.getByRole('status')).toContainText('72×36');
  });
}
