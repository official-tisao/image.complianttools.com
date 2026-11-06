import { expect, test } from '@playwright/test';

/**
 * File-selection state for the P4 cutout/composite routes (the family `/expand-image` belongs to).
 *
 * `chooseFile` resets `input.value` so re-picking the same file fires `change` again — and that
 * reset also resets the browser's intrinsic label to "No file chosen" while a file remains
 * selected, which is the bug this suite pins. The component now mirrors the selection in an
 * adjacent `p4-file-status` line driven by component state, so the display is a pure function of
 * the app state and cannot drift from it.
 *
 * The native input itself must stay visible and clickable: several existing suites assert
 * `p4-file-input` visibility and drive it with `setInputFiles`, so a `display: none` "fix" would
 * trade one failure for another.
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
    await page.goto('/expand-image');
    const status = page.getByTestId('p4-file-status');

    // Nothing selected yet: the ready copy stands in, and the input is visible and functional.
    await expect(page.getByTestId('p4-file-input')).toBeVisible();
    await expect(status).toContainText('Choose an image to begin.');
    await expect(page.getByTestId('p4-run')).toBeDisabled();

    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'holiday-photo.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });

    await expect(status).toContainText('holiday-photo.png');
    await expect(status).not.toContainText('No file chosen');
    await expect(page.getByTestId('p4-run')).toBeEnabled();
  });

  test('replacing the image updates the displayed filename', async ({ page }) => {
    await page.goto('/expand-image');
    const status = page.getByTestId('p4-file-status');

    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'first.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('first.png');

    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('second.png');
    await expect(status).not.toContainText('first.png');
    await expect(page.getByTestId('p4-run')).toBeEnabled();
  });

  test('re-picking the same file still updates the selection state', async ({ page }) => {
    // The `input.value = ''` reset exists precisely so `change` fires again for the same file. This
    // is the behaviour a "fix" that keeps the native selection would silently break.
    await page.goto('/expand-image');
    const status = page.getByTestId('p4-file-status');
    const buffer = await fixture(page);

    await page
      .getByTestId('p4-file-input')
      .setInputFiles({ name: 'same.png', mimeType: 'image/png', buffer });
    await expect(status).toContainText('same.png');

    await page
      .getByTestId('p4-file-input')
      .setInputFiles({ name: 'same.png', mimeType: 'image/png', buffer });
    await expect(status).toContainText('same.png');
    await expect(page.getByTestId('p4-run')).toBeEnabled();
  });

  test('Remove clears the selection, disables Run, and allows a fresh selection', async ({
    page,
  }) => {
    await page.goto('/expand-image');
    const status = page.getByTestId('p4-file-status');

    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'to-be-removed.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('to-be-removed.png');

    await page.getByTestId('p4-remove').click();

    // The selection state is gone: the status falls back to the ready copy, Run is disabled, and
    // the source preview disappears with the file it rendered.
    await expect(page.getByTestId('p4-remove')).toHaveCount(0);
    await expect(status).toContainText('Choose an image to begin.');
    await expect(status).not.toContainText('to-be-removed.png');
    await expect(page.getByTestId('p4-run')).toBeDisabled();
    await expect(page.locator('.source img')).toHaveCount(0);

    // And the route accepts a new file afterwards — removal must not wedge the control.
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'fresh.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('fresh.png');
    await expect(page.getByTestId('p4-run')).toBeEnabled();
  });

  test('removing an image after processing clears the generated output too', async ({ page }) => {
    // A removed file withdraws everything derived from it: the preview and the published bytes the
    // clipboard/drag-out would otherwise keep offering (the same invariant `clearOutput` enforces
    // when the input is replaced).
    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'processed.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();

    await page.getByTestId('p4-remove').click();
    await expect(page.getByTestId('p4-preview')).toHaveCount(0);
    await expect(page.getByTestId('p4-download')).toHaveCount(0);
    await expect(page.getByTestId('p4-file-status')).toContainText('Choose an image to begin.');
  });

  test('composite background selection mirrors the same state rules', async ({ page }) => {
    await page.goto('/composite');
    const status = page.getByTestId('p4-background-file-status');

    await page.getByTestId('p4-background-input').setInputFiles({
      name: 'backdrop.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('backdrop.png');

    // The Remove control is composite-only: the background slot has no function on other kinds.
    await page.getByTestId('p4-background-remove').click();
    await expect(page.getByTestId('p4-background-remove')).toHaveCount(0);
    await expect(status).not.toContainText('backdrop.png');
  });

  test('expand route states its flat-colour note beside the dimensions', async ({ page }) => {
    // Honest labelling (README §4.8 T67): the local path pads with the fill colour; it does not
    // generate scene content. Asserting the note here keeps that disclosure load-bearing.
    await page.goto('/expand-image');
    await expect(page.getByTestId('p4-expand-note')).toContainText(/flat-colour/i);

    // The note belongs to the expand branch only.
    await page.goto('/remove-background');
    await expect(page.getByTestId('p4-expand-note')).toHaveCount(0);
  });

  test('localized selection display follows the route locale', async ({ page }) => {
    await page.goto('/ar/expand-image');
    const status = page.getByTestId('p4-file-status');

    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'صورة.png',
      mimeType: 'image/png',
      buffer: await fixture(page),
    });
    await expect(status).toContainText('صورة.png');
    await expect(page.getByTestId('p4-remove')).toHaveText(/إزالة|[؀-ۿ]/u);
  });
});
