import { expect, test } from '@playwright/test';

/**
 * These are the legacy, non-localized entry points that are served directly by the static host.
 * Keep the list explicit: a missing clean URL or a prerender regression otherwise looks like a
 * generic deployment failure instead of naming the affected route.
 */
const routes = [
  '/enlarge',
  '/exif-viewer',
  '/expand-image',
  '/favicon-generator',
  '/filters',
  '/find-duplicates',
  '/flip',
  '/generate',
  '/gif-converter',
  '/gif-maker',
  '/heic-converter',
  '/html-to-image',
  '/image-to-base64',
  '/image-to-svg',
  '/meme-generator',
  '/optimize-for-web',
  '/pdf-to-image',
  '/replace-background',
  '/round-corners',
  '/svg-to-png',
  '/upscale',
  '/video-to-gif',
] as const;

for (const route of routes) {
  test(`${route} serves a healthy entry document`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} response`).toBe(200);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    expect(pageErrors, `${route} browser errors`).toEqual([]);
  });
}
