import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import pdfLib from '../packages/engine/node_modules/pdf-lib/cjs/index.js';

const { PDFDocument } = pdfLib;

async function pngFixture(page: import('@playwright/test').Page): Promise<Buffer> {
  return Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 8;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable.');
      context.fillStyle = '#ef1808';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
          'image/png',
        ),
      );
      return [...new Uint8Array(await blob.arrayBuffer())];
    }),
  );
}

test('creates, previews, orders, and downloads a configured local PDF', async ({
  page,
  context,
}) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' && url.origin !== 'http://127.0.0.1:4173')
      crossOrigin.push(url.href);
  });
  await page.goto('/image-to-pdf');
  await page.waitForLoadState('networkidle');
  const redPng = await pngFixture(page);
  await expect(page.getByLabel('Page size')).toHaveValue('image');
  await expect(page.getByLabel('Margin')).toHaveValue('0');
  await page.getByLabel('Page size').selectOption('letter');
  await page.getByRole('button', { name: 'Landscape' }).click();
  await page.getByLabel('Margin').fill('36');
  await page.getByRole('button', { name: 'Filename' }).click();
  await page.locator('input[type=file]').setInputFiles([
    { name: 'z-red.png', mimeType: 'image/png', buffer: redPng },
    { name: 'a-red.png', mimeType: 'image/png', buffer: redPng },
  ]);
  await expect(page.getByLabel('PDF page order').locator('li')).toHaveText([
    'a-red.png',
    'z-red.png',
  ]);
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByRole('status')).toContainText('Created a 2-page PDF locally');
  await expect(page.getByTitle('Exported PDF preview')).toBeVisible();
  const previewUrl = await page.getByTitle('Exported PDF preview').getAttribute('src');
  const previewBytes = Buffer.from(
    await page.evaluate(
      async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
      previewUrl,
    ),
  );
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  const downloadedBytes = await readFile(path!);
  expect(downloadedBytes).toEqual(previewBytes);
  const pdf = await PDFDocument.load(downloadedBytes);
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 792, height: 612 });

  await page.getByRole('button', { name: 'JPEG', exact: true }).click();
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByRole('status')).toContainText('Created a 2-page PDF locally');
  const jpegPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const jpegPath = await (await jpegPending).path();
  expect(jpegPath).not.toBeNull();
  expect((await readFile(jpegPath!)).toString('latin1')).toContain('/DCTDecode');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByRole('status')).toContainText('Created a 2-page PDF locally');
  await context.setOffline(false);
  expect(crossOrigin).toEqual([]);
});

test('reports corrupt image input without producing an export', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
});

test('image-to-PDF generated controls and file picker follow keyboard focus order', async ({
  page,
}) => {
  await page.goto('/image-to-pdf');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Page size').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Auto' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Portrait' })).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} image-to-PDF exports a valid PDF with locale layout`, async ({ page }) => {
    await page.goto(`/${locale}/image-to-pdf`);
    await page.waitForLoadState('networkidle');
    const png = await pngFixture(page);
    await page.locator('input[type=file]').setInputFiles({
      name: `${locale}.png`,
      mimeType: 'image/png',
      buffer: png,
    });
    await page.locator('main > button').first().click();
    await expect(page.locator('iframe')).toBeVisible();
    const pending = page.waitForEvent('download');
    await page.locator('main > button').nth(1).click();
    const path = await (await pending).path();
    expect(path).not.toBeNull();
    const pdf = await PDFDocument.load(await readFile(path!));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 16, height: 8 });
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/image-to-pdf`,
    );
  });
}
