import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';
import { allowAllNetwork, denyAllNetwork } from './support/network.js';

const waitForHydration = (page: Page) => page.locator('html[data-hydrated="true"]').waitFor();

test('encodes bytes with HTML and CSS snippets on the canonical local page', async ({
  page,
  context,
}) => {
  const crossOrigin: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') crossOrigin.push(request.url());
  });
  await page.goto('/base64-image');
  await waitForHydration(page);
  await page.getByLabel('Choose an image').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0, 1, 2]),
  });
  await expect(page.getByLabel('Base64 data URL')).toHaveValue('data:image/png;base64,AAEC');
  await expect(page.getByLabel('HTML snippet')).toHaveValue(
    '<img src="data:image/png;base64,AAEC" alt="">',
  );
  await expect(page.getByLabel('CSS snippet')).toHaveValue(
    'background-image: url("data:image/png;base64,AAEC");',
  );
  await denyAllNetwork(context);
  await page.getByLabel('Choose an image').setInputFiles({
    name: 'offline.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([3, 4, 5]),
  });
  await expect(page.getByLabel('Base64 data URL')).toHaveValue(
    'data:application/octet-stream;base64,AwQF',
  );
  await allowAllNetwork(context);
  expect(crossOrigin).toEqual([]);
});

test('decodes a bounded data URL back to exact local bytes', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/base64-image');
  await waitForHydration(page);
  await page.getByLabel('Direction').selectOption('decode');
  await page.getByLabel('Base64 data URL').fill('data:image/png;base64,AAEC/f7/');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Decode and download' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('decoded.png');
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!)).toEqual(Buffer.from([0, 1, 2, 253, 254, 255]));
  await expect(page.getByRole('status')).toContainText('Decoded 6 bytes locally');
});

test('Base64 decoding is keyboard-operable end to end', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/base64-image');
  await waitForHydration(page);
  const direction = page.getByLabel('Direction');
  await direction.focus();
  await page.keyboard.press('End');
  await expect(direction).toHaveValue('decode');
  await page.keyboard.press('Tab');
  const input = page.getByLabel('Base64 data URL');
  await input.focus();
  await page.keyboard.type('data:image/png;base64,AAEC');
  const pending = page.waitForEvent('download');
  const decode = page.getByRole('button', { name: 'Decode and download' });
  await decode.focus();
  await page.keyboard.press('Enter');
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  expect(await readFile(path!)).toEqual(Buffer.from([0, 1, 2]));
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`Base64 encode and decode survive ${locale} localization`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(`/${locale}/base64-image`);
    await page.waitForLoadState('networkidle');
    const main = page.locator('main');
    await expect(main).toHaveAttribute('lang', locale);
    await expect(main).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/base64-image`,
    );
    await page.locator('input[type=file]').setInputFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0, 1, 2]),
    });
    const dataUrlName = locale === 'ar' ? 'عنوان بيانات Base64' : /Bàsë64 dàtà ÜRL/u;
    await expect(page.getByLabel(dataUrlName)).toHaveValue('data:image/png;base64,AAEC');
    const direction = page.getByTestId('option-base64-mode').locator('select');
    await expect(direction.locator('option[value=decode]')).toHaveText(
      locale === 'ar' ? 'Base64 إلى ملف' : /Bàsë64 tô fïlë/u,
    );
    await direction.selectOption('decode');
    await page.getByLabel(dataUrlName).fill('data:image/png;base64,AAEC/f7/');
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: locale === 'ar' ? 'فك الترميز والتنزيل' : /Dëcôdë ànd dôwnlôàd/u,
      })
      .click();
    const path = await (await pending).path();
    expect(path).not.toBeNull();
    expect(await readFile(path!)).toEqual(Buffer.from([0, 1, 2, 253, 254, 255]));
    // CLDR's default numbering system for Arabic is arab, so `6` renders as the Arabic-Indic `٦`.
    // Engines disagree on whether they honour that default -- WebKit does, Chromium and Firefox emit
    // Latin digits -- and both are legitimate for an Arabic reader. Accept either digit rather than
    // pinning the app to one numbering system to satisfy a test.
    await expect(page.getByRole('status')).toContainText(
      locale === 'ar' ? /فُك ترميز [6٦] بايت محليًا/u : /Dëcôdëd 6 bytës lôcàlly/u,
    );
  });
}
