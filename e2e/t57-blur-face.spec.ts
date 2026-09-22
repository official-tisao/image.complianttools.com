import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

interface T57Fixture {
  readonly id: string;
  readonly path: string;
  readonly dimensions: { readonly width: number; readonly height: number };
  readonly groundTruthFaceBoxes: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
}

const t57FixtureManifest = JSON.parse(
  await readFile('packages/engine/bench/escalation/t57/fixtures/manifest.json', 'utf8'),
) as { readonly license: string; readonly fixtures: readonly T57Fixture[] };

async function generatedPng(page: import('@playwright/test').Page, width = 64, height = 64) {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const shade = Math.floor(x / 4) % 2 === 0 ? 16 : 240;
          image.data[offset] = shade;
          image.data[offset + 1] = shade;
          image.data[offset + 2] = shade;
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated T57 PNG fixture.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      }
      return btoa(binary);
    },
    { width, height },
  );
  return Buffer.from(base64, 'base64');
}

async function generatedSolidPng(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
) {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.fillStyle = '#7799bb';
      context.fillRect(0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated T57 latency fixture.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      }
      return btoa(binary);
    },
    { width, height },
  );
  return Buffer.from(base64, 'base64');
}

async function waitForHydration(page: import('@playwright/test').Page) {
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  await page.waitForLoadState('networkidle');
}

function animatedPng(png: Buffer) {
  const animationControl = Buffer.alloc(20);
  animationControl.writeUInt32BE(8, 0);
  animationControl.write('acTL', 4, 'ascii');
  animationControl.writeUInt32BE(1, 8);
  return Buffer.concat([png.subarray(0, 33), animationControl, png.subarray(33)]);
}

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`${locale}/blur-face is prerendered with localized SEO metadata`, async ({
    page,
    request,
  }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/blur-face`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('t57-manual-warning')).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await expect(page.locator('.t57-faq details')).toHaveCount(3);
    await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
      'href',
      `https://image.complianttools.com${prefix}/blur-face`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    await expect(page.locator('main')).toHaveAttribute('lang', locale);
    await expect(page.locator('main')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    expect((await page.title()).length).toBeLessThanOrEqual(60);
    expect(
      (await page.locator('meta[name="description"]').getAttribute('content'))?.length,
    ).toBeLessThanOrEqual(155);
    const graph = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    ) as { featureList: string[]; '@type': string };
    expect(graph['@type']).toBe('WebApplication');
    expect(graph.featureList).toHaveLength(3);
    if (locale === 'en-XA') await expect(page.locator('h1')).toContainText('［');
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain('/blur-face</loc>');
  });
}

test('T57 static Arabic page explains manual review without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/ar/blur-face');
  await expect(page.locator('h1')).toHaveText(/تمويه الوجوه/u);
  await expect(page.getByTestId('t57-manual-warning')).toContainText(/قد لا يقترح النموذج/u);
  await expect(page.getByText(/اختر صورة PNG ثابتة/u)).toBeVisible();
  await context.close();
});

test('T57 CC0 generated face corpus preserves exact annotated boxes in manual regions', async ({
  page,
}) => {
  expect(t57FixtureManifest.license).toBe('CC0-1.0');
  expect(t57FixtureManifest.fixtures).toHaveLength(3);
  await page.goto('/blur-face');
  await waitForHydration(page);

  for (const fixture of t57FixtureManifest.fixtures) {
    const source = await readFile(join('packages/engine/bench/escalation/t57', fixture.path));
    await page.getByTestId('t57-input').setInputFiles({
      name: `${fixture.id}.png`,
      mimeType: 'image/png',
      buffer: source,
    });
    await expect(page.getByTestId('t57-file-info')).toContainText(
      `${fixture.dimensions.width} × ${fixture.dimensions.height} pixels`,
    );
    for (let index = 0; index < fixture.groundTruthFaceBoxes.length; index += 1) {
      const box = fixture.groundTruthFaceBoxes[index]!;
      for (const [testId, value] of [
        ['t57-region-x', box.x],
        ['t57-region-y', box.y],
        ['t57-region-width', box.width],
        ['t57-region-height', box.height],
      ] as const) {
        await page.getByTestId(testId).fill(String(value));
      }
      const addCoordinates = page.getByTestId('t57-add-coordinates');
      await addCoordinates.scrollIntoViewIfNeeded();
      await addCoordinates.click();
      const row = page.locator('.region-list li').nth(index);
      await expect(row).toContainText(`${box.x}, ${box.y}, ${box.width} × ${box.height}`);
    }
    await expect(page.locator('.region-list li')).toHaveCount(fixture.groundTruthFaceBoxes.length);
    await page.getByRole('button', { name: /Clear all areas/u }).click();
    await page.getByRole('button', { name: /Remove image/u }).click();
  }
});

