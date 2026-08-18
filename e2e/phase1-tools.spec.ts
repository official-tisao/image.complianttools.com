import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const fixture = {
  name: 'self-generated.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
};

function bmp12Megapixels() {
  const width = 4000;
  const height = 3000;
  const rowBytes = width * 3;
  const pixels = rowBytes * height;
  const buffer = Buffer.alloc(54 + pixels);
  buffer.write('BM');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixels, 34);
  return { name: 'twelve-megapixel.bmp', mimeType: 'image/bmp', buffer };
}

for (const [route, heading] of [
  ['/convert', 'Image Converter'],
  ['/compress', 'Image Compressor'],
  ['/resize', 'Image Resizer'],
] as const) {
  test(`${route} passes the single-tool completion path`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText('Processed on your device. Nothing is uploaded.')).toBeVisible();
    await page.setInputFiles('[data-testid=file-input]', fixture);
    await expect(page.getByTestId('compare-canvas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled();
  });
}

test('quality changes produce zero cumulative layout shift', async ({ page }) => {
  await page.goto('/compress');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { layoutShiftScore: number }).layoutShiftScore = 0;
    (globalThis as typeof globalThis & { layoutShiftSources: string[] }).layoutShiftSources = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
          sources?: Array<{ node?: Node }>;
        }
      >) {
        if (!entry.hadRecentInput) {
          (globalThis as typeof globalThis & { layoutShiftScore: number }).layoutShiftScore +=
            entry.value;
          (
            globalThis as typeof globalThis & { layoutShiftSources: string[] }
          ).layoutShiftSources.push(
            ...(entry.sources ?? []).map(({ node }) =>
              node instanceof Element ? `${node.tagName}.${node.className}` : String(node),
            ),
          );
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.setInputFiles('[data-testid=file-input]', fixture);
  await expect(page.getByTestId('compare-canvas')).toBeVisible();
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { layoutShiftScore: number }).layoutShiftScore = 0;
  });
  await page.getByTestId('option-export-quality').locator('input[type=range]').fill('55');
  await page.waitForTimeout(300);
  const layoutResult = await page.evaluate(() => ({
    score: (globalThis as typeof globalThis & { layoutShiftScore: number }).layoutShiftScore,
    sources: (globalThis as typeof globalThis & { layoutShiftSources: string[] })
      .layoutShiftSources,
  }));
  expect(layoutResult.score, layoutResult.sources.join(', ')).toBe(0);
  const latency = await page.locator('.action-bar span').first().textContent();
  expect(Number(latency?.match(/\d+/u)?.[0])).toBeLessThanOrEqual(250);
});

test('tool pages remain useful with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const route of ['/convert', '/compress', '/resize']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('input[type=file]')).toBeVisible();
    await expect(page.getByText('Questions')).toBeVisible();
  }
  await context.close();
});

test('reference archetype ships no JavaScript', async ({ request }) => {
  const response = await request.get('/docs/formats/jpeg');
  expect(response.ok()).toBe(true);
  expect(await response.text()).not.toMatch(/<script\b/u);
});

