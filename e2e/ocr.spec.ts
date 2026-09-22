import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { allowAllNetwork, denyAllNetwork } from './support/network';

async function generatedTextPng(page: import('@playwright/test').Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111';
    context.font = '48px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('THE QUICK BROWN FOX 123', canvas.width / 2, canvas.height / 2);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the generated OCR fixture.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

async function generatedRotatedTextPng(page: import('@playwright/test').Page) {
  const base64 = await page.evaluate(async () => {
    const width = 1800;
    const height = 280;
    const canvas = document.createElement('canvas');
    canvas.width = height;
    canvas.height = width;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111';
    context.font = '42px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    [
      'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG 12345',
      'PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS 67890',
      'JACKDAWS LOVE MY BIG SPHINX OF QUARTZ 1234567',
      'THE FIVE BOXING WIZARDS JUMP QUICKLY 9876543',
      'HOW VEXINGLY QUICK DAFT ZEBRAS JUMP 246810',
    ].forEach((line, index, lines) => {
      context.fillText(line, width / 2, ((index + 0.5) * height) / lines.length, width - 48);
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the rotated OCR fixture.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

for (const locale of ['en', 'en-XA', 'ar'] as const) {
  test(`${locale}/ocr is prerendered with localized discovery content`, async ({ page }) => {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    await page.goto(`${prefix}/ocr`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await expect(page.locator('link[rel=alternate]')).toHaveCount(4);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    await expect(page.locator('.tool-completion details')).toHaveCount(3);
    const graph = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    )['@graph'] as Array<{ '@type': string }>;
    expect(graph.map((entry) => entry['@type'])).toEqual([
      'SoftwareApplication',
      'FAQPage',
      'BreadcrumbList',
    ]);
  });
}

test('OCR exposes the full pinned language and script catalogues with both helpers', async ({
  page,
}) => {
  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  const orientationMode = page.getByRole('button', { name: 'Page orientation', exact: true });
  await orientationMode.click();
  await expect(orientationMode).toHaveAttribute('aria-pressed', 'true');
  const scriptMode = page.getByRole('button', { name: 'Script model', exact: true });
  await scriptMode.click();
  await expect(scriptMode).toHaveAttribute('aria-pressed', 'true');
  const scriptSelector = page.getByLabel('Script model');
  await expect(scriptSelector.locator('option')).toHaveCount(37);
  await expect(scriptSelector.locator('option[value="script/Latin"]')).toContainText('85.2 MiB');
  await orientationMode.click();
  await expect(orientationMode).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Script model')).toHaveCount(0);
  await page.getByRole('button', { name: 'Equation recognition', exact: true }).click();
  await expect(page.getByLabel('Base language')).toBeVisible();
  await expect(page.getByLabel('Base language').locator('option')).toHaveCount(124);
  await page.getByRole('button', { name: 'Language or variant', exact: true }).click();
  await expect(page.getByLabel('Language or variant').locator('option')).toHaveCount(124);
  await expect(page.getByLabel('Language or variant')).toHaveValue('eng');
});

test('OCR language and script model names follow Arabic and pseudo-locales', async ({ page }) => {
  await page.goto('/ar/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('button', { name: 'لغة أو صيغة', exact: true }).click();
  const arabicLanguages = page.locator('[data-testid="option-ocr-language"] select');
  await expect(arabicLanguages.locator('option[value="eng"]')).toHaveText('الإنجليزية');
  await expect(arabicLanguages.locator('option[value="fra"]')).toHaveText('الفرنسية');
  await expect(arabicLanguages.locator('option[value="chi_sim"]')).toContainText('المبسطة');
  const arabicLanguageLabels = await arabicLanguages.locator('option').allTextContents();
  expect(arabicLanguageLabels).toHaveLength(124);
  const unlocalizedArabicLanguages = arabicLanguageLabels.filter(
    (label) => !/\p{Script=Arabic}/u.test(label),
  );
  expect(unlocalizedArabicLanguages, unlocalizedArabicLanguages.join('\n')).toEqual([]);

  await page.getByRole('button', { name: 'نموذج كتابة', exact: true }).click();
  const arabicScripts = page.locator('[data-testid="option-ocr-script"] select');
  await expect(arabicScripts.locator('option[value="script/Arabic"]')).toContainText(
    'نموذج OCR للكتابة العربية',
  );
  await expect(arabicScripts.locator('option[value="script/Cyrillic"]')).toContainText('السيريلية');
  const arabicScriptLabels = await arabicScripts.locator('option').allTextContents();
  expect(arabicScriptLabels).toHaveLength(37);
  expect(
    arabicScriptLabels.every((label) => {
      const name = label.match(/^نموذج OCR للكتابة (.+?)(?: \(نص عمودي\))?$/u)?.[1];
      return name !== undefined && /\p{Script=Arabic}/u.test(name);
    }),
  ).toBe(true);

  await page.goto('/en-XA/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  const pseudoEnglish = page.locator(
    '[data-testid="option-ocr-language"] select option[value="eng"]',
  );
  await expect(pseudoEnglish).toHaveText(/^［.+~+］$/u);
  const pseudoLanguages = await page
    .locator('[data-testid="option-ocr-language"] select option')
    .allTextContents();
  expect(pseudoLanguages).toHaveLength(124);
  expect(pseudoLanguages.every((label) => /^［.+~+］$/u.test(label))).toBe(true);
  const pseudoScriptMode = page
    .getByTestId('option-ocr-mode')
    .getByRole('button', { name: /Scrïpt môdël/u });
  await pseudoScriptMode.click();
  await expect(pseudoScriptMode).toHaveAttribute('aria-pressed', 'true');
  const pseudoScriptSelector = page.locator('[data-testid="option-ocr-script"] select');
  await expect(pseudoScriptSelector).toBeVisible();
  const pseudoScripts = await pseudoScriptSelector.locator('option').allTextContents();
  expect(pseudoScripts).toHaveLength(37);
  expect(pseudoScripts.every((label) => /^［.+~+］$/u.test(label))).toBe(true);
});

test('OCR keeps model data unloaded until requested and shows orientation guidance', async ({
  page,
}) => {
  const modelRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/tessdata/') || url.hostname === 'cdn.jsdelivr.net') {
      modelRequests.push(request.url());
    }
  });
  await page.goto('/ocr');
  await expect(page.getByText(/Rotate the image upright for the best result/u)).toBeVisible();
  expect(modelRequests).toEqual([]);
});

test('T62 uses the bundled Cyrillic script model from the local script directory', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const externalRequests: string[] = [];
  const scriptModelMethods: string[] = [];
  let appOrigin = '';
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (appOrigin && url.origin !== appOrigin) externalRequests.push(url.href);
    if (url.pathname === '/tessdata/script/Cyrillic.traineddata') {
      scriptModelMethods.push(request.method());
    }
  });
  await page.goto('/ocr');
  appOrigin = new URL(page.url()).origin;
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  const scriptMode = page.getByRole('button', { name: 'Script model', exact: true });
  await scriptMode.click();
  await expect(scriptMode).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Script model').selectOption('script/Cyrillic');
  await page.getByLabel('Choose a raster image').setInputFiles({
    name: 'generated-script-fixture.png',
    mimeType: 'image/png',
    buffer: await generatedTextPng(page),
  });
  const recognizeButton = page.getByRole('button', { name: 'Recognize text' });
  await expect(recognizeButton).toBeEnabled();
  await recognizeButton.click();
  await expect(page.getByTestId('ocr-result')).toContainText('script/Cyrillic', {
    timeout: 180_000,
  });
  expect(scriptModelMethods).toContain('HEAD');
  expect(scriptModelMethods).toContain('GET');
  expect(externalRequests).toEqual([]);
});

