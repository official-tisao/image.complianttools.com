import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import { encodeCbz } from '../packages/engine/src/documents/cbz.js';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const onePageCbz = Buffer.from(encodeCbz([{ name: 'page1.png', bytes: onePixelPng }]));

test('packs naturally named image pages into a local CBZ', async ({ page }) => {
  await page.goto('/cbz-converter');
  await page.waitForLoadState('networkidle');
  const pending = page.waitForEvent('download');
  await page.getByLabel('Choose comic page images').setInputFiles([
    { name: 'page2.png', mimeType: 'image/png', buffer: Buffer.from([2]) },
    { name: 'page1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([1]) },
  ]);
  const download = await pending;
  expect(download.suggestedFilename()).toBe('comic.cbz');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect((await readFile(path!)).subarray(0, 2)).toEqual(Buffer.from('PK'));
});

test('converts a real local CBZ page to PDF', async ({ page }) => {
  await page.goto('/cbz-converter');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Operation').selectOption('pdf');
  const pending = page.waitForEvent('download');
  await page.getByLabel('Choose a CBZ, ZIP, or CBR archive').setInputFiles({
    name: 'comic.cbz',
    mimeType: 'application/vnd.comicbook+zip',
    buffer: onePageCbz,
  });
  const download = await pending;
  expect(download.suggestedFilename()).toBe('comic.pdf');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect((await readFile(path!)).subarray(0, 5).toString('ascii')).toBe('%PDF-');
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
  await expect(page.getByRole('alert')).toContainText('RAR-backed CBR extraction is unavailable');
});
