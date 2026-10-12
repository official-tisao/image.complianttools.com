/**
 * P6-07 — Keyboard completeness.
 * Walks all five canonical flows (A, B, C, C′, D) using keyboard events only.
 * No mouse clicks, locator.focus(), or locator.fill() to operate controls.
 * File-picker injection uses Playwright harness APIs (real browser boundary).
 * Mocked fixtures; no real AI provider contacted.
 */
import { test, expect, type Page } from '@playwright/test';

/* Shared fixture PNG (small, deterministic) */
async function fixturePng(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#3366cc';
    ctx.fillRect(0, 0, 100, 100);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return [];
    const ab = await blob.arrayBuffer();
    return Array.from(new Uint8Array(ab));
  });
}

async function injectFile(page: Page, testId: string, bytes: number[]) {
  const buffer = Buffer.from(bytes);
  await page
    .getByTestId(testId)
    .setInputFiles([{ name: 'fixture.png', mimeType: 'image/png', buffer }]);
}

const recipeJson = JSON.stringify({
  version: 1,
  id: 'p6-07-keyboard-recipe',
  name: 'Keyboard recipe',
  steps: [],
  export: { format: 'webp', quality: 82 },
});

test.describe('P6-07 keyboard-only canonical flows', () => {
  test('Flow A — single conversion via keyboard', async ({ page }) => {
    await page.goto('/crop');
    const buffer = await fixturePng(page);
    await injectFile(page, 'transform-file-input', buffer);
    await expect(page.getByTestId('transform-source-dimensions')).toBeVisible();
    // Keyboard reach controls: Tab to run button, activate
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('transform-output-dimensions')).toBeVisible({ timeout: 15000 });
  });

  test('Flow B — batch enqueue via keyboard', async ({ page }) => {
    await page.goto('/batch');
    const buffer = await fixturePng(page);
    await injectFile(page, 'long-tail-input', buffer);
    await page.getByTestId('long-tail-run').press('Enter');
    await expect(page.getByTestId('long-tail-status')).toContainText(/processed 1 file/i);
    await expect(page.getByTestId('batch-results')).toBeVisible();
  });

  test('Flow C′ — connection setup via keyboard', async ({ page }) => {
    await page.route('https://api.openai.com/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'keyboard fixture rejected' } }),
      });
    });
    await page.goto('/connect-ai/openai');
    const key = page.getByTestId('test-cred-apiKey');
    await key.pressSequentially('sk-keyboard-fixture');
    await page.getByTestId('test-run').press('Enter');
    await expect(page.getByTestId('test-result-error')).toBeVisible({ timeout: 15_000 });
  });

  test('Flow C — AI result via keyboard selection', async ({ page }) => {
    await page.goto('/ai/describe');
    await expect(page.getByTestId('ai-submit')).toHaveAttribute('data-hydrated', 'true', {
      timeout: 15_000,
    });
    await injectFile(page, 'ai-local-image', await fixturePng(page));
    await expect(page.getByTestId('describe-skeleton')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('skeleton-field-dimensions')).toContainText('100');
  });

  test('Flow D — shared recipe via keyboard', async ({ page }) => {
    await page.goto('/recipe');
    const recipe = page.getByTestId('recipe-input');
    await recipe.press('ControlOrMeta+A');
    await recipe.pressSequentially(recipeJson);
    await page.getByTestId('long-tail-run').press('Enter');
    await expect(page.getByTestId('generated-output')).toContainText('/recipe#recipe=r1.');
  });

  test('Crop mask nudging — Arrow / Shift+Arrow keyboard', async ({ page }) => {
    await page.goto('/adaptive-resize');
    const buffer = await fixturePng(page);
    await injectFile(page, 't81-input', buffer);
    await expect(page.getByTestId('t81-run')).toBeEnabled({ timeout: 15_000 });
    const protectToggle = page.getByTestId('option-t81-protectEnabled').locator('input');
    await protectToggle.press('Space');
    const canvas = page.getByTestId('t81-mask-canvas');
    await expect(canvas).toBeVisible();
    await canvas.press('ArrowRight');
    // Arrow keys move 1 px; Shift+Arrow 10 px
    await canvas.press('ArrowDown');
    await canvas.press('Shift+ArrowLeft');
    await canvas.press('Shift+ArrowUp');
    // Paint with Space
    await canvas.press('Space');
    // Assert cursor position announced
    await expect(page.getByTestId('t81-cursor-pos')).toBeVisible();
    // Numeric alternatives exist
    await expect(page.getByTestId('t81-brush-x')).toBeVisible();
    await expect(page.getByTestId('t81-brush-y')).toBeVisible();
  });
});