test('T62 bundled Cyrillic recognition survives a fresh-page offline reload', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit cannot reload this local Blob/File OCR flow while browser networking is offline.',
  );
  test.setTimeout(300_000);
  const selectBundledMode = async () => {
    const scriptMode = page.getByRole('button', { name: 'Script model', exact: true });
    await scriptMode.click();
    await expect(scriptMode).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Script model').selectOption('script/Cyrillic');
  };
  const recognizeBundled = async (name: string) => {
    await selectBundledMode();
    await page.getByLabel('Choose a raster image').setInputFiles({
      name,
      mimeType: 'image/png',
      buffer: await generatedTextPng(page),
    });
    await page.getByRole('button', { name: 'Recognize text' }).click();
    await expect(page.getByTestId('ocr-result')).toContainText('script/Cyrillic', {
      timeout: 180_000,
    });
  };

  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  await recognizeBundled('cyrillic-online.png');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
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
  // Run once while the service worker controls the page so its cache contains
  // the bundled model GET as well as the worker/core assets.
  await recognizeBundled('cyrillic-service-worker-warm.png');

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
    await recognizeBundled('cyrillic-offline.png');
  } finally {
    if (!page.isClosed()) await context.setOffline(false);
  }
});

test('T62 reuses a CDN-delivered language model after a fresh-page external-network block', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit cannot reload this local Blob/File OCR flow while browser networking is offline.',
  );
  test.setTimeout(300_000);
  const pinnedEnglishUrl =
    'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata';
  const externalRequests: string[] = [];
  const blockedRequests: string[] = [];
  let offline = false;

  // Force this measurement through the CDN path even when an ignored local test cache exists.
  await page.route('**/tessdata/eng.traineddata', (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not in the local cache.' }),
  );
  await page.route(pinnedEnglishUrl, (route) => {
    if (offline) blockedRequests.push(route.request().url());
    externalRequests.push(route.request().url());
    return route.continue();
  });

  const recognizeEnglish = async (name: string) => {
    await page.getByLabel('Choose a raster image').setInputFiles({
      name,
      mimeType: 'image/png',
      buffer: await generatedTextPng(page),
    });
    await page.getByRole('button', { name: 'Recognize text' }).click();
    await expect(page.getByTestId('ocr-output')).toContainText('THE QUICK BROWN FOX', {
      timeout: 180_000,
    });
  };

  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  await recognizeEnglish('english-cdn-online.png');
  expect(externalRequests).toContain(pinnedEnglishUrl);

  // Put the page under the service worker before simulating a fresh network-blocked entry. This
  // mirrors the bundled-model test, while the traineddata itself must come from Tesseract's cache.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
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
  await recognizeEnglish('english-cdn-service-worker-warm.png');

  offline = true;
  await denyAllNetwork(context);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
    await recognizeEnglish('english-cdn-offline.png');
    expect(blockedRequests).toEqual([]);
  } finally {
    offline = false;
    await allowAllNetwork(context);
  }
});

