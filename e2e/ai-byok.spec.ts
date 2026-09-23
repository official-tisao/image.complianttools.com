import { expect, test } from '@playwright/test';

for (const capability of ['generate', 'edit', 'describe'] as const) {
  test(`AI ${capability} route stays gated without consent or credentials`, async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith('https://provider.example')) external.push(request.url());
    });
    await page.goto(`/ai/${capability}`);
    await expect(page.locator('h1')).toContainText(
      capability === 'generate' ? 'Generator' : capability === 'edit' ? 'Editor' : 'Description',
    );
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 30_000,
    });
    await page.getByTestId('ai-submit').click();
    await expect(page.getByTestId('ai-error')).toContainText('consent-required');
    expect(external).toEqual([]);
  });
}

test('AI localized route exposes canonical and direction', async ({ page }) => {
  await page.goto('/ar/ai/describe');
  await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
    timeout: 30_000,
  });
  await expect(page.locator('main')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://image.complianttools.com/ar/ai/describe',
  );
});
