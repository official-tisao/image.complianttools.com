import { expect, test } from '@playwright/test';

async function fixture(page: import('@playwright/test').Page, colour: [number, number, number]) {
  const base64 = await page.evaluate(async (rgb) => {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 16;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');
    context.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgb(220, 40, 40)';
    context.fillRect(8, 4, 8, 8);
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

test('denoise route processes a still image without network requests', async ({ page }) => {
  await page.goto('/denoise');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Denoise');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://image.complianttools.com/denoise',
  );
  const origin = new URL(page.url()).origin;
  const outside: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) outside.push(request.url());
  });
  await page.getByTestId('p44-source').setInputFiles({
    name: 'noise.png',
    mimeType: 'image/png',
    buffer: await fixture(page, [90, 90, 90]),
  });
  await page.getByTestId('local-tool-run').click();
  await expect(page.getByTestId('local-tool-preview')).toBeVisible();
  expect(outside).toEqual([]);
});

test('layered editor composites two local layers', async ({ page }) => {
  await page.goto('/editor');
  await page.getByTestId('p44-source').setInputFiles({
    name: 'base.png',
    mimeType: 'image/png',
    buffer: await fixture(page, [40, 80, 120]),
  });
  await page.getByTestId('p48-layer').setInputFiles({
    name: 'layer.png',
    mimeType: 'image/png',
    buffer: await fixture(page, [180, 40, 20]),
  });
  await page.getByTestId('p48-opacity').fill('0.5');
  await page.getByTestId('local-tool-run').click();
  await expect(page.getByTestId('local-tool-preview')).toBeVisible();
});

test('remove-object lets the user paint a local mask before inpainting', async ({ page }) => {
  await page.goto('/remove-object');
  await page.getByTestId('p44-source').setInputFiles({
    name: 'object.png',
    mimeType: 'image/png',
    buffer: await fixture(page, [240, 240, 240]),
  });
  const canvas = page.getByTestId('local-source-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Source canvas has no bounds');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.getByTestId('local-tool-run').click();
  await expect(page.getByTestId('local-tool-preview')).toBeVisible();
});

test('T44, T48, and T66 localized pages keep direction and canonical metadata', async ({
  page,
}) => {
  await page.goto('/ar/denoise');
  await expect(page.locator('main')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://image.complianttools.com/ar/denoise',
  );
  await page.goto('/en-XA/remove-object');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('⟦');
});
