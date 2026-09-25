import { expect, test } from '@playwright/test';

async function fixture(page: import('@playwright/test').Page, colour: [number, number, number]) {
  const base64 = await page.evaluate(async (rgb) => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');
    context.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    context.fillRect(0, 0, 8, 8);
    context.fillStyle = 'rgb(220, 40, 40)';
    context.fillRect(2, 2, 4, 4);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode fixture');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    return btoa(binary);
  }, colour);
  return Buffer.from(base64, 'base64');
}

test('cutout family routes process locally and expose route-specific metadata', async ({
  page,
}) => {
  for (const [route, title] of [
    ['expand-image', 'Expand Image'],
    ['remove-background', 'Remove Background'],
    ['replace-background', 'Replace Background'],
    ['cutout', 'Cutout Refine'],
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
    await page.getByTestId('p4-file-input').setInputFiles({
      name: `${route}.png`,
      mimeType: 'image/png',
      buffer: await fixture(page, [255, 255, 255]),
    });
    await expect(page.getByTestId('p4-run')).toBeEnabled();
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();
    await expect(page.getByTestId('p4-preview')).toHaveJSProperty(
      'naturalWidth',
      route === 'expand-image' ? 136 : 8,
    );
    expect(outside).toEqual([]);
  }
});

test('seamless composite accepts a foreground and background locally', async ({ page }) => {
  await page.goto('/composite');
  await page.getByTestId('p4-file-input').setInputFiles({
    name: 'foreground.png',
    mimeType: 'image/png',
    buffer: await fixture(page, [255, 255, 255]),
  });
  await page.getByTestId('p4-background-input').setInputFiles({
    name: 'background.png',
    mimeType: 'image/png',
    buffer: await fixture(page, [20, 30, 40]),
  });
  await page.getByTestId('p4-run').click();
  await expect(page.getByTestId('p4-preview')).toBeVisible();
  await expect(page.getByTestId('p4-preview')).toHaveJSProperty('naturalWidth', 8);
});

test('localized cutout routes keep direction and canonical metadata', async ({ page }) => {
  await page.goto('/ar/remove-background');
  await expect(page.locator('main')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://image.complianttools.com/ar/remove-background',
  );
  await page.goto('/en-XA/composite');
  await expect(page.locator('main')).toHaveAttribute('lang', 'en-XA');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('⟦');
});
