import { expect, test } from '@playwright/test';

test('/licenses renders the mandatory IJG attribution', async ({ page }) => {
  await page.goto('/licenses');
  await expect(page.getByText('Independent JPEG Group')).toBeVisible();
});
