import { expect, test } from '@playwright/test';
import { LOCAL_ORIGIN } from './support/network.js';

const fixture = {
  name: 'self-generated.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
};

test('a real conversion pipeline makes zero cross-origin requests', async ({ page }) => {
  const crossOriginRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== LOCAL_ORIGIN) crossOriginRequests.push(request.url());
  });
  await page.goto('/convert');
  await page.waitForLoadState('networkidle');
  await page.setInputFiles('[data-testid=file-input]', fixture);
  await expect(page.getByTestId('compare-canvas')).toBeVisible();
  await expect(page.getByTestId('size-prediction')).not.toContainText('Choose');
  expect(crossOriginRequests).toEqual([]);
});

test('the real conversion remains interactive after going offline', async ({ page, context }) => {
  await page.goto('/compress');
  await page.waitForLoadState('networkidle');
  await page.setInputFiles('[data-testid=file-input]', fixture);
  await expect(page.getByTestId('compare-canvas')).toBeVisible();
  await context.setOffline(true);
  await page.getByTestId('option-export-quality').locator('input[type=range]').fill('64');
  await expect(page.getByTestId('size-prediction')).not.toContainText('Choose');
});
