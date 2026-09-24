import { expect, test } from '@playwright/test';

async function fixture(page: import('@playwright/test').Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 6;
    canvas.height = 4;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');
    const image = context.createImageData(6, 4);
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const pixel = offset / 4;
      image.data[offset] = (pixel * 41) % 256;
      image.data[offset + 1] = (pixel * 73) % 256;
      image.data[offset + 2] = (pixel * 109) % 256;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode fixture');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

test('advanced colour routes process a still image locally', async ({ page }) => {
  for (const [route, title] of [
    ['adjust', 'Adjust'],
    ['filters', 'Filters'],
    ['curves', 'Curves'],
    ['color-space', 'Colour Space'],
    ['enhance', 'Enhance'],
    ['color-picker', 'Colour Picker'],
    ['recolor', 'Recolour'],
  ] as const) {
    await page.goto(`/${route}`);
    await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${route}`,
    );
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    const origin = new URL(page.url()).origin;
    const outside: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== origin) outside.push(request.url());
    });
    await page.getByTestId('p3a-file-input').setInputFiles({
      name: `${route}.png`,
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await page.getByTestId('p3a-run').click();
    await expect(page.getByTestId('p3a-preview')).toBeVisible();
    await expect(page.getByTestId('p3a-preview')).toHaveJSProperty('naturalWidth', 6);
    if (route === 'color-picker') await expect(page.getByTestId('p3a-palette')).toBeVisible();
    expect(outside).toEqual([]);
  }
});

test('advanced colour routes retain localized SEO direction', async ({ page }) => {
  await page.goto('/ar/adjust');
  await expect(page.locator('main')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://image.complianttools.com/ar/adjust',
  );
  await page.goto('/en-XA/curves');
  await expect(page.locator('main')).toHaveAttribute('lang', 'en-XA');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('⟦');
});