test('T62 reports a failed pinned model download with a recovery remedy', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit does not expose the intercepted cross-origin model failure to the page.',
  );
  const pinnedEnglishUrl =
    'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata';
  const requestedModelUrls: string[] = [];
  await page.route('**/tessdata/eng.traineddata', (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not in the local cache.' }),
  );
  await page.route(pinnedEnglishUrl, async (route) => {
    requestedModelUrls.push(route.request().url());
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Synthetic CDN outage.' });
  });

  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  await page.getByLabel('Choose a raster image').setInputFiles({
    name: 'generated-download-failure-fixture.png',
    mimeType: 'image/png',
    buffer: await generatedTextPng(page),
  });
  await page.getByRole('button', { name: 'Recognize text' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('preload the file manually', { timeout: 60_000 });
  expect(requestedModelUrls).toEqual([pinnedEnglishUrl]);
});

test('T62 orientation helper returns page rotation and confidence data', async ({ page }) => {
  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  const orientationMode = page.getByRole('button', { name: 'Page orientation', exact: true });
  await orientationMode.click();
  await expect(orientationMode).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Choose a raster image').setInputFiles({
    name: 'rotated-generated-text.png',
    mimeType: 'image/png',
    buffer: await generatedRotatedTextPng(page),
  });
  await page.getByRole('button', { name: 'Recognize text' }).click();

  const result = page.getByTestId('ocr-result');
  await expect(result.getByText('Page orientation', { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  await expect(result.locator('dd').nth(0)).toHaveText('270°');
  await expect(result.getByText('Orientation confidence', { exact: true })).toBeVisible();
  await expect(result.getByText('Detected script', { exact: true })).toBeVisible();
  await expect(result.getByText('Script confidence', { exact: true })).toBeVisible();
});

test('T62 fetches only the pinned OSD model when orientation is first requested', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit resolves the local fallback after the intercepted CDN miss, so it cannot verify the CDN request contract.',
  );
  test.setTimeout(300_000);

  const assetRecords = JSON.parse(await readFile('docs/static-assets.json', 'utf8')) as Array<{
    path: string;
    delivery?: string;
    deliveryUrl?: string;
    upstreamCommit?: string;
  }>;
  const osdRecord = assetRecords.find(
    (record) => record.path === 'apps/web/static/tessdata/osd.traineddata',
  );
  if (!osdRecord || osdRecord.delivery !== 'lazy-cdn' || !osdRecord.upstreamCommit) {
    throw new Error('The OSD model must have a pinned lazy-CDN register entry.');
  }
  const expectedOsdUrl =
    `https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@${osdRecord.upstreamCommit}/` +
    'osd.traineddata';
  expect(osdRecord.deliveryUrl).toBe(expectedOsdUrl);

  // The normal E2E setup may prepare a local OSD cache. Force the expected cache
  // miss so this route test always verifies lazy delivery from the pinned CDN.
  await page.route('**/tessdata/osd.traineddata', (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not in the local cache.' }),
  );

  const traineddataRequests: Array<{ url: string; method: string }> = [];
  context.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('.traineddata')) {
      traineddataRequests.push({ url: request.url(), method: request.method() });
    }
  });

  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  expect(traineddataRequests).toEqual([]);

  const orientationMode = page.getByRole('button', { name: 'Page orientation', exact: true });
  await orientationMode.click();
  await expect(orientationMode).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Choose a raster image').setInputFiles({
    name: 'rotated-generated-text.png',
    mimeType: 'image/png',
    buffer: await generatedRotatedTextPng(page),
  });
  expect(traineddataRequests).toEqual([]);

  await page.getByRole('button', { name: 'Recognize text' }).click();
  const result = page.getByTestId('ocr-result');
  await expect(result.getByText('Page orientation', { exact: true })).toBeVisible({
    timeout: 240_000,
  });
  await expect(result.locator('dd').nth(0)).toHaveText('270°');
  await expect(result.getByText('Orientation confidence', { exact: true })).toBeVisible();
  await expect(result.getByText('Detected script', { exact: true })).toBeVisible();
  await expect(result.getByText('Script confidence', { exact: true })).toBeVisible();

  const observedRequests = traineddataRequests.map(({ url, method }) => {
    const parsed = new URL(url);
    return parsed.hostname === 'cdn.jsdelivr.net'
      ? `${method} ${parsed.href}`
      : `${method} ${parsed.pathname}`;
  });
  expect(observedRequests).toEqual(['HEAD /tessdata/osd.traineddata', `GET ${expectedOsdUrl}`]);
});

