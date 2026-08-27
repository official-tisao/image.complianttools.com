import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { decodeCbz, encodeCbz } from '../packages/engine/src/documents/cbz.js';
import { allowAllNetwork, denyAllNetwork } from './support/network.js';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const onePageCbz = Buffer.from(encodeCbz([{ name: 'page1.png', bytes: onePixelPng }]));

test('packs naturally named image pages into a local CBZ', async ({ page, context }) => {
  await page.goto('/cbz-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Choose comic page images').setInputFiles([
    { name: 'page2.png', mimeType: 'image/png', buffer: Buffer.from([2]) },
    { name: 'page1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([1]) },
  ]);
  await page.getByRole('button', { name: 'Generate output' }).click();
  await expect(page.getByRole('heading', { name: 'Exact CBZ page order' })).toBeVisible();
  await expect(page.locator('section ol li')).toHaveText(['page1.jpg', 'page2.png']);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download comic.cbz' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('comic.cbz');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect((await readFile(path!)).subarray(0, 2)).toEqual(Buffer.from('PK'));
  await denyAllNetwork(context);
  await page.getByRole('button', { name: 'Generate output' }).click();
  await expect(page.getByRole('heading', { name: 'Exact CBZ page order' })).toBeVisible();
  await allowAllNetwork(context);
});

test('converts a real local CBZ page to PDF', async ({ page }) => {
  await page.goto('/cbz-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Operation').selectOption('pdf');
  await page.getByLabel('Choose a CBZ, ZIP, or CBR archive').setInputFiles({
    name: 'comic.cbz',
    mimeType: 'application/vnd.comicbook+zip',
    buffer: onePageCbz,
  });
  await page.getByRole('button', { name: 'Generate output' }).click();
  await expect(page.getByTitle('Comic PDF export preview')).toBeVisible();
  const previewUrl = await page.getByTitle('Comic PDF export preview').getAttribute('src');
  const previewBytes = Buffer.from(
    await page.evaluate(
      async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
      previewUrl,
    ),
  );
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download comic.pdf' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('comic.pdf');
  const path = await download.path();
  expect(path).not.toBeNull();
  const downloaded = await readFile(path!);
  expect(downloaded).toEqual(previewBytes);
  expect(downloaded.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  await expect(page.getByRole('status')).toContainText('1 naturally ordered comic page');
});

test('reports the specific local CBR limitation', async ({ page }) => {
  await page.goto('/cbz-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Operation').selectOption('extract');
  await page.getByLabel('Choose a CBZ, ZIP, or CBR archive').setInputFiles({
    name: 'comic.cbr',
    mimeType: 'application/vnd.comicbook-rar',
    buffer: Buffer.from('Rar!'),
  });
  await page.getByRole('button', { name: 'Generate output' }).click();
  await expect(page.getByRole('alert')).toContainText('CBR decoding is unavailable');
  await expect(page.getByRole('alert')).toContainText('Remedy:');
});

test('extracts naturally ordered pages with exact original bytes', async ({ page }) => {
  await page.goto('/cbz-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Operation').selectOption('extract');
  await page.getByLabel('Choose a CBZ, ZIP, or CBR archive').setInputFiles({
    name: 'comic.cbz',
    mimeType: 'application/vnd.comicbook+zip',
    buffer: onePageCbz,
  });
  await page.getByRole('button', { name: 'Generate output' }).click();
  await expect(page.getByRole('heading', { name: 'Exact extracted page order' })).toBeVisible();
  await expect(page.locator('section ol li')).toContainText('page1.png');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download extracted pages' }).click();
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  expect(await readFile(path!)).toEqual(onePixelPng);
});

test('CBZ operation control leads to the file picker by keyboard', async ({ page }) => {
  await page.goto('/cbz-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Operation').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Operation')).toHaveValue('extract');
  await expect(page.locator('input[type=file]')).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} CBZ route creates an exact local archive with locale layout`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/cbz-converter`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[type=file]').setInputFiles({
      name: `${locale}.png`,
      mimeType: 'image/png',
      buffer: onePixelPng,
    });
    await page.locator('main > button').first().click();
    const pending = page.waitForEvent('download');
    await page.locator('main > button').nth(1).click();
    const path = await (await pending).path();
    expect(path).not.toBeNull();
    const pages = decodeCbz(await readFile(path!));
    expect(pages.map((comicPage) => comicPage.name)).toEqual([`${locale}.png`]);
    expect(Buffer.from(pages[0]!.bytes)).toEqual(onePixelPng);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/cbz-converter`,
    );
  });
}
