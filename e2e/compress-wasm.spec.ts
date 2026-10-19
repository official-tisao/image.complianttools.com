import { expect, test, type Page } from '@playwright/test';

const formats = [
  { id: 'jpeg', mime: 'image/jpeg', extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
  {
    id: 'png',
    mime: 'image/png',
    extension: 'png',
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { id: 'webp', mime: 'image/webp', extension: 'webp', signature: [0x52, 0x49, 0x46, 0x46] },
] as const;

async function generatedImage(page: Page, mime: (typeof formats)[number]['mime']) {
  const base64 = await page.evaluate(async (type) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      pixels.data[offset] = (offset * 3) % 256;
      pixels.data[offset + 1] = (offset * 7) % 256;
      pixels.data[offset + 2] = (offset * 11) % 256;
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type));
    if (!blob || blob.type !== type) throw new Error(`Could not generate ${type} fixture.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    return btoa(binary);
  }, mime);
  return Buffer.from(base64, 'base64');
}

function hasSignature(bytes: Buffer, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

test.describe('compress codec WASM delivery', () => {
  // Route interception must see fetches made from the encoding worker, not a service-worker cache.
  test.use({ serviceWorkers: 'block' });

  for (const format of formats) {
    test(`/compress uploads valid ${format.id} and returns a valid local result`, async ({
      page,
    }) => {
      const wasmResponses: Array<
        Promise<{ url: string; status: number; contentType: string; magic: number[] }>
      > = [];
      page.on('response', (response) => {
        if (!/\.wasm(?:[?#]|$)/iu.test(response.url())) return;
        wasmResponses.push(
          (async () => {
            const bytes = await response.body();
            return {
              url: response.url(),
              status: response.status(),
              contentType: response.headers()['content-type'] ?? '',
              magic: [...bytes.subarray(0, 4)],
            };
          })(),
        );
      });
      const networkFailures: string[] = [];
      page.on('requestfailed', (request) => networkFailures.push(request.url()));

      await page.goto('/compress');
      await page.waitForLoadState('networkidle');
      const fixture = await generatedImage(page, format.mime);
      await page.locator('[data-testid=file-input]').setInputFiles({
        name: `source.${format.extension}`,
        mimeType: format.mime,
        buffer: fixture,
      });
      await expect(page.getByTestId('compare-canvas')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.options-panel .error')).toHaveCount(0);

      const codecResponses = await Promise.all(wasmResponses);
      expect(
        codecResponses.length,
        'the local codec WASM request should be observed',
      ).toBeGreaterThan(0);
      for (const response of codecResponses) {
        expect(response.status).toBe(200);
        expect(response.contentType).toContain('application/wasm');
        expect(response.magic).toEqual([0x00, 0x61, 0x73, 0x6d]);
        expect(response.url).not.toContain('/node_modules/.vite/deps/');
      }
      expect(networkFailures).toEqual([]);
      await expect
        .poll(() =>
          page
            .locator('.compare-stage img')
            .last()
            .evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('workspace-download').click();
      const download = await downloadPromise;
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      expect(bytes.length).toBeGreaterThan(format.signature.length);
      expect(hasSignature(bytes, format.signature)).toBe(true);
      if (format.id === 'webp') expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    });
  }

  test('reports a missing WASM asset served as HTML without leaking the WebAssembly error', async ({
    page,
  }) => {
    let intercepted = 0;
    await page.route(/\.wasm(?:\?.*)?$/iu, async (route) => {
      intercepted += 1;
      await route.fulfill({
        status: 404,
        contentType: 'text/html',
        body: '<!doctype html><title>Not found</title>',
      });
    });
    await page.goto('/compress');
    await page.waitForLoadState('networkidle');
    const fixture = await generatedImage(page, 'image/png');
    await page.locator('[data-testid=file-input]').setInputFiles({
      name: 'source.png',
      mimeType: 'image/png',
      buffer: fixture,
    });

    const error = page.locator('.options-panel .error');
    await expect(error).toContainText('A local image codec could not be loaded', {
      timeout: 15_000,
    });
    await expect(error).not.toContainText(/WebAssembly|expected magic word|00 61 73 6d/iu);
    expect(intercepted).toBeGreaterThan(0);
  });

  test('reports a codec request redirected to the HTML app shell as a codec-loading failure', async ({
    page,
  }) => {
    let intercepted = 0;
    await page.route(/\.wasm(?:\?.*)?$/iu, async (route) => {
      intercepted += 1;
      await route.fulfill({ status: 302, headers: { location: '/compress' } });
    });
    await page.goto('/compress');
    await page.waitForLoadState('networkidle');
    const fixture = await generatedImage(page, 'image/png');
    await page.locator('[data-testid=file-input]').setInputFiles({
      name: 'redirect-source.png',
      mimeType: 'image/png',
      buffer: fixture,
    });

    const error = page.locator('.options-panel .error');
    await expect(error).toContainText('A local image codec could not be loaded', {
      timeout: 15_000,
    });
    await expect(error).not.toContainText(/WebAssembly|expected magic word|00 61 73 6d/iu);
    expect(intercepted).toBeGreaterThan(0);
  });

  test('reports malformed image bytes as an unreadable image rather than a codec failure', async ({
    page,
  }) => {
    await page.goto('/compress');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid=file-input]').setInputFiles({
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not a PNG'),
    });
    const error = page.locator('.options-panel .error');
    await expect(error).toContainText('The browser could not read this image', { timeout: 10_000 });
    await expect(error).not.toContainText(/WebAssembly|expected magic word|Failed to fetch/iu);
  });
});
