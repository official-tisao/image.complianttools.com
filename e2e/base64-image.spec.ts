import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

test('encodes bytes with HTML and CSS snippets on the canonical local page', async ({ page }) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/base64-image');
  await page.getByLabel('Choose an image').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0, 1, 2]),
  });
  await expect(page.getByLabel('Base64 data URL')).toHaveValue('data:image/png;base64,AAEC');
  await expect(page.getByLabel('HTML snippet')).toHaveValue(
    '<img src="data:image/png;base64,AAEC" alt="">',
  );
  await expect(page.getByLabel('CSS snippet')).toHaveValue(
    'background-image: url("data:image/png;base64,AAEC");',
  );
  expect(crossOrigin).toEqual([]);
});

test('decodes a bounded data URL back to exact local bytes', async ({ page }) => {
  await page.goto('/base64-image');
  await page.getByLabel('Direction').selectOption('decode');
  await page.getByLabel('Base64 data URL').fill('data:image/png;base64,AAEC/f7/');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Decode and download' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('decoded.png');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!)).toEqual(Buffer.from([0, 1, 2, 253, 254, 255]));
  await expect(page.getByRole('status')).toContainText('Decoded 6 bytes locally');
});
