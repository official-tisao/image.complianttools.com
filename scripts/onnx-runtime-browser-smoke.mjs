#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRequire = createRequire(path.join(repoRoot, 'apps/web/package.json'));
const engineRequire = createRequire(path.join(repoRoot, 'packages/engine/package.json'));
const variants = {
  x2plus: {
    scale: 2,
    inputChannels: 3,
    outputChannels: 3,
    smokeInputHeight: 8,
    smokeInputWidth: 12,
    filename: 'RealESRGAN_x2plus.onnx',
    sizeBytes: 67_076_002,
    sha256: '472e38432b5d27aaa238ca9ceebc6491a82923c67076e3dc770ab2219861ad18',
  },
  x4plus: {
    scale: 4,
    inputChannels: 3,
    outputChannels: 3,
    smokeInputHeight: 8,
    smokeInputWidth: 12,
    filename: 'RealESRGAN_x4plus.onnx',
    sizeBytes: 67_051_647,
    sha256: '890dbcfb92e7fee06ab00d16daa15f98ca3b57e3145d068d2eacfc4625a57d73',
  },
  'subpixel-cnn-x3': {
    scale: 3,
    inputChannels: 1,
    outputChannels: 1,
    smokeInputHeight: 224,
    smokeInputWidth: 224,
    filename: 'super-resolution-10.onnx',
    sizeBytes: 240_078,
    sha256: '85f36ff88cc504a24af5e0602148bc56a8aa09a58eca8c0da2756f3e8186035e',
  },
  'swin2sr-x4-q4f16': {
    scale: 4,
    inputChannels: 3,
    outputChannels: 3,
    smokeInputHeight: 64,
    smokeInputWidth: 64,
    filename: 'model_q4f16.onnx',
    sizeBytes: 15_249_949,
    sha256: '94561159849a4d3145daf15d2a54dd6ef7cbd9cf7b9e99525d78a494f9556d0d',
  },
};

const variantName = process.argv[2] ?? 'x2plus';
const variant = variants[variantName];
if (!variant)
  throw new Error(
    'Usage: node scripts/onnx-runtime-browser-smoke.mjs <x2plus|x4plus|subpixel-cnn-x3|swin2sr-x4-q4f16> [model.onnx] [input.png]',
  );

const modelPath = path.resolve(
  process.argv[3] ?? path.join(os.tmpdir(), 'image-complianttools-t32-onnx', variant.filename),
);
const modelData = await readFile(modelPath);
const fixturePath = process.argv[4] ? path.resolve(process.argv[4]) : undefined;
const fixtureData = fixturePath ? await readFile(fixturePath) : undefined;
const modelHash = createHash('sha256').update(modelData).digest('hex');
if (modelData.byteLength !== variant.sizeBytes || modelHash !== variant.sha256) {
  throw new Error(
    `${modelPath} does not match the registered ${variantName} conversion: ` +
      `${modelData.byteLength} bytes, SHA-256 ${modelHash}`,
  );
}

const runtimeEntry = engineRequire.resolve('onnxruntime-web/wasm');
const wasmDist = path.dirname(runtimeEntry);
const { chromium } = appRequire('@playwright/test');
const { createServer } = await import(pathToFileURL(appRequire.resolve('vite')).href);
const harnessDir = await mkdtemp(
  path.join(repoRoot, 'packages/engine', `.onnx-browser-smoke-${variantName}-`),
);

const html = `<!doctype html><html><body><pre id="result">running</pre><script type="module" src="/main.ts"></script></body></html>`;
const mainTs = `
import * as ort from 'onnxruntime-web/wasm';

declare global { interface Window { __smokeResult?: Record<string, unknown> } }
const startedAt = performance.now();
const fixtureBase64 = ${JSON.stringify(fixtureData?.toString('base64') ?? '')};
let inputShape = [1, ${variant.inputChannels}, ${variant.smokeInputHeight}, ${variant.smokeInputWidth}];
let values = new Float32Array(${variant.inputChannels} * ${variant.smokeInputHeight} * ${variant.smokeInputWidth});
if (fixtureBase64) {
  const binary = atob(fixtureBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D context unavailable for benchmark fixture.');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixelCount = canvas.width * canvas.height;
  inputShape = [1, 3, canvas.height, canvas.width];
  values = new Float32Array(3 * pixelCount);
  for (let index = 0; index < pixelCount; index++) {
    values[index] = pixels[index * 4] / 255;
    values[pixelCount + index] = pixels[index * 4 + 1] / 255;
    values[2 * pixelCount + index] = pixels[index * 4 + 2] / 255;
  }
} else {
  for (let i = 0; i < values.length; i++) values[i] = ((i * 37) % 257) / 256;
}
try {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = location.origin + '/__ort_assets__/';
  const session = await ort.InferenceSession.create('/model.onnx', {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  const feed = new ort.Tensor('float32', values, inputShape);
  const outputs = await session.run({ [session.inputNames[0]]: feed });
  const output = outputs[session.outputNames[0]];
  const data = output.data as Float32Array;
  let finiteCount = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of data) {
    if (Number.isFinite(value)) finiteCount++;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  await session.release();
  window.__smokeResult = {
    ok: true,
    provider: 'wasm',
    inputShape,
    outputShape: output.dims,
    outputLength: data.length,
    finiteCount,
    min,
    max,
    inferenceMs: performance.now() - startedAt,
  };
} catch (error) {
  window.__smokeResult = { ok: false, error: String(error), stack: error instanceof Error ? error.stack : undefined };
}
document.querySelector('#result').textContent = JSON.stringify(window.__smokeResult);
`;

