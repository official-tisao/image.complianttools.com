import { expect, test } from '@playwright/test';

test.describe('Feedback widget global visibility', () => {
  const routes = ['/', '/licenses', '/heic-converter'];

  for (const route of routes) {
    test(`${route} renders feedback widget exactly once`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} response`).toBe(200);

      // Check feedback widget is present exactly once
      const widget = page.locator('.feedback-widget');
      await expect(widget).toHaveCount(1);

      // Verify it has the expected heading
      const heading = page.locator('#feedback-heading');
      await expect(heading).toHaveCount(1);
      await expect(heading).toHaveText('Does this tool help you?');

      // Check no JS errors
      expect(pageErrors, `${route} browser errors`).toEqual([]);
    });
  }
});