test('T57 fetches the registered YuNet model only after the user asks and rejects bad bytes', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit does not expose the intercepted cross-origin model failure to the page.',
  );
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('face_detection_yunet_2023mar.onnx')) requests.push(request.url());
  });
  await page.route(
    'https://media.githubusercontent.com/**/face_detection_yunet_2023mar.onnx',
    (route) =>
      route.fulfill({
        status: 200,
        body: Buffer.alloc(232_589, 0),
        headers: { 'access-control-allow-origin': '*' },
      }),
  );
  await page.goto('/blur-face');
  await waitForHydration(page);
  await page.getByTestId('t57-input').setInputFiles({
    name: 'single-centered.png',
    mimeType: 'image/png',
    buffer: await readFile('packages/engine/bench/escalation/t57/fixtures/single-centered.png'),
  });
  expect(requests).toEqual([]);
  await page.getByTestId('t57-suggest-faces').click();
  await expect(page.getByTestId('t57-notice')).toContainText(
    'Could not load or verify the face model',
  );
  expect(requests).toHaveLength(1);
  await expect(page.getByTestId('t57-suggest-faces')).toBeVisible();

  // A failed model fetch leaves the local manual path available.
  await page.getByTestId('t57-region-x').fill('50');
  await page.getByTestId('t57-region-y').fill('28');
  await page.getByTestId('t57-region-width').fill('60');
  await page.getByTestId('t57-region-height').fill('76');
  await page.getByTestId('t57-add-coordinates').click();
  await expect(page.locator('.region-list li')).toContainText('50, 28, 60 × 76');
});

test('T57 keeps manual blur and PNG export usable offline after a local image is ready', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  let appOrigin = '';
  page.on('request', (request) => {
    if (appOrigin && new URL(request.url()).origin !== appOrigin) {
      externalRequests.push(request.url());
    }
  });
  await page.goto('/blur-face');
  await waitForHydration(page);
  appOrigin = new URL(page.url()).origin;
  await page.getByTestId('t57-input').setInputFiles({
    name: 'offline-manual.png',
    mimeType: 'image/png',
    buffer: await readFile('packages/engine/bench/escalation/t57/fixtures/single-centered.png'),
  });
  await expect(page.getByTestId('t57-file-info')).toBeVisible();
  await page.context().setOffline(true);
  await page.getByTestId('t57-region-x').fill('50');
  await page.getByTestId('t57-region-y').fill('28');
  await page.getByTestId('t57-region-width').fill('60');
  await page.getByTestId('t57-region-height').fill('76');
  await page.getByTestId('t57-add-coordinates').click();
  await expect(page.getByTestId('t57-status')).toContainText('1 area will be blurred');
  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId('t57-download').click();
  expect((await downloadEvent).suggestedFilename()).toBe('offline-manual-blurred.png');
  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T57 keeps the manual fixture workflow usable after a fresh-page offline reload', async ({
  page,
  context,
}) => {
  await page.goto('/blur-face');
  await waitForHydration(page);
  const fixture = await readFile(
    'packages/engine/bench/escalation/t57/fixtures/single-centered.png',
  );
  await page.getByTestId('t57-input').setInputFiles({
    name: 'fresh-page-warmup.png',
    mimeType: 'image/png',
    buffer: fixture,
  });
  await expect(page.getByTestId('t57-file-info')).toBeVisible();

  await page.reload();
  await waitForHydration(page);
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        });
      });
    }
  });

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.getByTestId('t57-input').setInputFiles({
      name: 'fresh-page-offline.png',
      mimeType: 'image/png',
      buffer: fixture,
    });
    await expect(page.getByTestId('t57-file-info')).toBeVisible();
    await page.getByTestId('t57-region-x').fill('50');
    await page.getByTestId('t57-region-y').fill('28');
    await page.getByTestId('t57-region-width').fill('60');
    await page.getByTestId('t57-region-height').fill('76');
    await page.getByTestId('t57-add-coordinates').click();
    await expect(page.getByTestId('t57-status')).toContainText('1 area will be blurred');
    await expect(page.getByTestId('t57-download')).toBeEnabled();
  } finally {
    if (!page.isClosed()) await context.setOffline(false);
  }
});

