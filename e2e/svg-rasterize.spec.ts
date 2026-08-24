import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><rect width="4" height="2" fill="#ef1808"/></svg>',
);

function inspectPng(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function rasterize(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  const pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'image/svg+xml',
    buffer: svg,
  });
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  return { download, inspection: inspectPng(await readFile(path!)) };
}

test('SVG rasterizer downloads exact intrinsic and explicitly sized PNG output', async ({
  page,
  context,
}) => {
  await page.goto('/svg-to-png');
  await expect(page.getByLabel('Output sizing')).toHaveValue('original');
  await expect(page.getByLabel('Dimension or scale value')).toHaveValue('1');

  const intrinsic = await rasterize(page, 'intrinsic.svg');
  expect(intrinsic.download.suggestedFilename()).toBe('intrinsic.png');
  expect(intrinsic.inspection).toEqual({ width: 4, height: 2 });
  await expect(page.getByRole('status')).toHaveText(
    'Rasterized intrinsic.svg to PNG locally at 4×2.',
  );

  await page.getByLabel('Output sizing').selectOption('width');
  await page.getByLabel('Dimension or scale value').fill('8');
  const explicit = await rasterize(page, 'explicit-width.svg');
  expect(explicit.download.suggestedFilename()).toBe('explicit-width.png');
  expect(explicit.inspection).toEqual({ width: 8, height: 4 });
  await context.setOffline(true);
  const offline = await rasterize(page, 'offline.svg');
  expect(offline.inspection).toEqual({ width: 8, height: 4 });
  await context.setOffline(false);
});

test('SVG rasterizer reports a typed remedy for unsafe external references', async ({ page }) => {
  await page.goto('/svg-to-png');
  await page.locator('html[data-hydrated="true"]').waitFor();
  await page.locator('input[type=file]').setInputFiles({
    name: 'external.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><image href="https://example.com/image.png"/></svg>',
    ),
  });
  await expect(page.getByRole('alert')).toContainText('Remedy:');
  await expect(page.getByRole('alert')).toContainText('self-contained SVG');
});

test('SVG rasterizer sizing controls and file picker are keyboard reachable', async ({ page }) => {
  await page.goto('/svg-to-png');
  await page.getByLabel('Output sizing').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Output sizing')).toHaveValue('width');
  await expect(page.getByLabel('Dimension or scale value')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('input[type=file]')).toBeFocused();
});

for (const locale of ['en-XA', 'ar'] as const) {
  test(`${locale} SVG rasterizer preserves exact output and locale layout`, async ({ page }) => {
    await page.goto(`/${locale}/svg-to-png`);
    const result = await rasterize(page, `${locale}.svg`);
    expect(result.inspection).toEqual({ width: 4, height: 2 });
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com/${locale}/svg-to-png`,
    );
    await expect(page.getByRole('status')).toContainText('4×2');
  });
}