let server;
let browser;
const report = {
  variant: variantName,
  modelPath,
  modelBytes: modelData.byteLength,
  modelSha256: modelHash,
  ...(fixturePath ? { inputFixturePath: fixturePath, inputFixtureSha256: createHash('sha256').update(fixtureData).digest('hex') } : {}),
  modelRequests: [],
  wasmRequests: [],
  externalRequests: [],
  failedRequests: [],
  httpErrors: [],
};

try {
  await writeFile(path.join(harnessDir, 'index.html'), html);
  await writeFile(path.join(harnessDir, 'main.ts'), mainTs);
  server = await createServer({
    configFile: false,
    root: harnessDir,
    appType: 'mpa',
    resolve: { alias: [{ find: 'onnxruntime-web/wasm', replacement: runtimeEntry }] },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: true,
      fs: { allow: [repoRoot] },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string')
    throw new Error('Vite did not expose its local server port.');
  const origin = `http://127.0.0.1:${address.port}`;
  report.origin = origin;

  browser = await chromium.launch({ headless: true });
  report.browser = `Chromium ${browser.version()}`;
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  page.on('request', (request) => {
    if (!request.url().startsWith(`${origin}/`)) report.externalRequests.push(request.url());
  });
  page.on('requestfailed', (request) => {
    report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      report.httpErrors.push({ url: response.url(), status: response.status() });
  });
  page.on('pageerror', (error) => {
    report.pageErrors ??= [];
    report.pageErrors.push(String(error));
  });

  await page.route(`${origin}/model.onnx`, async (route) => {
    report.modelRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: modelData });
  });
  await page.route(`${origin}/__ort_assets__/**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    const basename = path.basename(requestUrl.pathname);
    report.wasmRequests.push(requestUrl.href);
    try {
      const body = await readFile(path.join(wasmDist, basename));
      const contentType = basename.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
      await route.fulfill({ status: 200, contentType, body });
    } catch {
      await route.fulfill({ status: 404, body: `Missing local ORT runtime asset: ${basename}` });
    }
  });
  await page.route(`${origin}/favicon.ico`, (route) => route.fulfill({ status: 204, body: '' }));

  const wallStartedAt = Date.now();
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__smokeResult), undefined, { timeout: 180_000 });
  report.wallMs = Date.now() - wallStartedAt;
  report.result = await page.evaluate(() => window.__smokeResult);

  const result = report.result;
  const outputShape = result?.outputShape;
  const inputShape = result?.inputShape;
  report.expectedShape = Array.isArray(inputShape)
    ? [1, variant.outputChannels, inputShape[2] * variant.scale, inputShape[3] * variant.scale]
    : [1, variant.outputChannels, variant.smokeInputHeight * variant.scale, variant.smokeInputWidth * variant.scale];
  const shapeMatches = JSON.stringify(outputShape) === JSON.stringify(report.expectedShape);
  report.modelAndWasmSameOrigin =
    [...report.modelRequests, ...report.wasmRequests].length > 0 &&
    [...report.modelRequests, ...report.wasmRequests].every(
      (url) => new URL(url).origin === origin,
    );
  const smokePassed =
    result?.ok === true &&
    result.provider === 'wasm' &&
    shapeMatches &&
    result.finiteCount === result.outputLength &&
    report.modelRequests.length > 0 &&
    report.wasmRequests.length > 0 &&
    report.modelAndWasmSameOrigin &&
    report.externalRequests.length === 0 &&
    report.failedRequests.length === 0 &&
    report.httpErrors.length === 0 &&
    (report.pageErrors?.length ?? 0) === 0;
  report.passed = smokePassed;
  console.log(JSON.stringify(report, null, 2));
  if (!smokePassed) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(harnessDir, { recursive: true, force: true });
}
