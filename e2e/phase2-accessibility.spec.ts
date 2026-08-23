import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const phase2Routes = [
  '/heic-converter',
  '/raw-converter',
  '/avif-converter',
  '/webp-converter',
  '/convert/png-to-webp',
  '/jxl-converter',
  '/svg-to-png',
  '/image-to-svg',
  '/pdf-to-image',
  '/image-to-pdf',
  '/favicon-generator',
  '/gif-converter',
  '/embedded-converter',
  '/image-to-base64',
  '/base64-image',
  '/cbz-converter',
  '/exif-viewer',
  '/remove-exif',
  '/image-info',
  '/en-XA/exif-viewer',
  '/en-XA/remove-exif',
  '/en-XA/image-info',
  '/ar/exif-viewer',
  '/ar/remove-exif',
  '/ar/image-info',
  '/en-XA/base64-image',
  '/ar/base64-image',
  '/en-XA/favicon-generator',
  '/ar/favicon-generator',
  '/lossless-optimize',
] as const;

for (const route of phase2Routes) {
  test(`${route} has zero Axe violations and essential document metadata`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel=canonical]')).toHaveCount(1);
    await expect(page.locator('meta[name=description]')).toHaveCount(1);
    expect((await page.title()).length).toBeGreaterThan(0);
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    const description = await page.locator('meta[name=description]').getAttribute('content');
    expect(description?.length).toBeGreaterThan(0);
    expect(description?.length).toBeLessThanOrEqual(155);
  });
}
