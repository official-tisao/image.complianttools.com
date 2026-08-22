import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

function jpegWithExif(tiff: Uint8Array, name: string) {
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from(tiff)]);
  return {
    name,
    mimeType: 'image/jpeg',
    buffer: Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe1,
      (payload.length + 2) >>> 8,
      (payload.length + 2) & 255,
      ...payload,
      0xff,
      0xd9,
    ]),
  };
}

function makerNoteJpeg() {
  const tiff = new Uint8Array(80);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8769, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 32, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 0x927c, true);
  view.setUint16(36, 7, true);
  view.setUint32(38, 5, true);
  view.setUint32(42, 64, true);
  tiff.set([0xde, 0xad, 0xbe, 0xef, 1], 64);
  return jpegWithExif(tiff, 'maker-note.jpg');
}

function gpsJpeg() {
  const tiff = new Uint8Array(96);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8825, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 32, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 2, true);
  view.setUint16(36, 5, true);
  view.setUint32(38, 3, true);
  view.setUint32(42, 64, true);
  tiff.fill(0xaa, 64, 88);
  return jpegWithExif(tiff, 'gps.jpg');
}

test('metadata viewer reports an opaque MakerNote locally', async ({ page }) => {
  await page.goto('/exif-viewer');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles(makerNoteJpeg());
  await expect(page.getByRole('heading', { name: 'maker-note.jpg' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'MakerNote' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /5 bytes \(deadbeef01\)/u })).toBeVisible();
});

test('GPS-only preset downloads a JPEG with coordinate storage wiped', async ({ page }) => {
  await page.goto('/remove-exif');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Removal preset').selectOption('gps');
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles(gpsJpeg());
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const output = await readFile(path!);
  expect([...output.subarray(22, 34)]).toEqual(new Array(12).fill(0));
  expect([...output.subarray(76, 100)]).toEqual(new Array(24).fill(0));
  await expect(page.getByRole('status')).toContainText('Removed metadata locally');
});
