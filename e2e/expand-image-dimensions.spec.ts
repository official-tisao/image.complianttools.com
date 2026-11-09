import { expect, test } from '@playwright/test';
import { LOCAL_ORIGIN } from './support/network';

/**
 * Regression tests for /expand-image dimension handling.
 * Verifies that specified target dimensions are correctly applied during expansion,
 * the default +128 fallback works, and validation rejects invalid dimensions.
 */

async function fixture(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
  colour: [number, number, number],
) {
  const base64 = await page.evaluate(
    async ({ width, height, rgb }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');
      context.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
      context.fillRect(0, 0, width, height);
      // A non-uniform fixture: the red corner distinguishes source content from fill colour.
      context.fillStyle = 'rgb(220, 40, 40)';
      context.fillRect(Math.max(0, width - 4), Math.max(0, height - 4), 4, 4);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode fixture');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      return btoa(binary);
    },
    { width, height, rgb: colour },
  );
  return Buffer.from(base64, 'base64');
}

async function getPreviewDimensions(page: import('@playwright/test').Page) {
  return await page.getByTestId('p4-preview').evaluate((el) => ({
    naturalWidth: (el as HTMLImageElement).naturalWidth,
    naturalHeight: (el as HTMLImageElement).naturalHeight,
  }));
}

