import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

test('downloads the complete deterministic favicon package without network fallback', async ({
  page,
}) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/favicon-generator');
  const png = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#c83264';
      context.fillRect(0, 0, 2, 2);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob(resolve, 'image/png'));
      return [...new Uint8Array(await blob.arrayBuffer())];
    }),
  );
  await page.getByLabel('Site name').fill('Example Site');
  const pending = page.waitForEvent('download');
  await page.getByLabel('Choose an image').setInputFiles({
    name: 'source.png',
    mimeType: 'image/png',
    buffer: png,
  });
  const download = await pending;
  expect(download.suggestedFilename()).toBe('favicon-package.zip');
  const path = await download.path();
  expect(path).not.toBeNull();
  const archive = await readFile(path!);
  const storedText = new TextDecoder('latin1').decode(archive);
  for (const name of [
    'android-chrome-192x192.png',
    'android-chrome-512x512.png',
    'apple-touch-icon.png',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'favicon.html',
    'favicon.ico',
    'site.webmanifest',
  ])
    expect(storedText).toContain(name);
  expect(storedText).toContain('"name": "Example Site"');
  await expect(page.getByLabel('HTML link snippet')).toHaveValue(/apple-touch-icon/u);
  await expect(page.getByRole('status')).toContainText('Created favicon.ico');
  expect(crossOrigin).toEqual([]);
});