test('target-size mode reports every bounded search attempt', async ({ page }) => {
  await page.goto('/resize');
  await page.waitForLoadState('networkidle');
  await page.setInputFiles('[data-testid=file-input]', fixture);
  await expect(page.getByTestId('compare-canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Resize mode').selectOption('targetBytes');
  await page.evaluate(() => {
    const updates: string[] = [];
    const target = document.querySelector('[data-testid=target-progress]')!;
    new MutationObserver(() => updates.push(target.textContent ?? '')).observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    (globalThis as typeof globalThis & { targetUpdates: string[] }).targetUpdates = updates;
  });
  await page.getByLabel('Target size', { exact: true }).fill('1');
  await expect(page.getByTestId('target-progress')).toContainText(/Target found|Closest result/);
  expect(
    await page.evaluate(() =>
      (globalThis as typeof globalThis & { targetUpdates: string[] }).targetUpdates.some((value) =>
        /Trying quality \d+ →/.test(value),
      ),
    ),
  ).toBe(true);
});

test('comparison canvas exposes keyboard pan and a high-zoom pixel grid', async ({ page }) => {
  await page.goto('/compress');
  await page.waitForLoadState('networkidle');
  await page.setInputFiles('[data-testid=file-input]', fixture);
  await expect(page.getByTestId('compare-canvas')).toBeVisible({ timeout: 15_000 });
  const image = page.locator('.compare-stage img').first();
  const before = await image.evaluate((node) => getComputedStyle(node).transform);
  await page.getByRole('button', { name: 'Pan image right' }).click();
  await expect
    .poll(() => image.evaluate((node) => getComputedStyle(node).transform))
    .not.toBe(before);
  for (let index = 0; index < 4; index += 1)
    await page.getByRole('button', { name: 'Zoom +' }).click();
  await expect(page.locator('.compare-stage')).toHaveClass(/pixelated/);
  expect(
    await page
      .locator('.compare-stage')
      .evaluate((node) => getComputedStyle(node, '::after').backgroundImage),
  ).not.toBe('none');
});

test('the complete tool flow is keyboard operable', async ({ page }) => {
  await page.goto('/compress');
  await page.waitForLoadState('networkidle');
  await page.setInputFiles('[data-testid=file-input]', fixture);
  await expect(page.getByTestId('compare-canvas')).toBeVisible();
  const quality = page.getByTestId('option-export-quality').locator('input[type=range]');
  await quality.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(quality).toHaveValue('71');
  const download = page.getByRole('button', { name: 'Download' });
  await expect(page.locator('.action-bar span').first()).toContainText(/Updated in \d+ ms/);
  await expect(download).toBeEnabled();
  const panButton = page.getByRole('button', { name: 'Pan image right' });
  await panButton.focus();
  await page.keyboard.press('Enter');
  await expect(panButton).toBeFocused();
  await download.focus();
  const pendingDownload = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  await pendingDownload;
});

test('12 MP predicted-size updates stay within 250 ms', async ({ page, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'The deterministic performance gate runs once in Chromium.',
  );
  test.setTimeout(60_000);
  await page.goto('/compress');
  await page.waitForLoadState('networkidle');
  await page.setInputFiles('[data-testid=file-input]', bmp12Megapixels());
  await expect(page.getByTestId('compare-canvas')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('option-export-quality').locator('input[type=range]').fill('55');
  await expect(page.locator('.action-bar span').first()).toContainText(/Updated in \d+ ms/);
  const latency = Number(
    (await page.locator('.action-bar span').first().textContent())?.match(/\d+/u)?.[0],
  );
  expect(latency).toBeLessThanOrEqual(250);
});

for (const route of ['/convert', '/compress', '/resize']) {
  test(`${route} has zero Axe violations and complete Phase 1 SEO`, async ({ page }) => {
    await page.goto(route);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel=canonical]')).toHaveCount(1);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    await expect(page.locator('.faq a')).toHaveCount(6);
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    expect(
      (await page.locator('meta[name=description]').getAttribute('content'))?.length,
    ).toBeLessThanOrEqual(155);
  });
}

test('all three tools survive pseudo-localization and Arabic at narrow width and 400% zoom', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const route of [
    '/en-XA/convert',
    '/en-XA/compress',
    '/en-XA/resize',
    '/ar/convert',
    '/ar/compress',
    '/ar/resize',
  ]) {
    await page.goto(route);
    await page.evaluate(() => {
      document.documentElement.style.zoom = '4';
    });
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('input[type=file]')).toBeVisible();
    if (route.startsWith('/ar')) await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
    else await expect(page.locator('h1')).toContainText('［');
  }
  expect((await request.get('/sitemap.xml')).ok()).toBe(true);
  expect((await request.get('/og/tools.svg')).ok()).toBe(true);
});
