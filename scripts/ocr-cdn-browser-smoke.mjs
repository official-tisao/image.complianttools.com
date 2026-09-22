import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDirectory = resolve(repositoryDirectory, 'apps/web');
const engineSource = resolve(repositoryDirectory, 'packages/engine/src/ocr.ts');
const tessdataDirectory = resolve(appDirectory, 'static/tessdata');
const modelId = process.argv[2] ?? 'script/Arabic';
if (!/^script\/[A-Za-z0-9_-]+$/.test(modelId)) {
  throw new Error('Pass a registered script model ID such as script/Arabic or script/Latin.');
}
const modelPath = `apps/web/static/tessdata/${modelId}.traineddata`;
const records = JSON.parse(
  await readFile(resolve(repositoryDirectory, 'docs/static-assets.json'), 'utf8'),
);
const modelRecord = records.find((record) => record.path === modelPath);
if (!modelRecord?.deliveryUrl || modelRecord.delivery !== 'lazy-cdn') {
  throw new Error(`${modelId} lacks its pinned lazy-CDN register entry.`);
}
if (existsSync(resolve(tessdataDirectory, `${modelId}.traineddata`))) {
  throw new Error(
    `Remove the ignored ${modelId} cache first so this smoke exercises remote model delivery.`,
  );
}
const expectedModelUrl =
  modelId === 'script/Latin' ? modelRecord.sourceUrl : modelRecord.deliveryUrl;

async function verifyRegisteredSource(url, expectedSize, expectedSha256) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Pinned model source returned HTTP ${response.status}.`);
  }
  const hash = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of response.body) {
    sizeBytes += chunk.byteLength;
    hash.update(chunk);
  }
  const sha256 = hash.digest('hex');
  if (sizeBytes !== expectedSize || sha256 !== expectedSha256) {
    throw new Error(
      `Pinned model source failed its register check: expected ${expectedSize} bytes / ${expectedSha256}; got ${sizeBytes} bytes / ${sha256}.`,
    );
  }
  return { sizeBytes, sha256 };
}

const appRequire = createRequire(resolve(appDirectory, 'package.json'));
const { createServer } = await import(pathToFileURL(appRequire.resolve('vite')).href);
const rootRequire = createRequire(resolve(repositoryDirectory, 'package.json'));
const playwrightRequire = createRequire(rootRequire.resolve('@playwright/test'));
const { chromium } = playwrightRequire('playwright');

let server;
let browser;
try {
  process.chdir(appDirectory);
  server = await createServer({
    configFile: resolve(appDirectory, 'vite.config.ts'),
    root: appDirectory,
    plugins: [
      {
        name: 'ocr-cdn-smoke-page',
        enforce: 'pre',
        configureServer(viteServer) {
          viteServer.middlewares.use('/__ocr-cdn-smoke.html', (_request, response) => {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(
              '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
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
  const context = await browser.newContext();
  const page = await context.newPage();
  const remoteRequests = [];
  let modelResponse;
  const pageErrors = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(origin).origin) {
      remoteRequests.push({ url: url.href, method: request.method() });
    }
  });
  context.on('response', (response) => {
    if (response.url() === expectedModelUrl) modelResponse = response;
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(new URL('/__ocr-cdn-smoke.html', origin).href, {
    waitUntil: 'domcontentloaded',
  });
  const sourceUrl = new URL(`/@fs/${encodeURI(engineSource.replaceAll('\\', '/'))}`, origin).href;
  let result;
  try {
    result = await page.evaluate(
      async ({ moduleUrl, selectedModel }) => {
        const { createOcrWorker } = await import(moduleUrl);
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 140;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context is unavailable.');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#111';
        context.font = '48px Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('sample 123', canvas.width / 2, canvas.height / 2);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const worker = createOcrWorker();
        try {
          return await new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error(`${selectedModel} remote model smoke timed out.`)),
              300_000,
            );
            worker.addEventListener('message', ({ data }) => {
              if (data.jobId !== 'ocr-cdn-smoke' || data.type === 'ocr-progress') return;
              clearTimeout(timeout);
              if (data.type === 'ocr-error') reject(new Error(data.error));
              else resolve({ type: data.type, text: data.result?.text ?? '' });
            });
            worker.postMessage({
              type: 'ocr',
              jobId: 'ocr-cdn-smoke',
              imageData: { width: image.width, height: image.height, data: image.data },
              options: { mode: 'script', script: selectedModel },
            });
          });
        } finally {
          worker.terminate();
        }
      },
      { moduleUrl: sourceUrl, selectedModel: modelId },
    );
  } catch (error) {
    console.error(
      `Browser CDN smoke diagnostics: ${JSON.stringify({
        remoteRequests,
        modelResponse: modelResponse
          ? { status: modelResponse.status(), headers: modelResponse.headers() }
          : null,
        pageErrors,
      })}`,
    );
    throw error;
  }

  const expectedSize = modelRecord.sizeBytes;
  const expectedSha256 = modelRecord.sha256;
  if (!modelResponse) throw new Error(`The browser did not request the pinned ${modelId} URL.`);
  const sourceIntegrity = await verifyRegisteredSource(
    expectedModelUrl,
    expectedSize,
    expectedSha256,
  );
  const response = {
    status: modelResponse.status(),
    contentType: modelResponse.headers()['content-type'],
    allowOrigin: modelResponse.headers()['access-control-allow-origin'],
    resourcePolicy: modelResponse.headers()['cross-origin-resource-policy'],
    contentEncoding: modelResponse.headers()['content-encoding'] ?? '',
    contentLength: Number(modelResponse.headers()['content-length']),
    sizeBytes: sourceIntegrity.sizeBytes,
    sha256: sourceIntegrity.sha256,
  };
  const browserContentLengthMatches = response.contentEncoding
    ? Number.isSafeInteger(response.contentLength) && response.contentLength > 0
    : response.contentLength === expectedSize;
  if (
    result.type !== 'ocr-result' ||
    response?.status !== 200 ||
    response.contentType !== 'application/octet-stream' ||
    response.allowOrigin !== '*' ||
    response.resourcePolicy !== 'cross-origin' ||
    !browserContentLengthMatches ||
    response.sizeBytes !== expectedSize ||
    response.sha256 !== expectedSha256 ||
    remoteRequests.length !== 1 ||
    remoteRequests[0]?.url !== expectedModelUrl ||
    remoteRequests[0]?.method !== 'GET' ||
    pageErrors.length > 0
  ) {
    throw new Error(
      `OCR remote model smoke did not match the pinned asset expectations: ${JSON.stringify({ modelId, result, remoteRequests, response, pageErrors })}`,
    );
  }
  console.log(
    `OCR remote model browser smoke passed: ${modelPath}, ${response.sizeBytes} bytes, SHA-256 ${response.sha256}; only the pinned model binary was requested from its registered source.`,
  );
} finally {
  await browser?.close();
  await server?.close();
  process.chdir(repositoryDirectory);
}