test('T57 is a no-op until a region is marked, then keyboard edits, preview and PNG export work without off-origin requests', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  let appOrigin = '';
  page.on('request', (request) => {
    if (!appOrigin) return;
    if (new URL(request.url()).origin !== appOrigin) externalRequests.push(request.url());
  });
  await page.goto('/blur-face');
  await waitForHydration(page);
  appOrigin = new URL(page.url()).origin;
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== appOrigin) return route.abort();
    return route.continue();
  });
  const source = await generatedPng(page);
  await page.getByTestId('t57-input').setInputFiles({
    name: 'manual-review.png',
    mimeType: 'image/png',
    buffer: source,
  });
  await expect(page.getByTestId('t57-file-info')).toContainText('64 × 64 pixels');
  await expect(page.getByTestId('t57-preview')).toBeVisible();
  const sourcePixels = await page.getByTestId('t57-preview').evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d');
    if (!context) throw new Error('Canvas context is unavailable.');
    return {
      center: [...context.getImageData(32, 32, 1, 1).data],
      outside: [...context.getImageData(2, 2, 1, 1).data],
    };
  });
  const noRegionDownload = page.waitForEvent('download', { timeout: 750 }).catch(() => undefined);
  await page.getByTestId('t57-download').click();
  expect(await noRegionDownload).toBeUndefined();
  await expect(page.getByTestId('t57-notice')).toContainText('Mark at least one face area');

  for (const [testId, value] of [
    ['t57-region-x', '16'],
    ['t57-region-y', '16'],
    ['t57-region-width', '32'],
    ['t57-region-height', '32'],
  ] as const) {
    const input = page.getByTestId(testId);
    await input.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(value);
  }
  const addButton = page.getByTestId('t57-add-coordinates');
  await addButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.region-list li')).toHaveCount(1);
  await expect(page.getByTestId('t57-status')).toContainText('1 area will be blurred');

  const pixels = await page.getByTestId('t57-preview').evaluate(async (element) => {
    const previewContext = (element as HTMLCanvasElement).getContext('2d');
    if (!previewContext) throw new Error('Canvas context is unavailable.');
    const previewCenter = [...previewContext.getImageData(32, 32, 1, 1).data];
    const previewOutside = [...previewContext.getImageData(2, 2, 1, 1).data];
    const previewBytes = new Uint8Array(
      await new Promise<Blob>((resolve, reject) => {
        (element as HTMLCanvasElement).toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed.'))),
          'image/png',
        );
      }).then((blob) => blob.arrayBuffer()),
    );
    let binary = '';
    for (let offset = 0; offset < previewBytes.length; offset += 32_768) {
      binary += String.fromCharCode(...previewBytes.subarray(offset, offset + 32_768));
    }
    return {
      previewCenter,
      previewOutside,
      previewBase64: btoa(binary),
    };
  });
  expect(pixels.previewCenter).not.toEqual(sourcePixels.center);
  expect(pixels.previewOutside).toEqual(sourcePixels.outside);

  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId('t57-download').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('manual-review-blurred.png');
  const downloadPath = await download.path();
  expect(await readFile(downloadPath!)).toEqual(Buffer.from(pixels.previewBase64, 'base64'));
  expect(externalRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('T57 draws a pointer-selected region, removes regions, and enforces region bounds', async ({
  page,
}) => {
  await page.goto('/blur-face');
  await waitForHydration(page);
  await page.getByTestId('t57-input').setInputFiles({
    name: 'pointer.png',
    mimeType: 'image/png',
    buffer: await generatedPng(page),
  });
  const canvas = page.getByTestId('t57-preview');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('T57 preview has no layout box.');
  await canvas.evaluate((element) => {
    const events: string[] = [];
    for (const name of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'mousedown',
      'mouseup',
    ]) {
      element.addEventListener(name, () => events.push(name), true);
      window.addEventListener(name, () => events.push(`window:${name}`), true);
    }
    (window as typeof window & { __t57PointerEvents?: string[] }).__t57PointerEvents = events;
  });
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height * 0.75, {
    steps: 5,
  });
  await expect(page.locator('.selection')).toBeVisible();
  await page.mouse.up();
  if (test.info().project.name === 'firefox') {
    await page.evaluate(
      ({ clientX, clientY }) => {
        window.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            button: 0,
            clientX,
            clientY,
            pointerId: 1,
            pointerType: 'mouse',
          }),
        );
      },
      {
        clientX: bounds.x + bounds.width * 0.75,
        clientY: bounds.y + bounds.height * 0.75,
      },
    );
  }
  const observed = await page.evaluate(
    () => (window as typeof window & { __t57PointerEvents?: string[] }).__t57PointerEvents,
  );
  expect(observed).toContain('pointerdown');
  expect(observed).toContain('window:pointerup');
  await expect(page.locator('.region-list li')).toHaveCount(1);
  await page.getByRole('button', { name: /Remove area/u }).click();
  await expect(page.locator('.region-list li')).toHaveCount(0);

  await page.getByTestId('t57-region-width').fill('4');
  await page.getByTestId('t57-region-height').fill('7');
  await page.getByTestId('t57-add-coordinates').click();
  await expect(page.getByTestId('t57-notice')).toContainText('at least 8 × 8 pixels');
  await expect(page.locator('.region-list li')).toHaveCount(0);

  await page.getByTestId('t57-region-x').fill('8');
  await page.getByTestId('t57-region-y').fill('8');
  await page.getByTestId('t57-region-width').fill('16');
  await page.getByTestId('t57-region-height').fill('16');
  for (let index = 0; index < 12; index += 1) await page.getByTestId('t57-add-coordinates').click();
  await expect(page.locator('.region-list li')).toHaveCount(12);
  await page.getByTestId('t57-add-coordinates').click();
  await expect(page.getByTestId('t57-notice')).toContainText('up to 12 areas');
  await page.getByRole('button', { name: /Clear all areas/u }).click();
  await expect(page.locator('.region-list li')).toHaveCount(0);
  await page.getByRole('button', { name: /Remove image/u }).click();
  await expect(page.getByTestId('t57-ready')).toBeVisible();
});