test('T62 equation mode runs with its selected language and lazily fetches both registered models', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const assets = JSON.parse(await readFile('docs/static-assets.json', 'utf8')) as Array<{
    path: string;
    delivery?: string;
    deliveryUrl?: string;
  }>;
  const modelIds = ['eng', 'equ'] as const;
  const expectedUrls = modelIds.map((modelId) => {
    const record = assets.find(
      ({ path }) => path === `apps/web/static/tessdata/${modelId}.traineddata`,
    );
    if (!record || record.delivery !== 'lazy-cdn' || !record.deliveryUrl) {
      throw new Error(`The ${modelId} model must have a pinned lazy-CDN register entry.`);
    }
    return record.deliveryUrl;
  });
  const modelRequests: string[] = [];
  for (const modelId of modelIds) {
    await page.route(`**/tessdata/${modelId}.traineddata`, (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not in the local cache.' }),
    );
  }
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.endsWith('.traineddata')) {
      modelRequests.push(url.href);
    }
  });

  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  const equationMode = page.getByRole('button', { name: 'Equation recognition', exact: true });
  await equationMode.click();
  await expect(equationMode).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Base language')).toHaveValue('eng');
  expect(modelRequests).toEqual([]);
  await page.getByLabel('Choose a raster image').setInputFiles({
    name: 'equation-helper-fixture.png',
    mimeType: 'image/png',
    buffer: await generatedTextPng(page),
  });
  expect(modelRequests).toEqual([]);

  await page.getByRole('button', { name: 'Recognize text' }).click();
  const output = page.getByTestId('ocr-output');
  await expect(output).not.toHaveText(/^\s*$/u, { timeout: 240_000 });
  await expect(page.getByTestId('ocr-result')).toContainText('Model used: eng+equ');
  expect([...modelRequests].sort()).toEqual([...expectedUrls].sort());
});

