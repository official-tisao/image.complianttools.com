import { expect, test } from '@playwright/test';

test('/editor page loads layer UI and makes zero cross-origin requests', async ({ page }) => {
  const crossOriginRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    // Only count actual cross-origin network calls (not localhost resources)
    if (url.origin !== 'http://127.0.0.1:4173' && !url.url().startsWith('blob:'))
      crossOriginRequests.push(request.url());
  });

  await page.goto('/editor');
  await page.waitForLoadState('networkidle');

  // Layer UI present
  await expect(page.getByRole('heading', { name: /layer/i })).toBeVisible();
  await expect(page.locator('ul li')).toHaveCount(1); // at least initial layer

  // Controls visible
  await expect(page.locator('button', { hasText: 'Add layer' })).toBeVisible();
  await expect(page.locator('button', { hasText: 'Add group' })).toBeVisible();
  await expect(page.locator('input[type=range]')).toBeVisible();

  // Click Add layer creates a new layer
  await page.locator('button', { hasText: 'Add layer' }).click();
  await expect(page.locator('ul li')).toHaveCount(2);

  // Click visibility toggle
  await page.locator('button', { hasText: 'Hide' }).click();
  await expect(page.locator('ul li')).toHaveCount(2);

  expect(crossOriginRequests).toEqual([]);
});
