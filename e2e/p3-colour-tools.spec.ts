import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function fixture(page: import('@playwright/test').Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 2;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    const image = context.createImageData(4, 2);
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const dark = offset % 8 === 0;
      image.data[offset] = dark ? 24 : 220;
      image.data[offset + 1] = dark ? 36 : 180;
      image.data[offset + 2] = dark ? 48 : 140;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the generated PNG fixture.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

for (const [route, title] of [
  ['threshold', 'Threshold'],
  ['sharpen', 'Sharpen and Blur'],
  ['duotone', 'Duotone'],
] as const) {
  test(`${route} serves localized SEO metadata and processes a still PNG locally`, async ({
    page,
  }) => {
    await page.goto(`/${route}`);
    await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${route}`,
    );
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    await expect(page.locator('.tool-completion details')).toHaveCount(3);
    const outsideRequests: string[] = [];
    const appOrigin = new URL(page.url()).origin;
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== appOrigin) outsideRequests.push(request.url());
    });
    await page.locator('input[type=file]').setInputFiles({
      name: `${route}.png`,
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(page.getByTestId('p3-run')).toBeEnabled();
    await page.getByTestId('p3-run').click();
    await expect(page.getByTestId('p3-preview')).toBeVisible();
    await expect(page.getByTestId('p3-preview')).toHaveJSProperty('naturalWidth', 4);
    const previewUrl = await page.getByTestId('p3-preview').getAttribute('src');
    expect(previewUrl).toMatch(/^blob:/u);
    const previewBytes = await page.evaluate(
      async (url) => Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer())),
      previewUrl,
    );
    const downloadWaiter = page.waitForEvent('download');
    await page.getByTestId('p3-download').click();
    const download = await downloadWaiter;
    expect(await download.path()).not.toBeNull();
    const downloadedBytes = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of downloadedBytes!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(previewBytes));
    expect(outsideRequests).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('P3 colour routes render Arabic and pseudo-localized shells', async ({ page }) => {
  await page.goto('/ar/threshold');
  await expect(page.locator('main')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('h1')).toHaveText('العتبة');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://image.complianttools.com/ar/threshold',
  );

  await page.goto('/en-XA/duotone');
  await expect(page.locator('main')).toHaveAttribute('lang', 'en-XA');
  await expect(page.locator('h1')).toContainText('⟦');
  await expect(page.locator('h1')).toContainText('⟧');
});
