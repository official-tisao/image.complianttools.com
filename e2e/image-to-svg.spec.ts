import { expect, test } from '@playwright/test';

async function pngFixture(page: import('@playwright/test').Page): Promise<Buffer> {
  return Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable.');
      context.fillStyle = '#ef1808';
      context.fillRect(0, 0, 8, 16);
      context.fillStyle = '#0638df';
      context.fillRect(8, 0, 8, 16);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))),
          'image/png',
        ),
      );
      return [...new Uint8Array(await blob.arrayBuffer())];
    }),
  );
}

test('traces configured raster input into the exact previewed SVG locally', async ({ page }) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' && url.origin !== 'http://127.0.0.1:4173')
      crossOrigin.push(url.href);
  });
  await page.goto('/image-to-svg');
  await page.waitForLoadState('networkidle');
  const png = await pngFixture(page);
  await expect(page.getByLabel('Colour count')).toHaveValue('16');
  await expect(page.getByRole('slider', { name: 'Curve tolerance' })).toHaveValue('1');
  await page.getByLabel('Colour count').fill('2');
  await page.getByRole('spinbutton', { name: 'Curve tolerance value' }).fill('4');
  await page.locator('input[type=file]').setInputFiles({
    name: 'two-colours.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.getByRole('button', { name: 'Trace image' }).click();
  await expect(page.getByRole('status')).toContainText('Traced two-colours.png locally');
  const preview = page.getByRole('img', { name: 'Traced SVG export preview' });
  await expect(preview).toBeVisible();
  const previewUrl = await preview.getAttribute('src');
  expect(previewUrl).toMatch(/^blob:/u);
  const previewText = await page.evaluate(
    async (url) => await (await fetch(url!)).text(),
    previewUrl,
  );
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const download = await pending;
  const exported = Buffer.concat(await (await download.createReadStream()).toArray()).toString();
  expect(exported).toBe(previewText);
  expect(exported).toContain('<svg');
  expect(exported).not.toMatch(/(?:href|xlink:href)=["']https?:/u);
  expect(crossOrigin).toEqual([]);
});

test('rejects corrupt raster input without creating a download', async ({ page }) => {
  await page.goto('/image-to-svg');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
  await page.getByRole('button', { name: 'Trace image' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download SVG' })).toBeDisabled();
});

test('vectorizer controls and actions follow keyboard focus order', async ({ page }) => {
  await page.goto('/image-to-svg');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Colour count').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('slider', { name: 'Curve tolerance' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('spinbutton', { name: 'Curve tolerance value' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('input[type=file]')).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} vectorizer exports the exact previewed SVG with locale layout`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/image-to-svg`);
    await page.waitForLoadState('networkidle');
    const png = await pngFixture(page);
    await page.locator('input[type=file]').setInputFiles({
      name: `${locale}.png`,
      mimeType: 'image/png',
      buffer: png,
    });
    await page.locator('main > button').first().click();
    const preview = page.locator('section img');
    await expect(preview).toBeVisible();
    const previewUrl = await preview.getAttribute('src');
    const previewText = await page.evaluate(
      async (url) => await (await fetch(url!)).text(),
      previewUrl,
    );
    const pending = page.waitForEvent('download');
    await page.locator('main > button').nth(1).click();
    const exported = Buffer.concat(
      await (await (await pending).createReadStream()).toArray(),
    ).toString();
    expect(exported).toBe(previewText);
    expect(exported).not.toMatch(/(?:href|xlink:href)=["']https?:/u);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/image-to-svg`,
    );
  });
}
