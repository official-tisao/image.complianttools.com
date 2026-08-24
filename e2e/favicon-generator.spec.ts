import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';
import fflate from '../packages/engine/node_modules/fflate/lib/node.cjs';

const { unzipSync } = fflate;

const waitForHydration = (page: Page) => page.locator('html[data-hydrated="true"]').waitFor();

async function faviconPng(page: Page) {
  return Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#c83264';
      context.fillRect(0, 0, 2, 2);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob(resolve, 'image/png'));
      return [...new Uint8Array(await blob.arrayBuffer())];
    }),
  );
}

test('downloads the complete deterministic favicon package without network fallback', async ({
  page,
  context,
}) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/favicon-generator');
  await waitForHydration(page);
  const png = await faviconPng(page);
  await page.getByLabel('Site name').fill('Example Site');
  await page.getByLabel('Choose an image').setInputFiles({
    name: 'source.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.getByRole('button', { name: 'Create package' }).click();
  await expect(page.getByRole('status')).toContainText('Created favicon.ico');
  const preview = page.getByRole('img', { name: 'Generated 32 by 32 favicon' });
  await expect(preview).toBeVisible();
  const previewUrl = await preview.getAttribute('src');
  const previewBytes = Buffer.from(
    await page.evaluate(
      async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
      previewUrl,
    ),
  );
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download package' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('favicon-package.zip');
  const path = await download.path();
  expect(path).not.toBeNull();
  const archive = await readFile(path!);
  const unpacked = unzipSync(archive);
  expect(Buffer.from(unpacked['favicon-32x32.png']!)).toEqual(previewBytes);
  for (const name of [
    'android-chrome-192x192.png',
    'android-chrome-512x512.png',
    'apple-touch-icon.png',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'favicon.html',
    'favicon.ico',
    'site.webmanifest',
  ])
    expect(Object.keys(unpacked)).toContain(name);
  expect(JSON.parse(new TextDecoder().decode(unpacked['site.webmanifest']))).toMatchObject({
    name: 'Example Site',
  });
  await expect(page.getByLabel('HTML link snippet')).toHaveValue(/apple-touch-icon/u);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Create package' }).click();
  await expect(page.getByRole('status')).toContainText('Created favicon.ico');
  await context.setOffline(false);
  expect(crossOrigin).toEqual([]);
});

test('creates and downloads a favicon package with the keyboard', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/favicon-generator');
  await waitForHydration(page);
  const fileInput = page.locator('input[type=file]');
  await fileInput.focus();
  await expect(fileInput).toBeFocused();
  await fileInput.setInputFiles({
    name: 'keyboard.png',
    mimeType: 'image/png',
    buffer: await faviconPng(page),
  });
  const create = page.getByRole('button', { name: 'Create package' });
  await create.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Created favicon.ico');
  const pending = page.waitForEvent('download');
  const download = page.getByRole('button', { name: 'Download package' });
  await download.focus();
  await page.keyboard.press('Enter');
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  expect(Object.keys(unzipSync(await readFile(path!)))).toContain('favicon.ico');
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`favicon package survives ${locale} localization`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(`/${locale}/favicon-generator`);
    await page.waitForLoadState('networkidle');
    const main = page.locator('main');
    await expect(main).toHaveAttribute('lang', locale);
    await expect(main).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/favicon-generator`,
    );
    const siteName = locale === 'ar' ? 'اسم الموقع' : /Sïtë nàmë/u;
    await page.getByLabel(siteName).fill('Localized Site');
    await page.locator('input[type=file]').setInputFiles({
      name: 'localized.png',
      mimeType: 'image/png',
      buffer: await faviconPng(page),
    });
    await page
      .getByRole('button', {
        name: locale === 'ar' ? 'إنشاء الحزمة' : /Crëàtë pàckàgë/u,
      })
      .click();
    const preview = page.getByRole('img', {
      name: locale === 'ar' ? 'أيقونة مفضلة منشأة بمقاس 32 في 32' : /Gënëràtëd 32 by 32 fàvïcôn/u,
    });
    const previewUrl = await preview.getAttribute('src');
    const previewBytes = Buffer.from(
      await page.evaluate(
        async (url) => [...new Uint8Array(await (await fetch(url!)).arrayBuffer())],
        previewUrl,
      ),
    );
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: locale === 'ar' ? 'تنزيل الحزمة' : /Dôwnlôàd pàckàgë/u,
      })
      .click();
    const path = await (await pending).path();
    expect(path).not.toBeNull();
    const archive = unzipSync(await readFile(path!));
    expect(Buffer.from(archive['favicon-32x32.png']!)).toEqual(previewBytes);
    expect(JSON.parse(new TextDecoder().decode(archive['site.webmanifest']))).toMatchObject({
      name: 'Localized Site',
    });
  });
}
