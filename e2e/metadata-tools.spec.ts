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

function copyrightJpeg() {
  const tiff = new Uint8Array(80);
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8298, true);
  view.setUint16(12, 2, true);
  view.setUint32(14, 12, true);
  view.setUint32(18, 48, true);
  tiff.set(Buffer.from('Original\0', 'ascii'), 48);
  return jpegWithExif(tiff, 'copyright.jpg');
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

test('metadata viewer edits an existing JPEG copyright field without relocating EXIF', async ({
  page,
}) => {
  await page.goto('/exif-viewer');
  await page.waitForLoadState('networkidle');
  const fixture = copyrightJpeg();
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.getByRole('cell', { name: 'Original' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Copyright' }).check();
  await page.getByRole('textbox', { name: 'Copyright', exact: true }).fill('Mine');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download edited JPEG' }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const output = await readFile(path!);
  expect(output.subarray(60, 65)).toEqual(Buffer.from('Mine\0', 'ascii'));
  expect(output.subarray(65, 72)).toEqual(Buffer.alloc(7));
  expect(output.subarray(0, 26)).toEqual(fixture.buffer.subarray(0, 26));
  expect(output.subarray(30, 60)).toEqual(fixture.buffer.subarray(30, 60));
  await expect(page.getByRole('status')).toContainText('all other bytes were preserved');
});

test('image inspector reports deterministic PNG container facts', async ({ page }) => {
  await page.goto('/image-info');
  await page.waitForLoadState('networkidle');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAQAAABWKLW/AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page.locator('input[type=file]').setInputFiles({
    name: 'two-by-three.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(page.getByText('2 × 3 px')).toBeVisible();
  await expect(page.getByText('Grayscale + alpha')).toBeVisible();
  await expect(page.getByText('IHDR (13 bytes)')).toBeVisible();
  await expect(page.getByText(/bits\/byte \(estimate\)/u)).toBeVisible();
});