test('T57 selects and previews a 6 MP still PNG with one blur in under three seconds', async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== 'chromium',
    'The §19 operation latency gate uses Chromium.',
  );
  await page.goto('/blur-face');
  await waitForHydration(page);
  const source = await generatedSolidPng(page, 3_000, 2_000);
  const startedAt = await page.evaluate(() => performance.now());
  await page.getByTestId('t57-input').setInputFiles({
    name: 'six-megapixel.png',
    mimeType: 'image/png',
    buffer: source,
  });
  await expect(page.getByTestId('t57-file-info')).toContainText('3000 × 2000 pixels');
  await page.getByTestId('t57-add-coordinates').click();
  await expect(page.getByTestId('t57-status')).toContainText('1 area will be blurred');
  const elapsedMs = await page.evaluate((start) => performance.now() - start, startedAt);
  console.log(`T57 6 MP selection-to-blur-preview: ${elapsedMs.toFixed(1)} ms`);
  expect(elapsedMs).toBeLessThanOrEqual(3_000);
});

test('T57 returns a typed, actionable error for unsupported input', async ({ page }) => {
  await page.goto('/blur-face');
  await waitForHydration(page);
  await page.getByTestId('t57-input').setInputFiles({
    name: 'not-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a PNG'),
  });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'unsupported');
  await expect(alert).toContainText('Choose a valid PNG image');
  await expect(alert).toContainText('Export a still PNG image');
});

