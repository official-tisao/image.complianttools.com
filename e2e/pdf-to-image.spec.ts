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
