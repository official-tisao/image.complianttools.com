import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  ['add-text', 't49', 'text'],
  ['watermark', 't50', 'watermark'],
  ['meme-generator', 't51', 'meme'],
  ['draw', 't52', 'draw'],
  ['signature', 't53', 'signature'],
] as const;

async function generatedPng(page: import('@playwright/test').Page, width = 32, height = 24) {
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

async function openRoute(
  page: import('@playwright/test').Page,
  locale: 'en' | 'en-XA' | 'ar',
  route: string,
) {
  const prefix = locale === 'en' ? '' : `/${locale}`;
  await page.goto(`${prefix}/${route}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `https://image.complianttools.com${prefix}/${route}`,
  );
  await expect(page.locator('link[rel="alternate"]')).toHaveCount(4);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await expect(page.locator('main')).toHaveAttribute('lang', locale);
  await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  if (locale === 'en-XA') await expect(page.locator('h1')).toContainText('⟦');
}

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  for (const [route, testId] of routes) {
    test(`${locale}/${route} exposes localized metadata and local privacy copy`, async ({
      page,
    }) => {
      await openRoute(page, locale, route);
      await expect(page.getByTestId(`${testId}-input`)).toHaveCount(1);
    });
  }
}

test('T49 text and T50 watermark render locally and export while offline', async ({ page }) => {
  for (const [route, testId, mode] of [
    ['add-text', 't49', 'text'],
    ['watermark', 't50', 'watermark'],
  ] as const) {
    await openRoute(page, 'en', route);
    await page.getByTestId(`${testId}-input`).setInputFiles({
      name: `${mode}.png`,
      mimeType: 'image/png',
      buffer: await generatedPng(page),
    });
    await expect(page.getByTestId(`${testId}-canvas`)).toBeVisible();
    const before = await page
      .getByTestId(`${testId}-canvas`)
      .evaluate((element) => (element as HTMLCanvasElement).toDataURL('image/png'));
    await page.getByTestId(`${testId}-text`).fill(mode === 'text' ? 'Hello' : '© local');
    await page.getByTestId(`${testId}-add`).click();
    const after = await page
      .getByTestId(`${testId}-canvas`)
      .evaluate((element) => (element as HTMLCanvasElement).toDataURL('image/png'));
    expect(after).not.toEqual(before);
    await page.context().setOffline(true);
    try {
      const download = page.waitForEvent('download');
      await page.getByTestId(`${testId}-download`).click();
      expect((await download).suggestedFilename()).toContain('.png');
    } finally {
      await page.context().setOffline(false);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});

test('T51 meme captions render locally and export a PNG', async ({ page }) => {
  await openRoute(page, 'en', 'meme-generator');
  await page
    .getByTestId('t51-input')
    .setInputFiles({ name: 'meme.png', mimeType: 'image/png', buffer: await generatedPng(page) });
  await page.getByTestId('t51-top').fill('TOP');
  await page.getByTestId('t51-bottom').fill('BOTTOM');
  await page.getByTestId('t51-add').click();
  await expect(page.getByTestId('t51-canvas')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTestId('t51-download').click();
  expect((await download).suggestedFilename()).toBe('meme-meme-generator.png');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T52 supports pointer drawing and shape controls without network requests', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  await openRoute(page, 'en', 'draw');
  const origin = new URL(page.url()).origin;
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url());
  });
  await page
    .getByTestId('t52-input')
    .setInputFiles({ name: 'draw.png', mimeType: 'image/png', buffer: await generatedPng(page) });
  const canvas = page.getByTestId('t52-canvas');
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Canvas has no layout box.');
  await page.mouse.move(bounds.x + 10, bounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 10, bounds.y + bounds.height - 10, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId('t52-shape').selectOption('rectangle');
  await expect(page.getByTestId('t52-shape')).toHaveValue('rectangle');
  const download = page.waitForEvent('download');
  // WebKit/Firefox can retain the canvas pointer capture after the drag and
  // miss a synthetic pointer click on a button below the canvas. Exercise the
  // same native button activation through its keyboard contract.
  await page.getByTestId('t52-download').focus();
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toBe('draw-draw.png');
  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T53 draws a local signature on a blank pad and exports it', async ({ page }) => {
  await openRoute(page, 'en', 'signature');
  const canvas = page.getByTestId('t53-canvas');
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Signature pad has no layout box.');
  await page.mouse.move(bounds.x + 20, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 20, bounds.y + bounds.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('t53-clear').click();
  await page.getByTestId('t53-download').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('t53-download').click();
  expect((await download).suggestedFilename()).toBe('signature-signature.png');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T49 returns a typed remedy for unsupported input', async ({ page }) => {
  await openRoute(page, 'en', 'add-text');
  await page
    .getByTestId('t49-input')
    .setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') });
  await expect(page.getByRole('alert')).toHaveAttribute('data-error-kind', 'unsupported');
  await expect(page.getByRole('alert')).toContainText('Choose a valid PNG image');
});
