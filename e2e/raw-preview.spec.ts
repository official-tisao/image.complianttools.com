import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

test('RAW converter labels and downloads the largest embedded camera preview', async ({ page }) => {
  const container = Buffer.alloc(96);
  container.set([0x46, 0x55, 0x4a, 0x49], 0);
  container.set([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9], 8);
  const preview = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 1, 2, 3, 4, 5, 6, 7, 8, 0xff, 0xd9]);
  container.set(preview, 48);

  await page.goto('/raw-converter');
  await page.waitForLoadState('networkidle');
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'camera.raf',
    mimeType: 'application/octet-stream',
    buffer: container,
  });
  const download = await pending;
  expect(download.suggestedFilename()).toBe('camera-camera-preview.jpg');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!)).toEqual(preview);
  await expect(page.getByRole('status')).toContainText(
    "camera's embedded JPEG preview, not a RAW develop",
  );
});

test('RAW converter surfaces a useful malformed-input error', async ({ page }) => {
  await page.goto('/raw-converter');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.nef',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(32),
  });
  await expect(page.getByRole('alert')).toContainText('No embedded JPEG camera preview');
});
