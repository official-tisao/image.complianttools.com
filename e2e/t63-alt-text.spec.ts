import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function generatedPng(page: import('@playwright/test').Page, width = 16, height = 10) {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.fillStyle = '#7799bb';
      context.fillRect(0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated T63 PNG fixture.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      }
      return btoa(binary);
    },
    { width, height },
  );
  return Buffer.from(base64, 'base64');
}

async function generatedLargePng(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
) {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.fillStyle = '#778899';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated large T63 fixture.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      }
      return btoa(binary);
    },
    { width, height },
  );
  return Buffer.from(base64, 'base64');
}

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`${locale}/alt-text is prerendered with localized SEO metadata`, async ({
    page,
    request,
  }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/alt-text`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await expect(page.locator('textarea')).toHaveCount(1);
    await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com${prefix}/alt-text`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    await expect(page.locator('main')).toHaveAttribute('lang', locale);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    expect(
      (await page.locator('meta[name="description"]').getAttribute('content'))?.length,
    ).toBeLessThanOrEqual(155);

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain('/alt-text</loc>');
  });
}

test('T63 static Arabic page explains the human-only scope without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/ar/alt-text');
  await expect(page.locator('h1')).toHaveText('مراجعة النص البديل');
  await expect(page.getByText('هل تنشئ الأداة النص البديل تلقائيًا؟')).toBeVisible();
  await expect(page.locator('input[type=file]')).toBeVisible();
  await expect(page.locator('textarea')).toBeVisible();
  await context.close();
});

test('T63 previews a local image, drafts and reviews alt text by keyboard, and works offline', async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  const appOrigin = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:4173').origin;
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== appOrigin) externalRequests.push(request.url());
  });
  await page.goto('/alt-text');
  const imageBuffer = await generatedPng(page);

  await page.getByTestId('t63-file-input').setInputFiles({
    name: 'manual-review.png',
    mimeType: 'image/png',
    buffer: imageBuffer,
  });
  await expect(page.getByTestId('t63-preview-image')).toHaveJSProperty('naturalWidth', 16);
  await context.setOffline(true);
  await expect(page.getByTestId('t63-attribute-empty')).toBeVisible();
  await expect(page.getByTestId('t63-copy')).toBeDisabled();

  const textarea = page.getByTestId('t63-alt-text');
  await textarea.focus();
  await page.keyboard.type('A "blue" map & legend');
  await expect(page.getByTestId('t63-attribute')).toHaveText(
    'alt="A &quot;blue&quot; map &amp; legend"',
  );

  const purposeReview = page.getByRole('checkbox', {
    name: 'I described the image’s purpose in this page context',
  });
  await purposeReview.focus();
  await page.keyboard.press('Space');
  await expect(purposeReview).toBeChecked();

  const decorative = page.getByRole('checkbox', { name: 'Mark image as decorative' });
  await decorative.focus();
  await page.keyboard.press('Space');
  await expect(decorative).toBeChecked();
  await expect(page.getByTestId('t63-attribute')).toHaveText('alt=""');
  await expect(textarea).toBeDisabled();
  await page.keyboard.press('Space');
  await expect(decorative).not.toBeChecked();
  await expect(page.getByTestId('t63-attribute')).toHaveText(
    'alt="A &quot;blue&quot; map &amp; legend"',
  );

  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T63 copies the exact escaped attribute shown in the preview', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium', 'Clipboard verification runs in Chromium.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/alt-text');
  await page.getByTestId('t63-file-input').setInputFiles({
    name: 'copy-review.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  // The local decode is asynchronous. Wait for the source before asserting the
  // editable draft and clipboard preview are enabled.
  await expect(page.getByTestId('t63-preview-image')).toHaveJSProperty('naturalWidth', 16);
  await page.getByTestId('t63-alt-text').fill('A & useful description');
  const preview = await page.getByTestId('t63-attribute').textContent();
  const expected = 'alt="A &amp; useful description"';
  expect(preview).toBe(expected);
  await page.getByTestId('t63-copy').click();
  await expect(page.getByRole('status')).toHaveText('Attribute copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(preview);
});

test('T63 reports typed file and draft errors with remedies', async ({ page }) => {
  await page.goto('/alt-text');
  const input = page.getByTestId('t63-file-input');
  // Firefox can expose the prerendered input for one frame before Svelte has
  // attached its change handler. Let hydration settle before injecting a file
  // through the DOM so this accept-filter bypass exercises the route handler.
  await input.evaluate(
    async () =>
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await input.evaluate((element) => {
    const file = new File(['not an image'], 'unsupported.txt', { type: 'text/plain' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const fileInput = element as HTMLInputElement;
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByTestId('t63-file-error')).toHaveAttribute(
    'data-error-kind',
    'unsupported-file',
  );
  await expect(page.getByTestId('t63-file-error')).toContainText('Export a still PNG');

  await input.evaluate((element) => {
    const file = new File([new Uint8Array([1])], 'too-large.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { configurable: true, value: 16 * 1024 * 1024 + 1 });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const fileInput = element as HTMLInputElement;
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByTestId('t63-file-error')).toHaveAttribute(
    'data-error-kind',
    'file-too-large',
  );
  await expect(page.getByTestId('t63-file-error')).toContainText('smaller than 16 MiB');

  await input.setInputFiles({
    name: 'too-many-pixels.png',
    mimeType: 'image/png',
    buffer: await generatedLargePng(page, 3000, 2001),
  });
  await expect(page.getByTestId('t63-file-error')).toHaveAttribute(
    'data-error-kind',
    'image-too-large',
  );
  await expect(page.getByTestId('t63-file-error')).toContainText('6 megapixels or less');

  await input.setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid png bytes'),
  });
  await expect(page.getByTestId('t63-file-error')).toHaveAttribute(
    'data-error-kind',
    'decode-failed',
  );
  await expect(page.getByTestId('t63-file-error')).toContainText('Export a valid image');

  await input.setInputFiles({
    name: 'long-draft.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  const textarea = page.getByTestId('t63-alt-text');
  await textarea.evaluate((element) => {
    const input = element as HTMLTextAreaElement;
    input.value = 'x'.repeat(126);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  await expect(page.getByTestId('t63-draft-error')).toHaveAttribute(
    'data-error-kind',
    'text-too-long',
  );
  await expect(page.getByTestId('t63-draft-error')).toContainText('Shorten the draft to 125');
});

test('T63 previews a six-megapixel image within its operation budget', async ({ page }) => {
  await page.goto('/alt-text');
  const file = await generatedLargePng(page, 3000, 2000);
  const started = await page.evaluate(() => performance.now());
  await page.getByTestId('t63-file-input').setInputFiles({
    name: 'six-megapixel.png',
    mimeType: 'image/png',
    buffer: file,
  });
  await expect(page.getByTestId('t63-preview-image')).toHaveJSProperty('naturalWidth', 3000);
  const elapsed = await page.evaluate((start) => performance.now() - start, started);
  console.info(`T63 six-megapixel image-preview latency: ${elapsed.toFixed(1)} ms`);
  expect(elapsed).toBeLessThan(3_000);
});
