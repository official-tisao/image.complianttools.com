import { expect, test } from '@playwright/test';
import { probeRuntimeCapabilities } from '../packages/engine/src/capabilities.js';

test('runtime probes render without browser-name or user-agent branches', async ({ page }) => {
  const response = await page.goto('/debug/capabilities');
  expect(response?.headers()).toMatchObject({
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'same-origin',
  });
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Runtime capabilities' })).toBeVisible();
  // One row per probed capability, derived from the probe rather than pinned as a literal. P6-02
  // split the File System Access row into its file, directory, and save-picker parts, and a
  // hardcoded count turns every honest new probe into a red build instead of a missing label.
  await expect(page.locator('#capabilities dt')).toHaveCount(
    Object.keys(probeRuntimeCapabilities()).length,
  );
  // Every row still needs a readable label and a verdict: an unnamed probe is a silent gap.
  await expect(page.locator('#capabilities dd')).toHaveText(
    Array.from(
      { length: Object.keys(probeRuntimeCapabilities()).length },
      () => /^(Available|Unavailable)$/u,
    ),
  );
  await expect(page.locator('dt', { hasText: 'WebAssembly threads' }).locator('+ dd')).toHaveText(
    'Available',
  );
});
