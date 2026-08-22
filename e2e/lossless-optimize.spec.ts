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
  const pending = page.waitForEvent('download');
  await page.getByLabel('Choose a PNG or GIF').setInputFiles({
    name: 'animation.gif',
    mimeType: 'image/gif',
    buffer: source,
  });
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const output = await readFile(path!);
  expect(download.suggestedFilename()).toBe('animation-optimized.gif');
  expect(output.byteLength).toBeLessThan(source.byteLength);
  expect(output.subarray(0, 6).toString('ascii')).toMatch(/^GIF8[79]a$/u);
  await expect(page.getByRole('status')).toContainText('Optimized and pixel-verified locally');
  expect(crossOrigin).toEqual([]);
});

test('keeps unverified JPEG optimization unavailable with a named reason', async ({ page }) => {
  await page.goto('/lossless-optimize');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Choose a PNG or GIF').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expect(page.getByRole('alert')).toHaveText(
    'JPEG lossless optimization remains unavailable until pixel-identity verification is complete.',
  );
});