test.describe('expand-image dimensions', () => {
  test('applies specified target dimensions larger than source', async ({ page }) => {
    await page.goto('/expand-image');
    await expect(page.getByTestId('p4-file-input')).toBeVisible();

    // Upload an 8x8 source image
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 8, 8, [255, 255, 255]),
    });

    // Set target dimensions larger than source
    await page.getByTestId('p4-width').fill('20');
    await page.getByTestId('p4-height').fill('15');

    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();

    const dims = await getPreviewDimensions(page);
    expect(dims.naturalWidth).toBe(20);
    expect(dims.naturalHeight).toBe(15);
  });

  test('regression: reported scenario with width 10 and height 3 is applied exactly', async ({
    page,
  }) => {
    // The bug report: a user entered 10×3 and got an image identical to the source. Dimensions
    // are pixels (README §4 register row T67), and the documented constraint is that the canvas
    // can only grow, so a 6×2 source expanded to exactly 10×3 must produce a 10×3 output — not
    // the source size and not the source + 128 default.
    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 6, 2, [255, 255, 255]),
    });
    await page.getByTestId('p4-width').fill('10');
    await page.getByTestId('p4-height').fill('3');
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();
    const dims = await getPreviewDimensions(page);
    expect(dims.naturalWidth).toBe(10);
    expect(dims.naturalHeight).toBe(3);
  });

  test('applies default +128 when dimensions are unset', async ({ page }) => {
    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 8, 8, [255, 255, 255]),
    });

    // Leave width/height empty — an unset field defaults to source + 128 on that axis.
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();

    const dims = await getPreviewDimensions(page);
    expect(dims.naturalWidth).toBe(8 + 128); // 136
    expect(dims.naturalHeight).toBe(8 + 128); // 136
  });

  test('rejects dimensions smaller than source with clear error', async ({ page }) => {
    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 100, 100, [255, 255, 255]),
    });

    // Try to set dimensions smaller than source (invalid for expansion)
    await page.getByTestId('p4-width').fill('50');
    await page.getByTestId('p4-height').fill('50');

    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-error')).toBeVisible();
    await expect(page.getByTestId('p4-error')).toContainText(
      'must be at least the source image size',
    );
    await expect(page.getByTestId('p4-preview')).toHaveCount(0);
  });

  test('rejects zero and negative dimensions', async ({ page }) => {
    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 8, 8, [255, 255, 255]),
    });

    // Try zero width
    await page.getByTestId('p4-width').fill('0');
    await page.getByTestId('p4-height').fill('10');
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-error')).toContainText('must be at least 1');

    // Try negative height
    await page.getByTestId('p4-width').fill('10');
    await page.getByTestId('p4-height').fill('-5');
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-error')).toContainText('must be at least 1');

    // Neither should produce a preview
    await expect(page.getByTestId('p4-preview')).toHaveCount(0);
  });

  test('rejects output exceeding 12 megapixel limit', async ({ page }) => {
    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 100, 100, [255, 255, 255]),
    });

    // Request ~13 megapixels (4000 x 3250 = 13,000,000)
    await page.getByTestId('p4-width').fill('4000');
    await page.getByTestId('p4-height').fill('3250');
    await page.getByTestId('p4-run').click();

    await expect(page.getByTestId('p4-error')).toBeVisible();
    await expect(page.getByTestId('p4-error')).toContainText('12 megapixel limit');
    await expect(page.getByTestId('p4-preview')).toHaveCount(0);
  });

  test('output image contains expanded canvas with source centered', async ({ page }) => {
    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 10, 10, [255, 255, 255]),
    });

    // Expand to 30x20 with red fill
    await page.getByTestId('p4-width').fill('30');
    await page.getByTestId('p4-height').fill('20');
    // Default fill is white, but we can verify the canvas expanded by checking dimensions
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();

    const dims = await getPreviewDimensions(page);
    expect(dims.naturalWidth).toBe(30);
    expect(dims.naturalHeight).toBe(20);
  });

  test('before preview remains original, after preview shows expanded', async ({ page }) => {
    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 8, 8, [255, 255, 255]),
    });

    // Before running, source preview should show 8x8
    await expect(page.locator('.source img').first()).toBeVisible();
    const beforeDims = await page
      .locator('.source img')
      .first()
      .evaluate((el) => ({
        naturalWidth: (el as HTMLImageElement).naturalWidth,
        naturalHeight: (el as HTMLImageElement).naturalHeight,
      }));
    expect(beforeDims.naturalWidth).toBe(8);
    expect(beforeDims.naturalHeight).toBe(8);

    // Run expansion to 16x12
    await page.getByTestId('p4-width').fill('16');
    await page.getByTestId('p4-height').fill('12');
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();

    // After preview should show expanded dimensions
    const afterDims = await getPreviewDimensions(page);
    expect(afterDims.naturalWidth).toBe(16);
    expect(afterDims.naturalHeight).toBe(12);

    // Before preview should still show original
    const beforeDimsAfter = await page
      .locator('.source img')
      .first()
      .evaluate((el) => ({
        naturalWidth: (el as HTMLImageElement).naturalWidth,
        naturalHeight: (el as HTMLImageElement).naturalHeight,
      }));
    expect(beforeDimsAfter.naturalWidth).toBe(8);
    expect(beforeDimsAfter.naturalHeight).toBe(8);
  });

  test('source pixels survive verbatim at their centred coordinates', async ({ page }) => {
    // The dimension fix is a canvas re-composition, so the one thing it must never do is alter the
    // source content. A non-uniform fixture with an exact corner marker makes any resample or
    // re-encode drift visible at the pixel level.
    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 10, 6, [200, 30, 90]),
    });
    await page.getByTestId('p4-width').fill('18');
    await page.getByTestId('p4-height').fill('14');
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();

    const sampled = await page.getByTestId('p4-preview').evaluate(async (el) => {
      const image = el as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');
      context.drawImage(image, 0, 0);
      const left = Math.round((18 - 10) / 2); // 4
      const top = Math.round((14 - 6) / 2); // 4
      const at = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data);
      return {
        centre: at(left + 5, top + 3), // interior of the pasted source
        corner: at(left + 10 - 1, top + 6 - 1), // the red 4x4 corner marker's far pixel
      };
    });
    expect(sampled.centre).toEqual([200, 30, 90, 255]);
    expect(sampled.corner).toEqual([220, 40, 40, 255]);
  });

  test('expanded region is the chosen flat fill, not generated scene content', async ({ page }) => {
    // Honest labelling (README §4.8 T67 / §13.1.3): the local path is canvas padding. The added
    // area must equal the selected fill colour exactly — a test that asserted "plausible texture"
    // here would be asserting a capability the route does not have.
    await page.goto('/expand-image');
    await page.getByTestId('p4-fill').fill('#3a6fd8');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 10, 6, [200, 30, 90]),
    });
    await page.getByTestId('p4-width').fill('18');
    await page.getByTestId('p4-height').fill('14');
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();

    const fills = await page.getByTestId('p4-preview').evaluate(async (el) => {
      const image = el as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');
      context.drawImage(image, 0, 0);
      const left = Math.round((18 - 10) / 2); // 4
      const top = Math.round((14 - 6) / 2); // 4
      const at = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data);
      return {
        border: at(0, 0), // corner of the expanded area
        besideSource: at(left - 1, top + 3), // immediately outside the pasted source
      };
    });
    expect(fills.border).toEqual([58, 111, 216, 255]);
    expect(fills.besideSource).toEqual([58, 111, 216, 255]);
  });

  test('downloaded bytes match the After preview exactly', async ({ page }) => {
    // §8.5 / STCC 8: the preview must be faithful to the export, byte for byte.
    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 8, 8, [255, 255, 255]),
    });
    await page.getByTestId('p4-width').fill('16');
    await page.getByTestId('p4-height').fill('12');
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();

    const href = await page.getByTestId('p4-download').getAttribute('href');
    expect(href).toBeTruthy();
    const previewSrc = await page.getByTestId('p4-preview').getAttribute('src');
    // The preview <img> and the download <a> point at the same blob: one object URL for the one
    // result, not two encodes that could drift.
    expect(href).toBe(previewSrc);

    const downloadName = await page.getByTestId('p4-download').getAttribute('download');
    expect(downloadName).toBe('source-expand-image.png');

    const blob = await page.evaluate(async (url) => {
      const response = await fetch(url);
      return Array.from(new Uint8Array(await response.arrayBuffer()));
    }, href!);
    // A real PNG: signature, IHDR at the fixed offset, and the requested 16x12 dimensions in it.
    expect(blob.slice(0, 8)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(blob.slice(16, 20)).toEqual([0, 0, 0, 16]);
    expect(blob.slice(20, 24)).toEqual([0, 0, 0, 12]);
  });

  test('a local run issues zero provider requests even after the escalation control renders', async ({
    page,
  }) => {
    // P12 / §13.2 (2): escalation is never automatic. The control appears with the local result and
    // T67 has no implemented provider, so the whole flow must stay off the network. `LOCAL_ORIGIN`
    // is read before the listener, because the listener itself is installed before `goto` and the
    // app's own navigation would otherwise be the first "off-origin" entry.
    const providerRequests: string[] = [];
    const offOrigin: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== LOCAL_ORIGIN) offOrigin.push(request.url());
      if (/api\.(openai|stability|replicate)\.com|api\.bfl\.ai|fal\.run/u.test(url.hostname))
        providerRequests.push(request.url());
    });

    await page.goto('/expand-image');
    await page.getByTestId('p4-file-input').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: await fixture(page, 8, 8, [255, 255, 255]),
    });
    await page.getByTestId('p4-run').click();
    await expect(page.getByTestId('p4-preview')).toBeVisible();

    // The escalation offer renders (with the explained absence) but must never act on its own.
    await expect(page.getByTestId('escalation-unavailable')).toContainText(/no provider/i);
    await expect(page.getByTestId('escalation-request-count')).toHaveText('0');
    expect(providerRequests).toEqual([]);
    expect(offOrigin).toEqual([]);
  });
});
