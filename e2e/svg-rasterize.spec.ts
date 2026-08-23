import { expect, test } from '@playwright/test';

const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><rect width="4" height="2" fill="#ef1808"/></svg>',
);

test('SVG rasterizer preserves intrinsic size by default and supports explicit sizing', async ({
  page,
}) => {
  await page.goto('/svg-to-png');
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Output sizing')).toHaveValue('original');
  await expect(page.getByLabel('Dimension or scale value')).toHaveValue('1');

  let pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'intrinsic.svg',
    mimeType: 'image/svg+xml',
    buffer: svg,
  });
  expect((await pending).suggestedFilename()).toBe('intrinsic.png');
  await expect(page.getByRole('status')).toHaveText('Rasterized intrinsic.svg to 4×2 PNG locally.');

  await page.getByLabel('Output sizing').selectOption('width');
  await page.getByLabel('Dimension or scale value').fill('8');
  pending = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles({
    name: 'explicit-width.svg',
    mimeType: 'image/svg+xml',
    buffer: svg,
  });
  expect((await pending).suggestedFilename()).toBe('explicit-width.png');
  await expect(page.getByRole('status')).toHaveText(
    'Rasterized explicit-width.svg to 8×4 PNG locally.',
  );
});
