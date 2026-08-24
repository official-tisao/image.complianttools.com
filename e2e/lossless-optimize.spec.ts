import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

function gifWithRemovableComment(): Buffer {
  const base = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
  const comment = Buffer.from('generated removable comment '.repeat(40));
  const blocks: Buffer[] = [Buffer.from([0x21, 0xfe])];
  for (let offset = 0; offset < comment.length; offset += 250) {
    const block = comment.subarray(offset, offset + 250);
    blocks.push(Buffer.from([block.length]), block);
  }
  return Buffer.concat([base.subarray(0, -1), ...blocks, Buffer.from([0, 0x3b])]);
}

test('downloads a smaller independently verified GIF without a network fallback', async ({
  page,
}) => {
  const source = gifWithRemovableComment();
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/lossless-optimize');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Choose a PNG, GIF, or JPEG').setInputFiles({
    name: 'animation.gif',
    mimeType: 'image/gif',
    buffer: source,
  });
  await expect(page.getByRole('status')).toContainText('Optimized and pixel-verified locally');
  await expect(page.getByRole('img', { name: 'Pixel-verified optimized output' })).toBeVisible();
  const previewBytes = await page
    .getByRole('img')
    .evaluate(async (image: HTMLImageElement) => [
      ...new Uint8Array(await (await fetch(image.src)).arrayBuffer()),
    ]);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download output' }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const output = await readFile(path!);
  expect(download.suggestedFilename()).toBe('animation-optimized.gif');
  expect(output.byteLength).toBeLessThan(source.byteLength);
  expect(output.subarray(0, 6).toString('ascii')).toMatch(/^GIF8[79]a$/u);
  expect(Buffer.from(previewBytes)).toEqual(output);
  expect(crossOrigin).toEqual([]);
});

test('strips JPEG metadata only after independent browser pixel verification', async ({ page }) => {
  await page.goto('/lossless-optimize');
  await page.waitForLoadState('networkidle');
  const encoded = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#c83264';
      context.fillRect(0, 0, 2, 1);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      return [...new Uint8Array(await blob.arrayBuffer())];
    }),
  );
  const metadata = Buffer.from('pixel-neutral generated EXIF placeholder');
  const source = Buffer.concat([
    encoded.subarray(0, 2),
    Buffer.from([0xff, 0xe1, (metadata.length + 2) >> 8, (metadata.length + 2) & 255]),
    metadata,
    encoded.subarray(2),
  ]);
  await page.getByLabel('Choose a PNG, GIF, or JPEG').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: source,
  });
  await expect(page.getByRole('status')).toContainText('Optimized and pixel-verified locally');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download output' }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const output = await readFile(path!);
  expect(download.suggestedFilename()).toBe('photo-optimized.jpg');
  expect(output.byteLength).toBeLessThan(source.byteLength);
  expect(output.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
});

test('rejects malformed input with a typed remedy and no export', async ({ page }) => {
  await page.goto('/lossless-optimize');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Choose a PNG, GIF, or JPEG').setInputFiles({
    name: 'broken.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('not a gif'),
  });
  await expect(page.getByRole('alert')).toContainText('Remedy:');
  await expect(page.getByRole('button', { name: 'Download output' })).toHaveCount(0);
});

test('lossless optimization is keyboard-operable through download', async ({ page }) => {
  await page.goto('/lossless-optimize');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Choose a PNG, GIF, or JPEG').focus();
  await expect(page.getByLabel('Choose a PNG, GIF, or JPEG')).toBeFocused();
  await page.getByLabel('Choose a PNG, GIF, or JPEG').setInputFiles({
    name: 'animation.gif',
    mimeType: 'image/gif',
    buffer: gifWithRemovableComment(),
  });
  await page.getByRole('button', { name: 'Download output' }).focus();
  const pending = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await pending).suggestedFilename()).toBe('animation-optimized.gif');
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} lossless optimizer previews and downloads identical bytes`, async ({ page }) => {
    await page.goto(`/${locale}/lossless-optimize`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await page.locator('input[type=file]').setInputFiles({
      name: 'animation.gif',
      mimeType: 'image/gif',
      buffer: gifWithRemovableComment(),
    });
    const image = page.getByRole('img');
    await expect(image).toBeVisible();
    const preview = Buffer.from(
      await image.evaluate(async (element: HTMLImageElement) => [
        ...new Uint8Array(await (await fetch(element.src)).arrayBuffer()),
      ]),
    );
    const pending = page.waitForEvent('download');
    await page.locator('button[type=button]').click();
    const path = await (await pending).path();
    expect(path).not.toBeNull();
    expect(await readFile(path!)).toEqual(preview);
  });
}
