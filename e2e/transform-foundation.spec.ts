import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const fixture = {
  name: 'generated-transform-fixture.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
};

const routes = [
  ['/crop', 'Crop Image'],
  ['/rotate', 'Rotate & Straighten'],
  ['/flip', 'Flip / Mirror'],
  ['/add-border', 'Border / Frame'],
] as const;

for (const [route, heading] of routes) {
  test(`${route} completes a local transform flow`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.getByTestId('transform-file-input').setInputFiles(fixture);
    await expect(page.getByTestId('compare-canvas')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('transform-output-dimensions')).toContainText('1 × 1 pixels');
    await expect(page.getByTestId('transform-download')).toBeEnabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('transform routes expose localized no-JS shells and completion metadata', async ({ page }) => {
  for (const route of ['/en-XA/crop', '/ar/rotate', '/en-XA/flip', '/ar/add-border']) {
    await page.goto(route);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('input[type=file]')).toBeVisible();
    await expect(page.locator('link[rel=canonical]')).toHaveCount(1);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    if (route.startsWith('/ar')) await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
    else await expect(page.locator('h1')).toContainText('⟦');
  }
});

test('transform routes remain useful with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [route] of routes) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('input[type=file]')).toBeVisible();
    await expect(page.getByText('Questions')).toBeVisible();
  }
  await context.close();
});
