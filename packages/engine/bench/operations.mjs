import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { URL } from 'node:url';

import { init as initAvifEncoder } from '@jsquash/avif/encode.js';
import { init as initJpegDecoder } from '@jsquash/jpeg/decode.js';
import { init as initJpegEncoder } from '@jsquash/jpeg/encode.js';
import { init as initWebpEncoder } from '@jsquash/webp/encode.js';

import {
  createProxy,
  createRaster,
  decodeJpegToRaster,
  encodeRasterAsJpeg,
  encodeRasterAsWebp,
  resizeRaster,
  ResizeOptionsSchema,
  searchTargetSize,
} from '../dist/index.js';
import { encodeRasterAsAvif } from '../dist/codecs/third-party/avif-encode.js';

const width = 4000;
const height = 3000;
const sampleCount = 3;
const operationFilter = process.argv
  .find((argument) => argument.startsWith('--operation='))
  ?.slice('--operation='.length);

async function wasm(relativePath) {
  return globalThis.WebAssembly.compile(await readFile(new URL(relativePath, import.meta.url)));
}

await Promise.all([
  initJpegDecoder(await wasm('../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')),
  initJpegEncoder(await wasm('../node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm')),
  initWebpEncoder(await wasm('../node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm')),
  initAvifEncoder(await wasm('../node_modules/@jsquash/avif/codec/enc/avif_enc.wasm')),
]);

const pixels = new Uint8ClampedArray(width * height * 4);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    pixels[offset] = (x * 13 + y * 3) & 255;
    pixels[offset + 1] = (x * 5 + y * 11) & 255;
    pixels[offset + 2] = (x * 7 + y * 17) & 255;
    pixels[offset + 3] = 255;
  }
}
const raster = createRaster(width, height, pixels);
const jpegFixture = await encodeRasterAsJpeg(raster, { quality: 90, progressive: false });
const resizeOptions = ResizeOptionsSchema.parse({
  mode: 'pixels',
  width: 1920,
  algorithm: 'lanczos3',
  allowUpscale: false,
});

function percentile95(samples) {
  return [...samples].sort((left, right) => left - right)[Math.ceil(samples.length * 0.95) - 1];
}

async function measure(operation, budgetMs, callback, count = sampleCount) {
  if (operationFilter && !operation.includes(operationFilter)) return undefined;
  if (count > 1) await callback();
  const samples = [];
  for (let iteration = 0; iteration < count; iteration += 1) {
    const started = performance.now();
    await callback();
    samples.push(performance.now() - started);
  }
  const p95Ms = percentile95(samples);
  const result = {
    operation,
    input: `${width}x${height}`,
    samples: samples.map((sample) => Number(sample.toFixed(1))),
    p95Ms: Number(p95Ms.toFixed(1)),
    budgetMs,
    passed: p95Ms <= budgetMs,
  };
  process.stderr.write(`${operation}: ${result.p95Ms}/${budgetMs} ms\n`);
  return result;
}

const results = [];
results.push(
  await measure('decode-jpeg-and-generate-proxy', 400, async () => {
    createProxy(await decodeJpegToRaster(jpegFixture), 4);
  }),
);
results.push(
  await measure('resize-lanczos3-to-1920', 250, () => resizeRaster(raster, resizeOptions)),
);
results.push(
  await measure('encode-jpeg-q82', 700, () =>
    encodeRasterAsJpeg(raster, { quality: 82, progressive: false }),
  ),
);
results.push(
  await measure('encode-webp-q80', 900, () => encodeRasterAsWebp(raster, { quality: 80 })),
);
results.push(
  await measure(
    'encode-avif-speed-6',
    4000,
    () => encodeRasterAsAvif(raster, { quality: 50, speed: 6 }),
    1,
  ),
);
let attempts = 0;
results.push(
  await measure(
    'target-size-search-8-iterations',
    4000,
    async () => {
      attempts = 0;
      await searchTargetSize(
        1,
        (quality) => encodeRasterAsJpeg(raster, { quality, progressive: false }),
        {
          strategy: 'quality',
          onAttempt: () => {
            attempts += 1;
          },
        },
      );
      if (attempts !== 8) throw new Error(`Expected 8 target-size attempts, observed ${attempts}.`);
    },
    1,
  ),
);

const report = {
  corpus: 'deterministic-rgba-gradient',
  width,
  height,
  megapixels: (width * height) / 1_000_000,
  results: results.filter(Boolean),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

const failed = results.filter((result) => result && !result.passed);
if (failed.length > 0) {
  throw new Error(
    `Operation latency budgets failed: ${failed.map(({ operation, p95Ms, budgetMs }) => `${operation} ${p95Ms}/${budgetMs} ms`).join(', ')}`,
  );
}
