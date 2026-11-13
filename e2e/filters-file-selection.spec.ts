import { expect, test } from '@playwright/test';

/**
 * File-selection state for the P3 Advanced Colour Tools /filters route.
 *
 * The component now mirrors the selection in an adjacent p3a-file-status line driven
 * by component state, so the display is a pure function of the app state and cannot
 * drift from it, even though `choose` resets `input.value` so re-picking the same
 * file fires `change` again. The native input itself stays visible and clickable.
 */

async function fixture(page: import('@playwright/test').Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');
    context.fillStyle = 'rgb(255, 255, 255)';
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
  });
  return Buffer.from(base64, 'base64');
}

test.describe('file selection state', () => {
  test('shows the selected filename and never "No file chosen" while a file is selected', async ({
    page,
  }) => {
    await page.goto('/filters');
    const status = page.getByTestId('p3a-file-status');

    // Nothing selected yet: the ready copy stands in, and the input is visible and functional.
    await expect(page.getByTestId('p3a-file-input')).toBeVisible();
    await expect(status).toContainText('Choose an image to begin.');
    await expect(page.getByTestId('p3a-run')).toBeDisabled();

    await page.getByTestId('p3a-file-input').setInputFiles({
      name: 'holiday-photo.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });

    await expect(status).toContainText('holiday-photo.png');
    await expect(status).not.toContainText('No file chosen');
    await expect(page.getByTestId('p3a-run')).toBeEnabled();
  });

  test('replacing the image updates the displayed filename', async ({ page }) => {
    await page.goto('/filters');
    const status = page.getByTestId('p3a-file-status');

    await page.getByTestId('p3a-file-input').setInputFiles({
      name: 'first.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('first.png');

    await page.getByTestId('p3a-file-input').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('second.png');
    await expect(status).not.toContainText('first.png');
    await expect(page.getByTestId('p3a-run')).toBeEnabled();
  });

  test('re-picking the same file still updates the selection state', async ({ page }) => {
    // The `input.value = ''` reset exists precisely so `change` fires again for the same file. This
    // is the behaviour a "fix" that keeps the native selection would silently break.
    await page.goto('/filters');
    const status = page.getByTestId('p3a-file-status');
    const buffer = await fixture(page);

    await page
      .getByTestId('p3a-file-input')
      .setInputFiles({ name: 'same.png', mimeType: 'image/png', buffer });
    await expect(status).toContainText('same.png');

    await page
      .getByTestId('p3a-file-input')
      .setInputFiles({ name: 'same.png', mimeType: 'image/png', buffer });
    await expect(status).toContainText('same.png');
    await expect(page.getByTestId('p3a-run')).toBeEnabled();
  });

  test('Remove clears the selection, disables Run, and allows a fresh selection', async ({
    page,
  }) => {
    await page.goto('/filters');
    const status = page.getByTestId('p3a-file-status');

    await page.getByTestId('p3a-file-input').setInputFiles({
      name: 'to-be-removed.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('to-be-removed.png');

    await page.getByTestId('p3a-remove').click();

    // The selection state is gone: the status falls back to the ready copy, Run is disabled, and
    // the source preview disappears with the file it rendered.
    await expect(page.getByTestId('p3a-remove')).toHaveCount(0);
    await expect(status).toContainText('Choose an image to begin.');
    await expect(status).not.toContainText('to-be-removed.png');
    await expect(page.getByTestId('p3a-run')).toBeDisabled();
    await expect(page.locator('.source img')).toHaveCount(0);

    // And the route accepts a new file afterwards — removal must not wedge the control.
    await page.getByTestId('p3a-file-input').setInputFiles({
      name: 'fresh.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('fresh.png');
    await expect(page.getByTestId('p3a-run')).toBeEnabled();
  });

  test('removing an image after processing clears the generated output too', async ({ page }) => {
    // A removed file withdraws everything derived from it: the preview and the published bytes the
    // clipboard/drag-out would otherwise keep offering (the same invariant `clearOutput` enforces
    // when the input is replaced).
    await page.goto('/filters');
    await page.getByTestId('p3a-file-input').setInputFiles({
      name: 'processed.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await page.getByTestId('p3a-run').click();
    await expect(page.getByTestId('p3a-preview')).toBeVisible();

    await page.getByTestId('p3a-remove').click();
    await expect(page.getByTestId('p3a-preview')).toHaveCount(0);
    await expect(page.getByTestId('p3a-download')).toHaveCount(0);
    await expect(page.getByTestId('p3a-file-status')).toContainText('Choose an image to begin.');
  });

  test('selecting another image after removal works', async ({ page }) => {
    await page.goto('/filters');
    const status = page.getByTestId('p3a-file-status');

    await page.getByTestId('p3a-file-input').setInputFiles({
      name: 'first.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('first.png');
    await page.getByTestId('p3a-remove').click();
    await expect(status).toContainText('Choose an image to begin.');

    await page.getByTestId('p3a-file-input').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('second.png');
    await expect(page.getByTestId('p3a-run')).toBeEnabled();
  });

  test('re-selecting the same image works', async ({ page }) => {
    await page.goto('/filters');
    const status = page.getByTestId('p3a-file-status');
    const buffer = await fixture(page);

    await page
      .getByTestId('p3a-file-input')
      .setInputFiles({ name: 'same.png', mimeType: 'image/png', buffer });
    await expect(status).toContainText('same.png');

    await page
      .getByTestId('p3a-file-input')
      .setInputFiles({ name: 'same.png', mimeType: 'image/png', buffer });
    await expect(status).toContainText('same.png');
    await expect(page.getByTestId('p3a-run')).toBeEnabled();
  });
});
