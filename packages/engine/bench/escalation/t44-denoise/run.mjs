#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { init as initPngDecoder } from '@jsquash/png/decode.js';
import { init as initPngEncoder } from '@jsquash/png/encode.js';
import { applyDenoise, decodePngToRaster, encodeRasterAsPng } from '../../../dist/index.js';

const directory = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(directory, 'fixtures/manifest.json');
const artifactDirectory = join(directory, 'artifacts');
const resultsPath = join(directory, 'results.json');
const methods = [
  { id: 'median', strength: 50 },
  { id: 'bilateral', strength: 50 },
];
const warmupCount = 2;
const measuredCount = 8;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const asArrayBuffer = (bytes) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

async function initializeCodecs() {
  await Promise.all([
    initPngDecoder(
      await WebAssembly.compile(
        await readFile(new URL('../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url)),
      ),
    ),
    initPngEncoder(
      await WebAssembly.compile(
        await readFile(new URL('../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url)),
      ),
    ),
  ]);
}

function percentileNearestRank(values, p) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}

function round(value, places = 6) {
  return Number(value.toFixed(places));
}

function grayscale(data, pixels) {
  const output = new Float64Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    output[pixel] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }
  return output;
}

function compare(reference, actual) {
  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error('Output raster dimensions changed during denoise.');
  }
  const width = reference.width;
  const height = reference.height;
  const expected = reference.frames[0].data;
  const received = actual.frames[0].data;
  let squaredError = 0;
  for (let offset = 0; offset < expected.length; offset += 4) {
    if (expected[offset + 3] !== received[offset + 3]) {
      throw new Error('Denoise changed source alpha; RGB metrics would not describe the same pixels.');
    }
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = expected[offset + channel] - received[offset + channel];
      squaredError += delta * delta;
    }
  }
  const mse = squaredError / (width * height * 3);
  const psnr = mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);

  const expectedGray = grayscale(expected, width * height);
  const receivedGray = grayscale(received, width * height);
  const radius = 3;
  const sigma = 1.2;
  const window = [];
  let weightSum = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const weight = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      window.push({ dx, dy, weight });
      weightSum += weight;
    }
  }
  for (const item of window) item.weight /= weightSum;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let ssimTotal = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let meanExpected = 0;
      let meanReceived = 0;
      let secondExpected = 0;
      let secondReceived = 0;
      let cross = 0;
      for (const sample of window) {
        const sx = Math.max(0, Math.min(width - 1, x + sample.dx));
        const sy = Math.max(0, Math.min(height - 1, y + sample.dy));
        const index = sy * width + sx;
        const left = expectedGray[index];
        const right = receivedGray[index];
        meanExpected += sample.weight * left;
        meanReceived += sample.weight * right;
        secondExpected += sample.weight * left * left;
        secondReceived += sample.weight * right * right;
        cross += sample.weight * left * right;
      }
      const varianceExpected = Math.max(0, secondExpected - meanExpected * meanExpected);
      const varianceReceived = Math.max(0, secondReceived - meanReceived * meanReceived);
      const covariance = cross - meanExpected * meanReceived;
      ssimTotal +=
        ((2 * meanExpected * meanReceived + c1) * (2 * covariance + c2)) /
        ((meanExpected * meanExpected + meanReceived * meanReceived + c1) *
          (varianceExpected + varianceReceived + c2));
    }
  }
  return {
    psnrRgbDb: Number.isFinite(psnr) ? round(psnr, 4) : 'infinity',
    ssimRec601Gaussian7x7: round(ssimTotal / (width * height), 6),
  };
}