test('T62 recognizes with a cached or pinned model and keeps the runtime same-origin', async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  const modelRuntimeRequests: string[] = [];
  const localEnglishModelStatuses: number[] = [];
  let appOrigin = '';
  context.on('request', (request) => {
    if (!appOrigin) return;
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== appOrigin) externalRequests.push(request.url());
    if (
      requestUrl.pathname.startsWith('/ocr-runtime/') ||
      requestUrl.pathname.startsWith('/tessdata/')
    ) {
      modelRuntimeRequests.push(request.url());
    }
  });
  context.on('response', (response) => {
    if (new URL(response.url()).pathname === '/tessdata/eng.traineddata') {
      localEnglishModelStatuses.push(response.status());
    }
  });
  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  appOrigin = new URL(page.url()).origin;
  const orientationMode = page.getByRole('button', { name: 'Page orientation', exact: true });
  await orientationMode.click();
  await expect(orientationMode).toHaveAttribute('aria-pressed', 'true');
  const languageMode = page.getByRole('button', { name: 'Language or variant', exact: true });
  await languageMode.click();
  await expect(languageMode).toHaveAttribute('aria-pressed', 'true');
  const fixture = {
    name: 'generated-english.png',
    mimeType: 'image/png',
    buffer: await generatedTextPng(page),
  };
  await page.getByLabel('Choose a raster image').setInputFiles(fixture);
  const recognizeButton = page.getByRole('button', { name: 'Recognize text' });
  await expect(recognizeButton).toBeEnabled();
  await recognizeButton.click();
  await expect(page.getByTestId('ocr-output')).toContainText('THE QUICK BROWN FOX', {
    timeout: 180_000,
  });
  await expect(page.getByTestId('ocr-output')).toContainText('123');

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download text' }).click();
  const download = await pendingDownload;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const downloadedText = await readFile(downloadPath!, 'utf8');
  expect(downloadedText).toBe(await page.getByTestId('ocr-output').innerText());
  expect(modelRuntimeRequests.some((url) => new URL(url).pathname.startsWith('/tessdata/'))).toBe(
    true,
  );
  expect(
    modelRuntimeRequests.some((url) => new URL(url).pathname.startsWith('/ocr-runtime/')),
  ).toBe(true);
  const pinnedEnglishUrl =
    'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata';
  expect(
    localEnglishModelStatuses.includes(200) || externalRequests.includes(pinnedEnglishUrl),
  ).toBe(true);
  expect(externalRequests.every((url) => url === pinnedEnglishUrl)).toBe(true);
});

test('T62 reuses all eight warmed language models without external requests', async ({
  page,
  context,
}) => {
  test.setTimeout(600_000);
  const languages = ['eng', 'fra', 'spa', 'hin', 'chi_sim', 'deu', 'jpn', 'ita'] as const;
  const fixtureDirectory = 'packages/engine/bench/fixtures/ocr-language';
  const externalModelRequests: string[] = [];
  const localModelResponses = new Set<string>();
  const runtimeCacheResponses: Array<{ url: string; cacheControl: string }> = [];
  const blockedExternalRequests: string[] = [];
  let appOrigin = '';
  let cachedOnly = false;
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.endsWith('.traineddata')) {
      externalModelRequests.push(url.href);
    }
    if (cachedOnly && url.origin !== new URL(page.url()).origin) {
      blockedExternalRequests.push(url.href);
    }
  });
  context.on('response', (response) => {
    const url = new URL(response.url());
    const localModel = /^\/tessdata\/([^/]+)\.traineddata$/u.exec(url.pathname);
    if (url.origin === appOrigin && localModel && response.status() === 200) {
      localModelResponses.add(localModel[1]);
    }
    if (url.origin === appOrigin && url.pathname.startsWith('/ocr-runtime/')) {
      runtimeCacheResponses.push({
        url: response.url(),
        cacheControl: response.headers()['cache-control'] ?? '',
      });
    }
  });

  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  appOrigin = new URL(page.url()).origin;
  const languageSelector = page.locator('[data-testid="option-ocr-language"] select');
  const fileInput = page.getByLabel('Choose a raster image');
  const recognizeButton = page.getByRole('button', { name: 'Recognize text' });
  const output = page.getByTestId('ocr-output');
  const onlineResults = new Map<string, string>();

  for (const language of languages) {
    await languageSelector.selectOption(language);
    await fileInput.setInputFiles({
      name: `${language}.png`,
      mimeType: 'image/png',
      buffer: await readFile(`${fixtureDirectory}/${language}.png`),
    });
    await recognizeButton.click();
    await expect(output).not.toHaveText(/^\s*$/u, { timeout: 180_000 });
    onlineResults.set(language, await output.innerText());
  }

  for (const language of languages) {
    expect(
      externalModelRequests.some((url) => url.endsWith(`/${language}.traineddata`)) ||
        localModelResponses.has(language),
      `${language} must be served locally or fetched before the offline pass`,
    ).toBe(true);
  }

  expect(runtimeCacheResponses.length).toBeGreaterThan(0);
  for (const runtimeResponse of runtimeCacheResponses) {
    expect(new URL(runtimeResponse.url).pathname).toMatch(/^\/ocr-runtime\/v7\.0\.0\//u);
    expect(runtimeResponse.cacheControl).toBe('public, max-age=31536000, immutable');
  }
  expect(runtimeCacheResponses.some(({ url }) => url.endsWith('/worker.min.js'))).toBe(true);

  // Keep the app origin available while blocking every external request. Browser-wide
  // offline mode breaks WebKit's local File/Blob input path, which this test exercises.
  await denyAllNetwork(context);
  cachedOnly = true;
  try {
    for (const language of languages) {
      await languageSelector.selectOption(language);
      await fileInput.setInputFiles({
        name: `${language}-offline.png`,
        mimeType: 'image/png',
        buffer: await readFile(`${fixtureDirectory}/${language}.png`),
      });
      await recognizeButton.click();
      await expect(output).not.toHaveText(/^\s*$/u, { timeout: 180_000 });
      expect(await output.innerText()).toBe(onlineResults.get(language));
    }
    expect(blockedExternalRequests).toEqual([]);
  } finally {
    cachedOnly = false;
    await allowAllNetwork(context);
  }
});

