import { expect, test } from '@playwright/test';

const routes = [
  ['bulk-resize', 'Bulk Resize'],
  ['canvas-resize', 'Canvas Resize'],
  ['enlarge', 'Image Enlarger'],
  ['round-corners', 'Round Corners'],
  ['collage', 'Collage Maker'],
  ['split-image', 'Split Image'],
] as const;

test.describe('transform expansion routes', () => {
  for (const [route, title] of routes) {
    test(`${route} has a local-only shell and canonical`, async ({ page }) => {
      await page.goto(`/${route}`);
      await expect(page.locator('h1')).toHaveText(title);
      await expect(page.locator('main')).toHaveAttribute('lang', 'en');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://image.complianttools.com/${route}`,
      );
      await expect(page.getByText('Processed on your device. Nothing is uploaded.')).toBeVisible();
    });
  }

  test('localized routes preserve direction and localized canonical', async ({ page }) => {
    await page.goto('/ar/collage');
    await expect(page.locator('main')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://image.complianttools.com/ar/collage',
    );
  });
});
