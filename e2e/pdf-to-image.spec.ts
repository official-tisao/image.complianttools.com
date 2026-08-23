import { expect, test } from '@playwright/test';
import { createPdfFromPngPages } from '../packages/engine/src/documents/pdf.js';

const onePixelPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1,
  255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

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
  await expect(page.getByRole('alert')).toHaveText('PDF has 2 pages; page 3 is unavailable.');
});

test('PDF to Image renders a real page at the selected DPI', async ({ page }) => {
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
  expect((await pending).suggestedFilename()).toBe('one-page-page-1.png');
  await expect(page.getByRole('status')).toHaveText(
    'Rendered page 1 of 1 at 144 DPI (144×72) locally.',
  );
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
  await expect(page.getByRole('alert')).toHaveText('PDF has 1 page; page 2 is unavailable.');

  await page.locator('input[type=file]').setInputFiles({
    name: 'legacy.ai',
    mimeType: 'application/postscript',
    buffer: Buffer.from('%!PS-Adobe-3.0'),
  });
  await expect(page.getByRole('alert')).toContainText('legacy pre-PDF Illustrator');
});
