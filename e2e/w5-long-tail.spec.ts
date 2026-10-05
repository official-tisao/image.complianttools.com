import { expect, test } from '@playwright/test';

/**
 * The routes still served by the generic `LongTailTool` shell.
 *
 * `spritesheet`, `html-to-image`, `compress-to-size`, and `watch` were removed from this list in
 * P6-01: they now have dedicated components with their own schemas, typed errors, and previews,
 * and are covered by `e2e/p6-01-tools.spec.ts` instead. This file still covers the four the
 * shell serves.
 */
const routes = [
  ['optimize-for-web', 'Optimize for Web'],
  ['batch', 'Batch Runner'],
  ['recipe', 'Recipe Builder'],
  ['codegen', 'Code Generator'],
] as const;

test.describe('W5 long-tail tools', () => {
  for (const [route, title] of routes) {
    test(`${route} has local-only SEO and a usable shell`, async ({ page }) => {
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

  test('recipe builder validates JSON and emits a shareable fragment', async ({ page }) => {
    await page.goto('/recipe');
    await page.getByTestId('long-tail-run').click();
    await expect(page.getByTestId('long-tail-status')).toContainText('validated');
    await expect(page.getByTestId('generated-output')).toContainText('/recipe#recipe=r1.');
  });

  test('code generator produces a typed engine starter from the default recipe', async ({
    page,
  }) => {
    await page.goto('/codegen');
    await page.getByTestId('long-tail-run').click();
    await expect(page.getByTestId('generated-output')).toContainText(
      '@complianttools/image-engine/pipeline/execute',
    );
    await expect(page.getByTestId('long-tail-status')).toContainText('generated');
  });

  test('web export produces a local download link', async ({ page }) => {
    await page.goto('/optimize-for-web');
    await expect(page.getByTestId('long-tail-input')).toBeVisible();
    await expect(page.getByTestId('quality')).toBeVisible();
  });
});
