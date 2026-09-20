import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureOcrTessdata } from '../../../scripts/ensure-ocr-tessdata.mjs';
import {
  OCR_FIXTURE_HEIGHT,
  OCR_FIXTURE_WIDTH,
  ocrLanguageFixtures,
} from './ocr-language-fixtures.mjs';

const benchmarkDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(benchmarkDirectory, '../../..');
const appDirectory = resolve(repositoryDirectory, 'apps/web');
const engineSource = resolve(repositoryDirectory, 'packages/engine/src/ocr.ts');
const resultPath = resolve(
  repositoryDirectory,
  'packages/engine/bench/ocr-language-smoke-results.json',
);
const fixtureManifestPath = resolve(benchmarkDirectory, 'fixtures/ocr-language/manifest.json');
const fixtureManifestBytes = await readFile(fixtureManifestPath);
const fixtureManifest = JSON.parse(fixtureManifestBytes);
const fixtureManifestSha256 = createHash('sha256').update(fixtureManifestBytes).digest('hex');
const fixtureAssets = await Promise.all(
  ocrLanguageFixtures.map(async (fixture) => {
    const asset = fixtureManifest.fixtures.find(
      (candidate) => candidate.language === fixture.language,
    );
    if (
      !asset ||
      asset.groundTruth !== fixture.text ||
      asset.requestedFontStack !== fixture.font ||
      asset.dimensions?.width !== OCR_FIXTURE_WIDTH ||
      asset.dimensions?.height !== OCR_FIXTURE_HEIGHT
    ) {
      throw new Error(
        `The persisted ${fixture.language} OCR fixture manifest does not match its recipe.`,
      );
    }
    const png = await readFile(resolve(repositoryDirectory, asset.path));
    const pngSha256 = createHash('sha256').update(png).digest('hex');
    if (
      png.byteLength !== asset.sizeBytes ||
      pngSha256 !== asset.pngSha256 ||
      png.toString('ascii', 1, 4) !== 'PNG' ||
      png.readUInt32BE(16) !== OCR_FIXTURE_WIDTH ||
      png.readUInt32BE(20) !== OCR_FIXTURE_HEIGHT
    ) {
      throw new Error(`The persisted ${fixture.language} OCR PNG does not match its manifest.`);
    }
    return {
      ...fixture,
      path: asset.path,
      pngBase64: png.toString('base64'),
      pngSha256,
      rgbaSha256: asset.rgbaSha256,
    };
  }),
);

const appRequire = createRequire(resolve(appDirectory, 'package.json'));
const { createServer } = await import(pathToFileURL(appRequire.resolve('vite')).href);
const rootRequire = createRequire(resolve(repositoryDirectory, 'package.json'));
const playwrightRequire = createRequire(rootRequire.resolve('@playwright/test'));
const { chromium } = playwrightRequire('playwright');

await ensureOcrTessdata([
  ...new Set([...ocrLanguageFixtures.map(({ language }) => language), 'osd', 'equ', 'deu_latf']),
]);