test('T62 supports keyboard-only file selection, recognition, and result download', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');

  const fileInput = page.getByLabel('Choose a raster image');
  const focused = (locator: import('@playwright/test').Locator) =>
    locator.evaluate((element) => element === document.activeElement);
  for (let attempts = 0; attempts < 64 && !(await focused(fileInput)); attempts++) {
    await page.keyboard.press('Tab');
  }
  await expect(fileInput).toBeFocused();

  const fixture = await generatedTextPng(page);
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'keyboard-generated-english.png',
    mimeType: 'image/png',
    buffer: fixture,
  });

  const recognizeButton = page.getByRole('button', { name: 'Recognize text' });
  for (let attempts = 0; attempts < 16 && !(await focused(recognizeButton)); attempts++) {
    await page.keyboard.press('Tab');
  }
  await expect(recognizeButton).toBeFocused();
  await page.keyboard.press('Enter');
  const output = page.getByTestId('ocr-output');
  await expect(output).toContainText('THE QUICK BROWN FOX', { timeout: 180_000 });
  await expect(output).toContainText('123');

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  const downloadButton = page.getByRole('button', { name: 'Download text' });
  for (let attempts = 0; attempts < 32 && !(await focused(downloadButton)); attempts++) {
    await page.keyboard.press('Tab');
  }
  await expect(downloadButton).toBeFocused();
  const pendingDownload = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await pendingDownload;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect(await readFile(downloadPath!, 'utf8')).toBe(await output.innerText());
});

test('T62 equation recognition loads the selected language and equation helper on demand', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const assets = JSON.parse(await readFile('docs/static-assets.json', 'utf8')) as Array<{
    path: string;
    delivery?: string;
    deliveryUrl?: string;
  }>;
  const expectedUrls = ['eng', 'equ'].map((modelId) => {
    const record = assets.find(
      ({ path }) => path === `apps/web/static/tessdata/${modelId}.traineddata`,
    );
    if (!record || record.delivery !== 'lazy-cdn' || !record.deliveryUrl) {
      throw new Error(`The ${modelId} model must have a pinned lazy-CDN register entry.`);
    }
    return record.deliveryUrl;
  });
  const modelRequests: string[] = [];
  for (const modelId of ['eng', 'equ']) {
    // Force the CDN path even if a prior local E2E left an ignored model cache.
    await page.route(`**/tessdata/${modelId}.traineddata`, (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not in the local cache.' }),
    );
  }
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.endsWith('.traineddata')) {
      modelRequests.push(url.href);
    }
  });

  await page.goto('/ocr');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  const equationMode = page.getByRole('button', { name: 'Equation recognition', exact: true });
  await equationMode.click();
  await expect(equationMode).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Base language')).toHaveValue('eng');
  expect(modelRequests).toEqual([]);
  await page.getByLabel('Choose a raster image').setInputFiles({
    name: 'equation-helper-fixture.png',
    mimeType: 'image/png',
    buffer: await generatedTextPng(page),
  });
  expect(modelRequests).toEqual([]);

  await page.getByRole('button', { name: 'Recognize text' }).click();
  const output = page.getByTestId('ocr-output');
  await expect(output).not.toHaveText(/^\s*$/u, { timeout: 240_000 });
  await expect(page.getByTestId('ocr-result')).toContainText('Model used: eng+equ');
  expect([...modelRequests].sort()).toEqual([...expectedUrls].sort());
});