async function decodeRegisteredPng(entry) {
  const path = join(directory, entry.path.replace(/^fixtures\//, 'fixtures/'));
  const encoded = await readFile(path);
  if (encoded.byteLength !== entry.pngBytes || sha256(encoded) !== entry.pngSha256) {
    throw new Error('PNG file size/hash mismatch: ' + entry.path);
  }
  const raster = await decodePngToRaster(asArrayBuffer(encoded));
  if (
    raster.width !== entry.width ||
    raster.height !== entry.height ||
    sha256(raster.frames[0].data) !== entry.rgbaSha256
  ) {
    throw new Error('Decoded PNG dimensions/RGBA hash mismatch: ' + entry.path);
  }
  return raster;
}

async function saveOutput(id, method, image) {
  const encoded = new Uint8Array(await encodeRasterAsPng(image));
  const filename = id + '-' + method + '.png';
  await writeFile(join(artifactDirectory, filename), encoded);
  return {
    path: 'artifacts/' + filename,
    width: image.width,
    height: image.height,
    pngBytes: encoded.byteLength,
    pngSha256: sha256(encoded),
    rgbaSha256: sha256(image.frames[0].data),
  };
}

function assertSupportedMethodContract(input) {
  for (const method of methods) {
    const output = applyDenoise(input, method.id, method.strength);
    if (output.width !== input.width || output.height !== input.height) {
      throw new Error('Supported denoise method returned unexpected dimensions: ' + method.id);
    }
  }
  let rejectedNlm = false;
  try {
    applyDenoise(input, 'nlm', 50);
  } catch (error) {
    rejectedNlm = String(error).includes('Only') && String(error).includes('median') && String(error).includes('bilateral');
  }
  if (!rejectedNlm) throw new Error('Expected the production API to reject unsupported NLM.');
}

await initializeCodecs();
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.fixtures?.count !== 12 || manifest.fixtures.entries.length !== 12) {
  throw new Error('Expected the checked-in 12-case T44 fixture manifest.');
}
await mkdir(artifactDirectory, { recursive: true });

const firstInput = await decodeRegisteredPng(manifest.fixtures.entries[0].input);
assertSupportedMethodContract(firstInput);

const fixtures = [];
for (const fixture of manifest.fixtures.entries) {
  const reference = await decodeRegisteredPng(fixture.reference);
  const input = await decodeRegisteredPng(fixture.input);
  const noisyInputMetrics = compare(reference, input);
  const methodRows = [];

  for (const method of methods) {
    for (let iteration = 0; iteration < warmupCount; iteration += 1) {
      applyDenoise(input, method.id, method.strength);
    }
    const samplesMs = [];
    let output;
    for (let iteration = 0; iteration < measuredCount; iteration += 1) {
      const started = performance.now();
      const next = applyDenoise(input, method.id, method.strength);
      samplesMs.push(performance.now() - started);
      if (output && !output.frames[0].data.every((value, index) => value === next.frames[0].data[index])) {
        throw new Error('Repeated calls produced non-deterministic output for ' + fixture.id + '/' + method.id);
      }
      output = next;
    }
    const metrics = compare(reference, output);
    const latency = {
      warmupRuns: warmupCount,
      measuredRuns: measuredCount,
      samplesMs: samplesMs.map((value) => round(value, 3)),
      medianMs: round(percentileNearestRank(samplesMs, 0.5), 3),
      p95Ms: round(percentileNearestRank(samplesMs, 0.95), 3),
    };
    methodRows.push({
      method: method.id,
      options: { strength: method.strength },
      output: await saveOutput(fixture.id, method.id, output),
      metrics,
      latency,
    });
  }

  fixtures.push({
    id: fixture.id,
    sourceId: fixture.sourceId,
    source: manifest.sources.find((source) => source.id === fixture.sourceId),
    noise: fixture.noise,
    dimensions: { width: reference.width, height: reference.height },
    derivation: fixture.derivation,
    reference: fixture.reference,
    noisyInput: fixture.input,
    noisyInputMetrics,
    methods: methodRows,
  });
}

const byNoise = [];
for (const noiseId of [...new Set(manifest.fixtures.entries.map((fixture) => fixture.noise.id))]) {
  for (const method of methods) {
    const noiseFixtures = fixtures.filter((fixture) => fixture.noise.id === noiseId);
    const rows = noiseFixtures.map((fixture) => ({
        noisyInput: fixture.noisyInputMetrics,
        result: fixture.methods.find((row) => row.method === method.id).metrics,
      }));
    const noiseTimings = noiseFixtures.flatMap((fixture) =>
      fixture.methods.find((row) => row.method === method.id).latency.samplesMs,
    );
    byNoise.push({
      noiseId,
      method: method.id,
      fixtureCount: rows.length,
      meanNoisyInputPsnrRgbDb: round(
        rows.reduce((sum, row) => sum + Number(row.noisyInput.psnrRgbDb), 0) / rows.length,
        4,
      ),
      meanPsnrRgbDb: round(rows.reduce((sum, row) => sum + Number(row.result.psnrRgbDb), 0) / rows.length, 4),
      meanPsnrChangeDb: round(
        rows.reduce((sum, row) => sum + Number(row.result.psnrRgbDb) - Number(row.noisyInput.psnrRgbDb), 0) /
          rows.length,
        4,
      ),
      meanNoisyInputSsim: round(
        rows.reduce((sum, row) => sum + row.noisyInput.ssimRec601Gaussian7x7, 0) / rows.length,
        6,
      ),
      meanSsimRec601Gaussian7x7: round(
        rows.reduce((sum, row) => sum + row.result.ssimRec601Gaussian7x7, 0) / rows.length,
        6,
      ),
      meanSsimChange: round(
        rows.reduce(
          (sum, row) => sum + row.result.ssimRec601Gaussian7x7 - row.noisyInput.ssimRec601Gaussian7x7,
          0,
        ) / rows.length,
        6,
      ),
      medianLatencyMs: round(percentileNearestRank(noiseTimings, 0.5), 3),
      p95LatencyMs: round(percentileNearestRank(noiseTimings, 0.95), 3),
    });
  }
}

const result = {
  schemaVersion: 1,
  benchmark: 'P4-21 T44 production denoise API comparison on deterministic synthetic corruption of registered CC0 image crops',
  fixtureManifest: 'fixtures/manifest.json',
  supportedProductionMethods: ['median', 'bilateral'],
  unsupportedMethodCheck: { method: 'nlm', result: 'rejected with documented production error' },
  timing: {
    warmupRunsPerCaseAndMethod: warmupCount,
    measuredRunsPerCaseAndMethod: measuredCount,
    scope: 'applyDenoise call only; excludes decode, fixture generation, metric calculation, and PNG encoding',
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      operatingSystem: os.type() + ' ' + os.release(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      logicalCpuCount: os.cpus().length,
    },
  },
  metricDefinitions: {
    psnrRgbDb: 'Full-image RGB PSNR against the exact clean derived fixture; alpha excluded.',
    ssimRec601Gaussian7x7: 'Mean local SSIM on Rec.601 luminance with a normalized 7x7 Gaussian window, sigma 1.2, and edge replication.',
  },
  aggregation: byNoise,
  fixtureResults: fixtures,
};
await writeFile(resultsPath, JSON.stringify(result, null, 2) + '\n');
process.stdout.write('T44_BENCHMARK_OK ' + fixtures.length + ' cases; ' + methods.length + ' methods; results at ' + resultsPath + '\n');
