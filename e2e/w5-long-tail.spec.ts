import { expect, test } from '@playwright/test';

const routes = [
  ['spritesheet', 'Spritesheet Maker'],
  ['html-to-image', 'HTML to Image'],
  ['compress-to-size', 'Compress to Target Size'],
  ['optimize-for-web', 'Optimize for Web'],
  ['batch', 'Batch Runner'],
  ['recipe', 'Recipe Builder'],
  ['watch', 'Folder Watcher'],
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

  test('HTML card export stays local and produces a download link', async ({ page }) => {
    await page.goto('/html-to-image');
    await page.getByTestId('html-input').fill('<h1>CC0 fixture</h1><p>Local card</p>');
    await page.getByTestId('long-tail-run').click();
    await expect(page.getByTestId('long-tail-download')).toHaveAttribute(
      'download',
      'html-card.png',
    );
  });
});
