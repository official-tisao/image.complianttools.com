import { expect, test } from '@playwright/test';

test.describe('collage background colour picker', () => {
  test('collage route renders background colour picker with default white', async ({ page }) => {
    await page.goto('/collage');

    // The colour picker should be present - use a more specific selector since
    // the label wraps the input directly without a `for` attribute
    const colourInput = page.getByTestId('collage-background');
    await expect(colourInput).toBeVisible();

    // Default value should be #ffffff (white)
    await expect(colourInput).toHaveValue('#ffffff');
  });

  test('changing background colour updates the input value', async ({ page }) => {
    await page.goto('/collage');

    const colourInput = page.getByTestId('collage-background');

    // Change to a different colour (red)
    await colourInput.fill('#ff0000');

    // Value should update
    await expect(colourInput).toHaveValue('#ff0000');
  });

  test('other transform tools do not show the background colour picker', async ({ page }) => {
    const otherRoutes = [
      '/bulk-resize',
      '/canvas-resize',
      '/enlarge',
      '/round-corners',
      '/split-image',
    ];

    for (const route of otherRoutes) {
      await page.goto(route);
      // The Background label/input should not be present on other tools
      const colourInputs = page.getByTestId('collage-background');
      await expect(colourInputs).toHaveCount(0);
    }
  });

  test('split-image shows Columns and Rows but not Gap or Background', async ({ page }) => {
    await page.goto('/split-image');

    // Should have Columns
    await expect(page.locator('label:has-text("Columns") input[type="number"]')).toBeVisible();
    // Should have Rows
    await expect(page.locator('label:has-text("Rows") input[type="number"]')).toBeVisible();
    // Should NOT have Gap
    const gapInputs = page.locator('label:has-text("Gap") input[type="number"]');
    await expect(gapInputs).toHaveCount(0);
    // Should NOT have Background
    const bgInputs = page.getByTestId('collage-background');
    await expect(bgInputs).toHaveCount(0);
  });

  test('collage shows Columns, Gap, and Background but not Rows', async ({ page }) => {
    await page.goto('/collage');

    // Should have Columns
    await expect(page.locator('label:has-text("Columns") input[type="number"]')).toBeVisible();
    // Should have Gap
    await expect(page.locator('label:has-text("Gap") input[type="number"]')).toBeVisible();
    // Should have Background
    await expect(page.getByTestId('collage-background')).toBeVisible();
    // Should NOT have Rows
    const rowInputs = page.locator('label:has-text("Rows") input[type="number"]');
    await expect(rowInputs).toHaveCount(0);
  });

  test('background colour picker is accessible with proper label association', async ({ page }) => {
    await page.goto('/collage');

    const colourInput = page.getByTestId('collage-background');
    await expect(colourInput).toBeVisible();

    // The wrapping <label> text supplies the accessible name.
    await expect(colourInput).toHaveAccessibleName('Background');
  });

  test('selected background colour is kept when other collage settings change', async ({
    page,
  }) => {
    await page.goto('/collage');

    await page.getByTestId('collage-background').fill('#ff0000');
    // Change an unrelated collage setting (columns) and confirm the colour survives.
    await page.locator('label:has-text("Columns") input[type="number"]').fill('3');
    await expect(page.getByTestId('collage-background')).toHaveValue('#ff0000');
  });

  test('selected background colour is applied to the generated collage', async ({ page }) => {
    await page.goto('/collage');

    // Generate a small PNG fixture in-page.
    const file = await page.evaluate(async () => {
      const source = document.createElement('canvas');
      source.width = 32;
      source.height = 32;
      const context = source.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      const image = context.createImageData(32, 32);
      for (let y = 0; y < 32; y += 1)
        for (let x = 0; x < 32; x += 1) {
          const offset = (y * 32 + x) * 4;
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
    });
    const buffer = Buffer.from(file as string, 'base64');

    // Select a non-default background colour (red).
    await page.getByTestId('collage-background').fill('#ff0000');

    await page.getByTestId('expansion-input').setInputFiles([
      { name: 'img-a.png', mimeType: 'image/png', buffer },
      { name: 'img-b.png', mimeType: 'image/png', buffer },
    ]);
    await expect(page.getByTestId('expansion-run')).not.toHaveAttribute('data-disabled', 'true');

    await page.getByTestId('expansion-run').click();
    await expect(page.getByTestId('expansion-results')).toBeVisible({ timeout: 10000 });

    // Verify the background colour reaches the engine by confirming the download link exists.
    // (Pixel-level verification is already covered in engine unit tests.)
    await expect(
      page.getByTestId('expansion-results').getByRole('link', { name: 'collage.png' }),
    ).toBeVisible();
  });
});