function normalized(text) {
  return text.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

function characterErrorRate(expected, actual) {
  const left = Array.from(normalized(expected));
  const right = Array.from(normalized(actual));
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return left.length === 0 ? (right.length === 0 ? 0 : 1) : previous[right.length] / left.length;
}

process.chdir(appDirectory);
let server;
let browser;
try {
  server = await createServer({
    configFile: resolve(appDirectory, 'vite.config.ts'),
    root: appDirectory,
    plugins: [
      {
        name: 'ocr-language-smoke-page',
        enforce: 'pre',
        configureServer(viteServer) {
          viteServer.middlewares.use('/__ocr-language-smoke.html', (_request, response) => {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(
              '<!doctype html><html><head><meta charset="utf-8"><title>OCR smoke</title></head><body></body></html>',
            );
          });
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      fs: { allow: [repositoryDirectory] },
    },
    logLevel: 'error',
  });
  await server.listen();
  const origin = server.resolvedUrls?.local?.[0];
  if (!origin) throw new Error('Vite did not provide a local server URL.');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const runtimeRequests = [];
  const runtimeExternalOrigins = new Set();
  const pageErrors = [];
  const trackPage = (trackedPage) => {
    trackedPage.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/ocr-runtime/') || url.pathname.startsWith('/tessdata/')) {
        runtimeRequests.push({ url: request.url(), method: request.method() });
        if (url.origin !== new URL(origin).origin) runtimeExternalOrigins.add(url.origin);
      }
    });
    trackedPage.on('pageerror', (error) => pageErrors.push(error.message));
  };
  trackPage(page);
  await page.goto(new URL('/__ocr-language-smoke.html', origin).href, {
    waitUntil: 'domcontentloaded',
  });
  const sourceUrl = new URL(`/@fs/${encodeURI(engineSource.replaceAll('\\', '/'))}`, origin).href;

  const results = [];
  for (const fixture of fixtureAssets) {
    const measured = await page.evaluate(
      async ({ sourceUrl, fixture }) => {
        const { createOcrWorker } = await import(sourceUrl);
        const binary = atob(fixture.pngBase64);
        const pngBytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++)
          pngBytes[index] = binary.charCodeAt(index);
        const bitmap = await createImageBitmap(new Blob([pngBytes], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context is unavailable.');
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const inputSha256 = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', imageData.data)),
        )
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        const worker = createOcrWorker();
        const progress = [];
        const jobId = `smoke-${fixture.language}`;
        const output = await new Promise((resolve) => {
          const timeout = setTimeout(
            () => resolve({ type: 'timeout', error: 'OCR did not finish in 180 seconds.' }),
            180_000,
          );
          worker.addEventListener('message', ({ data }) => {
            if (data.jobId !== jobId) return;
            if (data.type === 'ocr-progress') progress.push(data.progress);
            if (data.type === 'ocr-result' || data.type === 'ocr-error') {
              clearTimeout(timeout);
              resolve(data);
            }
          });
          worker.postMessage({
            type: 'ocr',
            jobId,
            imageData: { width: imageData.width, height: imageData.height, data: imageData.data },
            options: { language: fixture.language },
          });
        });
        worker.terminate();
        return {
          language: fixture.language,
          groundTruth: fixture.text,
          inputSha256,
          fixturePath: fixture.path,
          fixturePngSha256: fixture.pngSha256,
          width: imageData.width,
          height: imageData.height,
          fontStack: fixture.font,
          output,
          progress,
        };
      },
      { sourceUrl, fixture },
    );

    if (measured.inputSha256 !== fixture.rgbaSha256) {
      throw new Error(
        `The browser-decoded ${fixture.language} pixels do not match the fixture RGBA hash: ` +
          `${measured.inputSha256} vs ${fixture.rgbaSha256}.`,
      );
    }

    const recognized = measured.output?.result?.text ?? '';
    results.push({
      language: measured.language,
      groundTruth: measured.groundTruth,
      inputSha256: measured.inputSha256,
      fixturePath: measured.fixturePath,
      fixturePngSha256: measured.fixturePngSha256,
      dimensions: { width: measured.width, height: measured.height },
      fontStack: measured.fontStack,
      output:
        measured.output?.type === 'ocr-result'
          ? {
              type: measured.output.type,
              language: measured.output.result.language,
              text: measured.output.result.text,
              confidence: measured.output.result.confidence,
            }
          : {
              type: measured.output?.type ?? 'missing-output',
              error: measured.output?.error ?? 'No OCR result was returned.',
            },
      error:
        measured.output?.type === 'ocr-result'
          ? null
          : (measured.output?.error ?? 'No OCR result was returned.'),
      characterErrorRate:
        measured.output?.type === 'ocr-result'
          ? characterErrorRate(fixture.text, recognized)
          : null,
      exactMatch:
        measured.output?.type === 'ocr-result'
          ? normalized(fixture.text) === normalized(recognized)
          : false,
    });
  }

  const helperPage = await browser.newPage();
  trackPage(helperPage);
  await helperPage.goto(new URL('/__ocr-language-smoke.html', origin).href, {
    waitUntil: 'domcontentloaded',
  });
  const helperSmoke = await helperPage.evaluate(async (sourceUrl) => {
    const { createOcrWorker } = await import(sourceUrl);
    const makeCanvas = (width, height, lines, rotateClockwise = false) => {
      const canvas = document.createElement('canvas');
      canvas.width = rotateClockwise ? height : width;
      canvas.height = rotateClockwise ? width : height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#111';
      context.font = rotateClockwise
        ? '42px Arial, sans-serif'
        : '78px Cambria Math, Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      if (rotateClockwise) {
        context.translate(canvas.width, 0);
        context.rotate(Math.PI / 2);
        lines.forEach((line, index) => {
          context.fillText(line, width / 2, ((index + 0.5) * height) / lines.length, width - 48);
        });
      } else {
        lines.forEach((line, index) => {
          context.fillText(line, width / 2, ((index + 0.5) * height) / lines.length, width - 48);
        });
      }
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const request = async (jobId, imageData, options) => {
      const worker = createOcrWorker();
      const result = await new Promise((resolve) => {
        const timeout = setTimeout(
          () => resolve({ type: 'timeout', error: 'OCR helper did not finish in 180 seconds.' }),
          180_000,
        );
        worker.addEventListener('message', ({ data }) => {
          if (data.jobId !== jobId) return;
          if (
            data.type === 'ocr-helper-result' ||
            data.type === 'ocr-result' ||
            data.type === 'ocr-error'
          ) {
            clearTimeout(timeout);
            resolve(data);
          }
        });
        worker.postMessage({
          type: 'ocr',
          jobId,
          imageData: {
            width: imageData.width,
            height: imageData.height,
            data: imageData.data,
          },
          options,
        });
      });
      worker.terminate();
      return result;
    };

    const rotated = makeCanvas(
      1800,
      280,
      [
        'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG 12345',
        'PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS 67890',
        'JACKDAWS LOVE MY BIG SPHINX OF QUARTZ 1234567',
        'THE FIVE BOXING WIZARDS JUMP QUICKLY 9876543',
        'HOW VEXINGLY QUICK DAFT ZEBRAS JUMP 246810',
      ],
      true,
    );
    const osd = await request('smoke-helper-osd', rotated, { mode: 'helper', helper: 'osd' });
    const equationInput = makeCanvas(1200, 300, ['E = mc²', '1 + 1 = 2', 'a² + b² = c²']);
    const equation = await request('smoke-helper-equ', equationInput, {
      mode: 'helper',
      helper: 'equ',
      language: 'eng',
      psm: 6,
    });
    const aliasInput = makeCanvas(1200, 160, ['Fünf süße Äpfel 123']);
    const frakturAlias = await request('smoke-language-frk-alias', aliasInput, {
      language: 'frk',
    });
    return {
      orientation: {
        requestedMode: 'helper',
        helper: 'osd',
        inputClockwiseRotationDegrees: 90,
        dimensions: { width: rotated.width, height: rotated.height },
        output: osd,
      },
      equation: {
        requestedMode: 'helper',
        helper: 'equ',
        dimensions: { width: equationInput.width, height: equationInput.height },
        output: equation,
      },
      deprecatedAlias: {
        requestedLanguage: 'frk',
        expectedWorkerModel: 'deu_latf',
        dimensions: { width: aliasInput.width, height: aliasInput.height },
        output: frakturAlias,
      },
    };
  }, sourceUrl);

  const output = {
    generatedAt: new Date().toISOString(),
    environment: {
      browser: browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      origin,
      fixtureMethod:
        'Decode the exact checked-in self-generated PNG fixtures; no scanned or third-party samples.',
      fixtureManifest: {
        path: 'packages/engine/bench/fixtures/ocr-language/manifest.json',
        sha256: fixtureManifestSha256,
        renderer: fixtureManifest.renderer,
      },
      runtimeRequests,
      runtimeExternalOrigins: [...runtimeExternalOrigins],
      pageErrors,
    },
    metrics:
      'Unicode-codepoint CER after NFC normalization and whitespace collapse; exact match uses the same normalization.',
    summary: {
      languages: results.length,
      errors: results.filter((result) => result.error !== null).length,
      exactMatches: results.filter((result) => result.exactMatch).length,
      meanCharacterErrorRate:
        results.reduce((sum, result) => sum + (result.characterErrorRate ?? 0), 0) / results.length,
    },
    helperSmoke,
    results,
  };
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  await browser?.close();
  await server?.close();
}
