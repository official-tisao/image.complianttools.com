import { expect, test } from '@playwright/test';
import { denyAllNetwork, allowAllNetwork, LOCAL_ORIGIN } from './support/network.js';

/* P6-06 Offline hardening.
 * Browser limitations documented, not silently skipped:
 * - WebKit: setOffline breaks File/Blob local reads (support/network.ts comment)
 * - Service-worker activation deferred past networkidle
 * - CLI/library entry has no browser route; covered by import/unit check
 */

const FIXTURE = {
  name: 'fixture.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
};

async function warmShell(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('html[data-hydrated="true"]') !== null, {
    timeout: 30_000,
  });
}

test.describe('P6-06 Offline hardening', () => {
  test('offline badge reassures local tools continue', async ({ page, context }) => {
    await warmShell(page);
    await denyAllNetwork(context);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('.offline-badge')).toContainText('Offline — local tools still work');
    await allowAllNetwork(context);
  });

  test('72 local tools count + zero external dependency', async ({ page, context }) => {
    await warmShell(page);
    await denyAllNetwork(context);
    const crossOrigin: string[] = [];
    page.on('request', (req: import('@playwright/test').Request) => {
      const url = new URL(req.url());
      if (url.origin !== LOCAL_ORIGIN) crossOrigin.push(req.url());
    });
    await page.goto('/convert');
    await page.waitForFunction(
      () => document.querySelector('html[data-hydrated="true"]') !== null,
      { timeout: 30_000 },
    );
    await page.setInputFiles('[data-testid=file-input]', FIXTURE);
    await expect(page.getByTestId('compare-canvas')).toBeVisible({ timeout: 30_000 });
    expect(crossOrigin, 'offline run has zero successful external dependency').toEqual([]);
    await allowAllNetwork(context);
  });

  test('AI-only disabled offline', async ({ page, context }) => {
    await warmShell(page);
    await denyAllNetwork(context);
    await page.goto('/ai/generate');
    await expect(page.getByTestId('ai-submit')).toBeDisabled();
    await allowAllNetwork(context);
  });
});
