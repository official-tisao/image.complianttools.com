import { expect, test } from '@playwright/test';

test('runtime probes render without browser-name or user-agent branches', async ({ page }) => {
  const response = await page.goto('/debug/capabilities');
  expect(response?.headers()).toMatchObject({
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'same-origin',
  });
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Runtime capabilities' })).toBeVisible();
  await expect(page.locator('#capabilities dt')).toHaveCount(8);
  await expect(page.locator('dt', { hasText: 'WebAssembly threads' }).locator('+ dd')).toHaveText(
    'Available',
  );
});