test('T57 rejects files above 16 MiB before reading their contents', async ({ page }) => {
  await page.goto('/blur-face');
  await waitForHydration(page);
  await page.getByTestId('t57-input').evaluate((element) => {
    const file = new File([new Uint8Array([0])], 'oversized.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { configurable: true, value: 16 * 1024 * 1024 + 1 });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = element as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'too-large');
  await expect(alert).toContainText('16 MiB file limit');
  await expect(alert).toContainText('Choose a PNG smaller than 16 MiB');
});

test('T57 refuses PNG headers over six megapixels', async ({ page }) => {
  await page.goto('/blur-face');
  await waitForHydration(page);
  const oversizedDimensions = await generatedPng(page);
  oversizedDimensions.writeUInt32BE(3_000, 16);
  oversizedDimensions.writeUInt32BE(2_001, 20);
  await page.getByTestId('t57-input').setInputFiles({
    name: 'oversized-dimensions.png',
    mimeType: 'image/png',
    buffer: oversizedDimensions,
  });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'too-many-pixels');
  await expect(alert).toContainText('6 megapixel limit');
  await expect(alert).toContainText('Resize the image to 6 megapixels or fewer');
});

test('T57 rejects APNG input with a typed still-image remedy', async ({ page }) => {
  await page.goto('/blur-face');
  await waitForHydration(page);
  await page.getByTestId('t57-input').setInputFiles({
    name: 'animated.png',
    mimeType: 'image/png',
    buffer: animatedPng(await generatedPng(page)),
  });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'animated');
  await expect(alert).toContainText('Animated PNG is not supported');
  await expect(alert).toContainText('Export one still frame');
});

test('T57 reports a browser decoder failure with a recovery remedy', async ({ page }) => {
  await page.goto('/blur-face');
  await waitForHydration(page);
  const fixture = await generatedPng(page);
  await page.evaluate(() => {
    Object.defineProperty(window, 'createImageBitmap', {
      configurable: true,
      value: async () => {
        throw new Error('Simulated unsupported local File decoding.');
      },
    });
    Object.defineProperty(window, 'Image', {
      configurable: true,
      value: class {
        onload: ((event: Event) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        decoding = 'async';
        naturalWidth = 0;
        naturalHeight = 0;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.(new Event('error')));
        }
      },
    });
  });
  await page.getByTestId('t57-input').setInputFiles({
    name: 'decoder-failure.png',
    mimeType: 'image/png',
    buffer: fixture,
  });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'decode');
  await expect(alert).toContainText('browser could not decode');
  await expect(alert).toContainText('Export a valid, non-animated PNG');
});

test('T57 decodes locally when createImageBitmap rejects a file', async ({ page }) => {
  await page.goto('/blur-face');
  await waitForHydration(page);
  const fixture = await generatedPng(page);
  await page.evaluate(() => {
    Object.defineProperty(window, 'createImageBitmap', {
      configurable: true,
      value: async () => {
        throw new Error('Simulated unsupported local File decoding.');
      },
    });
  });
  await page.getByTestId('t57-input').setInputFiles({
    name: 'fallback-decode.png',
    mimeType: 'image/png',
    buffer: fixture,
  });
  await expect(page.getByTestId('t57-file-info')).toContainText('64 × 64 pixels');
  await page.getByTestId('t57-add-coordinates').click();
  await expect(page.getByTestId('t57-status')).toContainText('1 area will be blurred');
});

test('T57 explains when this browser cannot create a 2D canvas', async ({ page }) => {
  await page.goto('/blur-face');
  await waitForHydration(page);
  const fixture = await generatedPng(page);
  await page.evaluate(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
  });
  await page.getByTestId('t57-input').setInputFiles({
    name: 'no-canvas.png',
    mimeType: 'image/png',
    buffer: fixture,
  });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveAttribute('data-error-kind', 'canvas');
  await expect(alert).toContainText('could not process the image locally');
  await expect(alert).toContainText('current browser with 2D canvas support');
});
