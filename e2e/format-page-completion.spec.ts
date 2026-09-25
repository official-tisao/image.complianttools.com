import { expect, test } from '@playwright/test';

const routes = [
  'heic-converter',
  'raw-converter',
  'avif-converter',
  'webp-converter',
  'jxl-converter',
  'svg-to-png',
  'image-to-svg',
  'pdf-to-image',
  'image-to-pdf',
  'favicon-generator',
  'gif-converter',
  'embedded-converter',
  'base64-image',
  'cbz-converter',
] as const;

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  for (const route of routes) {
    test(`${locale}/${route} has static format-specific discovery content`, async ({ page }) => {
      const prefix = locale === 'en' ? '' : `/${locale}`;
      await page.goto(`${prefix}/${route}`);
      await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        'https://image.complianttools.com/og/tools.svg',
      );
      const graphScript = page.locator('script[type="application/ld+json"]');
      // Pick the script that contains the FAQPage graph (not just the first script)
      const scriptContents = await graphScript.allTextContents();
      const faqScriptContent =
        scriptContents.find((text) => text.includes('FAQPage')) ||
        scriptContents[scriptContents.length - 1] ||
        '';
      const graph = JSON.parse(faqScriptContent || '{}')['@graph'] as
        Array<{ '@type': string; mainEntity?: unknown[] }> | undefined;
      if (graph) {
        expect(graph.map((entry) => entry['@type'])).toEqual([
          'SoftwareApplication',
          'FAQPage',
          'BreadcrumbList',
        ]);
        expect(graph.find((entry) => entry['@type'] === 'FAQPage')?.mainEntity).toHaveLength(3);
      }
      await expect(page.locator('.format-completion details')).toHaveCount(3);
      await expect(page.locator('.format-completion nav a')).toHaveCount(6);
    });
  }
}

test('format tool pages stay within SEO title and description length limits', async ({ page }) => {
  for (const route of routes) {
    await page.goto(`/${route}`);
    const title = await page.title();
    expect(title.length, `${route} title "${title}"`).toBeLessThanOrEqual(60);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description, `${route} description`).toBeTruthy();
    expect(description!.length, `${route} description`).toBeLessThanOrEqual(155);
  }
});

test('format pages retain their static entry points with JavaScript disabled', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const route of routes) {
      await page.goto(`/${route}`);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('input[type=file]')).toHaveCount(1);
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
      await expect(page.locator('.format-completion details')).toHaveCount(3);
      await expect(page.locator('.format-completion nav a')).toHaveCount(6);
    }
  } finally {
    await context.close();
  }
});
