import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureOcrTessdata } from '../../../../../scripts/ensure-ocr-tessdata.mjs';

const benchmarkDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(benchmarkDirectory, '../../../../../');
const appDirectory = resolve(repositoryDirectory, 'apps/web');
const cc0Directory = resolve(repositoryDirectory, 'packages/engine/bench/escalation/fixtures/cc0');
const engineSource = resolve(repositoryDirectory, 'packages/engine/src/ocr.ts');
const manifestPath = resolve(cc0Directory, 'manifest.json');
const resultPath = resolve(benchmarkDirectory, 'cc0-results.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalized = (text) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

function reportRequestUrl(value, localOrigin) {
  const requestUrl = new URL(value);
  if (requestUrl.origin !== localOrigin) return value;
  if (requestUrl.pathname.startsWith('/@fs/')) {
    const filesystemPath = decodeURIComponent(requestUrl.pathname.slice('/@fs/'.length)).replaceAll(
      '\\',
      '/',
    );
    const repositoryPath = repositoryDirectory.replaceAll('\\', '/');
    const rootIndex = filesystemPath.toLowerCase().indexOf(repositoryPath.toLowerCase());
    if (rootIndex >= 0) {
      const relativePath = filesystemPath
        .slice(rootIndex + repositoryPath.length)
        .replace(/^\/+/, '');
      return `/@fs/<workspace>/${relativePath}${requestUrl.search}`;
    }
    return `/@fs/<external>${requestUrl.search}`;
  }
  return `${requestUrl.pathname}${requestUrl.search}`;
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

const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const asset = manifest.assets.find((candidate) => candidate.ocrSample);
if (!asset) throw new Error('The CC0 manifest has no registered OCR sample.');
const sourceBytes = await readFile(resolve(cc0Directory, asset.path));
const sourceSha256 = sha256(sourceBytes);
const sourceSha1 = createHash('sha1').update(sourceBytes).digest('hex');
if (sourceBytes.byteLength !== asset.sizeBytes || sourceSha256 !== asset.sha256) {
  throw new Error('The CC0 OCR source image does not match its registered size and SHA-256.');
}
const metadataBytes = await readFile(resolve(cc0Directory, asset.metadataSnapshot));
if (sha256(metadataBytes) !== asset.metadataSnapshotSha256) {
  throw new Error('The CC0 OCR metadata snapshot does not match its registered SHA-256.');
}
const metadata = JSON.parse(metadataBytes.toString('utf8'));
const imageInfo = Object.values(metadata.query?.pages ?? {})[0]?.imageinfo?.[0];
if (
  imageInfo?.extmetadata?.LicenseShortName?.value !== 'CC0' ||
  imageInfo?.sha1?.toLowerCase() !== asset.sourceSha1 ||
  Number(imageInfo?.size) !== asset.sizeBytes ||
  imageInfo?.width !== asset.dimensions.width ||
  imageInfo?.height !== asset.dimensions.height ||
  sourceSha1 !== asset.sourceSha1 ||
  new URL(imageInfo.url).pathname !== new URL(asset.sourceUrl).pathname
) {
  throw new Error('The CC0 OCR metadata snapshot does not verify this source image.');
}

const sample = asset.ocrSample;
await ensureOcrTessdata([sample.language]);
const appRequire = createRequire(resolve(appDirectory, 'package.json'));
const { createServer } = await import(pathToFileURL(appRequire.resolve('vite')).href);
const rootRequire = createRequire(resolve(repositoryDirectory, 'package.json'));
const { chromium } = rootRequire('@playwright/test');
process.chdir(appDirectory);

let server;
let browser;
try {
  server = await createServer({
    configFile: resolve(appDirectory, 'vite.config.ts'),
    root: appDirectory,
    plugins: [
      {
        name: 'cc0-ocr-smoke-page',
        enforce: 'pre',
        configureServer(viteServer) {
          viteServer.middlewares.use('/__cc0-ocr-smoke.html', (_request, response) => {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(
              '<!doctype html><html><head><meta charset="utf-8"><title>CC0 OCR smoke</title></head><body></body></html>',
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
  const requests = [];
  const externalOrigins = new Set();
  const pageErrors = [];
  page.on('request', (request) => {
    requests.push({ url: request.url(), method: request.method() });
    if (new URL(request.url()).origin !== new URL(origin).origin) {
      externalOrigins.add(new URL(request.url()).origin);
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(new URL('/__cc0-ocr-smoke.html', origin).href, {
    waitUntil: 'domcontentloaded',
  });
  const sourceUrl = new URL(`/@fs/${encodeURI(engineSource.replaceAll('\\', '/'))}`, origin).href;
  const measured = await page.evaluate(
    async ({ sourceUrl, sample, sourceBase64, sourceDimensions }) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${sourceBase64}`;
      await image.decode();
      if (
        image.naturalWidth !== sourceDimensions.width ||
        image.naturalHeight !== sourceDimensions.height
      ) {
        throw new Error('Browser-decoded OCR source dimensions do not match the manifest.');
      }
      const { x, y, width, height } = sample.crop;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.drawImage(image, x, y, width, height, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const inputSha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', imageData.data)),
      )
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const startedAt = performance.now();
      const { createOcrWorker } = await import(sourceUrl);
      const worker = createOcrWorker();
      const progress = [];
      const jobId = 'cc0-ocr-english';
      const output = await new Promise((resolve) => {
        const timeout = setTimeout(
          () => resolve({ type: 'timeout', error: 'CC0 OCR did not finish in 180 seconds.' }),
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
          imageData: { width, height, data: imageData.data },
          options: { language: sample.language },
        });
      });
      worker.terminate();
      return {
        // Includes worker startup, same-origin selected-model loading, and OCR;
        // source decode, crop, and RGBA hashing are outside this interval.
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        inputSha256,
        width,
        height,
        output,
        progress,
      };
    },
    {
      sourceUrl,
      sample,
      sourceBase64: sourceBytes.toString('base64'),
      sourceDimensions: asset.dimensions,
    },
  );

  const recognized = measured.output?.result?.text ?? '';
  const result = {
    generatedAt: new Date().toISOString(),
    environment: {
      browser: `Chromium ${browser.version()}`,
      server: 'Local Vite test server',
      runtimeRequests: requests.map(({ url, method }) => {
        return { url: reportRequestUrl(url, new URL(origin).origin), method };
      }),
      runtimeExternalOrigins: [...externalOrigins],
      pageErrors,
    },
    source: {
      id: asset.id,
      sourcePageUrl: asset.sourcePageUrl,
      sourceBytes: sourceBytes.byteLength,
      sourceSha1,
      sourceSha256,
      sourceMetadataSha256: sha256(metadataBytes),
      license: asset.license,
    },
    measurement: {
      language: sample.language,
      groundTruth: sample.groundTruth,
      crop: sample.crop,
      cropMethod: sample.cropMethod,
      dimensions: { width: measured.width, height: measured.height },
      durationMs: measured.durationMs,
      rgbaSha256: measured.inputSha256,
      output:
        measured.output?.type === 'ocr-result'
          ? {
              type: measured.output.type,
              language: measured.output.result.language,
              text: recognized,
              confidence: measured.output.result.confidence,
            }
          : {
              type: measured.output?.type ?? 'missing-output',
              error: measured.output?.error ?? 'No OCR result was returned.',
            },
      exactMatch:
        measured.output?.type === 'ocr-result' &&
        normalized(sample.groundTruth) === normalized(recognized),
      characterErrorRate:
        measured.output?.type === 'ocr-result'
          ? characterErrorRate(sample.groundTruth, recognized)
          : null,
      progress: measured.progress,
    },
    metric:
      'Unicode-codepoint edit distance after NFC normalization and whitespace collapse; exact match uses the same normalization.',
    limitation:
      'One manually transcribed English printed paragraph from one CC0 test page; not a representative estimate of Tesseract accuracy across languages, layouts, handwriting, or camera captures.',
  };
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.measurement.output.type !== 'ocr-result') {
    throw new Error(`CC0 OCR measurement failed: ${result.measurement.output.error}`);
  }
} finally {
  await browser?.close();
  await server?.close();
}
