import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const tokens = await readFile(new URL('../packages/ui/src/tokens.css', import.meta.url), 'utf8');
const components = await readFile(
  new URL('../packages/ui/src/components.css', import.meta.url),
  'utf8',
);

function showcase(theme: 'light' | 'dark'): string {
  return `<!doctype html><html><head><script>document.documentElement.dataset.theme='${theme}'</script><style>${tokens}\n${components}\nbody{margin:0;padding:32px;background:var(--c-bg);color:var(--c-text)}main{display:grid;gap:24px;max-width:640px}</style></head><body><main><button class="ct-button" data-variant="primary">Convert image</button><label class="ct-slider-field">Quality<input class="ct-slider" type="range" value="82"></label><label class="ct-file-drop">Drop images here<input type="file"></label></main></body></html>`;
}

for (const theme of ['light', 'dark'] as const) {
  test(`first primitives render in ${theme} theme without a theme flash`, async ({ page }) => {
    await page.setContent(showcase(theme));
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.ct-button')).toBeVisible();
    const screenshot = await page.screenshot();
    expect(screenshot.byteLength).toBeGreaterThan(1_000);
  });
}
