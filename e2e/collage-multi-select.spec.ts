import { expect, test } from '@playwright/test';

/** Generate a small PNG fixture in-page, so no static fixtures are required. */
async function generatedPng(page: import('@playwright/test').Page, width = 32, height = 32) {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;
      const context = source.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          image.data[offset] = (x * 13 + y * 7) % 256;
          image.data[offset + 1] = (x * 3 + y * 17) % 256;
          image.data[offset + 2] = (x * 23 + y * 5) % 256;
          image.data[offset + 3] = 255;
        }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => source.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode fixture.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      return btoa(binary);
    },
    { width, height },
  );
  return Buffer.from(base64, 'base64');
}

test.describe('collage multi-image selection', () => {
  test('file input is hidden from visible interface with custom button shown', async ({ page }) => {
    await page.goto('/collage');
    const input = page.getByTestId('expansion-input');
    await expect(input).toBeHidden();
    await expect(page.getByRole('button', { name: /Choose Images/i })).toBeVisible();
  });

  test('custom choose-images button triggers file selection', async ({ page }) => {
    await page.goto('/collage');
    await expect(page.getByRole('button', { name: /Choose Images/i })).toBeVisible();
  });

  test('file input has multiple enabled for collage mode', async ({ page }) => {
    await page.goto('/collage');
    await expect(page.getByTestId('expansion-input')).toHaveAttribute('multiple', '');
  });

  test('selecting two or more images in one batch shows every preview', async ({ page }) => {
    await page.goto('/collage');
    const file = await generatedPng(page);
    await page.getByTestId('expansion-input').setInputFiles([
      { name: 'img-a.png', mimeType: 'image/png', buffer: file },
      { name: 'img-b.png', mimeType: 'image/png', buffer: file },
      { name: 'img-c.png', mimeType: 'image/png', buffer: file },
    ]);
    await expect(page.getByTestId('expansion-previews')).toBeVisible();
    await expect(page.getByTestId('preview-0')).toBeVisible();
    await expect(page.getByTestId('preview-1')).toBeVisible();
    await expect(page.getByTestId('preview-2')).toBeVisible();
  });

  test('adding images in a second batch keeps the first batch', async ({ page }) => {
    await page.goto('/collage');
    const file = await generatedPng(page);

    await page.getByTestId('expansion-input').setInputFiles([
      { name: 'img-a.png', mimeType: 'image/png', buffer: file },
      { name: 'img-b.png', mimeType: 'image/png', buffer: file },
    ]);
    await expect(page.getByTestId('preview-1')).toBeVisible();

    await page
      .getByTestId('expansion-input')
      .setInputFiles([{ name: 'img-c.png', mimeType: 'image/png', buffer: file }]);
    await expect(page.getByTestId('preview-0')).toBeVisible();
    await expect(page.getByTestId('preview-1')).toBeVisible();
    await expect(page.getByTestId('preview-2')).toBeVisible();
  });

  test('removing one picture leaves the others untouched', async ({ page }) => {
    await page.goto('/collage');
    const file = await generatedPng(page);

    await page.getByTestId('expansion-input').setInputFiles([
      { name: 'img-a.png', mimeType: 'image/png', buffer: file },
      { name: 'img-b.png', mimeType: 'image/png', buffer: file },
      { name: 'img-c.png', mimeType: 'image/png', buffer: file },
    ]);
    await expect(page.getByTestId('preview-0')).toBeVisible();
    await expect(page.getByTestId('preview-1')).toBeVisible();
    await expect(page.getByTestId('preview-2')).toBeVisible();

    await page.getByTestId('preview-1').getByRole('button').click();

    await expect(page.getByTestId('preview-0')).toBeVisible();
    await expect(page.getByTestId('preview-1')).toBeVisible(); // now holds the former preview-2
    await expect(page.getByTestId('preview-2')).toHaveCount(0);
  });

  test('run button is disabled when fewer than two images are selected', async ({ page }) => {
    await page.goto('/collage');
    const file = await generatedPng(page);

    await page
      .getByTestId('expansion-input')
      .setInputFiles([{ name: 'img-a.png', mimeType: 'image/png', buffer: file }]);
    await expect(page.getByTestId('expansion-run')).toBeDisabled();
  });

  test('run button is enabled once two images are selected', async ({ page }) => {
    await page.goto('/collage');
    const file = await generatedPng(page);

    await page.getByTestId('expansion-input').setInputFiles([
      { name: 'img-a.png', mimeType: 'image/png', buffer: file },
      { name: 'img-b.png', mimeType: 'image/png', buffer: file },
    ]);
    await expect(page.getByTestId('expansion-run')).toBeEnabled();
  });

  test('collage generation processes all selected images and produces a downloadable collage', async ({
    page,
  }) => {
    await page.goto('/collage');
    const file = await generatedPng(page);

    await page.getByTestId('expansion-input').setInputFiles([
      { name: 'img-a.png', mimeType: 'image/png', buffer: file },
      { name: 'img-b.png', mimeType: 'image/png', buffer: file },
      { name: 'img-c.png', mimeType: 'image/png', buffer: file },
    ]);
    await expect(page.getByTestId('preview-2')).toBeVisible();

    await page.getByTestId('expansion-run').click();
    await expect(page.getByTestId('expansion-results')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('expansion-results')).toContainText('collage.png');
  });

  test('after removing one image, collage still processes the remaining images', async ({
    page,
  }) => {
    await page.goto('/collage');
    const file = await generatedPng(page);

    await page.getByTestId('expansion-input').setInputFiles([
      { name: 'img-a.png', mimeType: 'image/png', buffer: file },
      { name: 'img-b.png', mimeType: 'image/png', buffer: file },
      { name: 'img-c.png', mimeType: 'image/png', buffer: file },
    ]);
    await page.getByTestId('preview-1').getByRole('button').click();
    await expect(page.getByTestId('preview-2')).toHaveCount(0);

    await page.getByTestId('expansion-run').click();
    await expect(page.getByTestId('expansion-results')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('expansion-results')).toContainText('collage.png');
  });
});
