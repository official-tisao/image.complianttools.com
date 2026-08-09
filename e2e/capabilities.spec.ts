import { expect, test } from '@playwright/test';

test('runtime probes render without browser-name or user-agent branches', async ({ page }) => {
  await page.goto('/debug/capabilities');
  await expect(page.getByRole('heading', { name: 'Runtime capabilities' })).toBeVisible();
  await expect(page.locator('#capabilities dt')).toHaveCount(8);
});
