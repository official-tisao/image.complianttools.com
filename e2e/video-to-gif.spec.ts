import { expect, test } from '@playwright/test';

test('video frame tool reports an invalid local container without a network fallback', async ({
  page,
}) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/video-to-gif');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from([0, 1, 2, 3]),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  expect(crossOrigin).toEqual([]);
});

test('video frame tool names a documented container that has no permitted local parser', async ({
  page,
}) => {
  await page.goto('/video-to-gif');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'legacy.avi',
    mimeType: 'video/x-msvideo',
    buffer: Buffer.from('RIFF-invalid-AVI'),
  });
  await expect(page.getByRole('alert')).toContainText(
    'AVI input is unavailable because the pinned local container reader does not parse this container',
  );
});
