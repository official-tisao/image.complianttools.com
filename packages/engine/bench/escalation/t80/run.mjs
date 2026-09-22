import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { init as initPngEncoder } from '@jsquash/png/encode.js';
import {
  createRaster,
  encodeRasterAsPng,
  histogramMatch,
  reinhardTransfer,
} from '../../../dist/index.js';

const directory = dirname(fileURLToPath(import.meta.url));
const artifactDirectory = join(directory, 'artifacts');
const reportPath = join(directory, 'results.json');
const measuredRuns = 9;

await initPngEncoder(
  await WebAssembly.compile(
    await readFile(join(directory, '../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm')),
  ),
);
await mkdir(artifactDirectory, { recursive: true });

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function makeImage(width, height, id, isReference) {
  const data = new Uint8ClampedArray(width * height * 4);
  const seed = id === 'blue-hour' ? 7 : id === 'muted-film' ? 23 : 41;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const phase = isReference ? seed * 3 : seed;
      const wave = ((x * 17 + y * 29 + x * y * 7 + phase) % 127) / 126;
      const cross = ((x * 31 + y * 11 + phase * 5) % 97) / 96;
      const texture = ((x * 13 + y * 19 + x * y + phase * 11) % 53) / 52;
      const offset = (y * width + x) * 4;
      if (isReference) {
        data[offset] = clamp(61 + 111 * wave + 13 * texture);
        data[offset + 1] = clamp(43 + 87 * cross + 17 * wave);
        data[offset + 2] = clamp(76 + 132 * texture - 21 * cross);
      } else {
        data[offset] = clamp(31 + 137 * cross + 18 * texture);
        data[offset + 1] = clamp(66 + 105 * wave - 11 * texture);
        data[offset + 2] = clamp(91 + 94 * cross + 22 * wave);
      }
      data[offset + 3] = 255;
    }
  }
  return createRaster(width, height, data);
}

function histogramDistance(left, right) {
  let sum = 0;
  for (let channel = 0; channel < 3; channel++) {
    const leftHistogram = new Uint32Array(256);
    const rightHistogram = new Uint32Array(256);
    for (let offset = 0; offset < left.frames[0].data.length; offset += 4)
      leftHistogram[left.frames[0].data[offset + channel]]++;
    for (let offset = 0; offset < right.frames[0].data.length; offset += 4)
      rightHistogram[right.frames[0].data[offset + channel]]++;

    let leftCdf = 0;
    let rightCdf = 0;
    for (let value = 0; value < 255; value++) {
      leftCdf += leftHistogram[value] / (left.width * left.height);
      rightCdf += rightHistogram[value] / (right.width * right.height);
      sum += Math.abs(leftCdf - rightCdf) / (3 * 255);
    }
  }
  return sum;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

async function saveArtifact(filename, image) {
  const bytes = new Uint8Array(await encodeRasterAsPng(image));
  await writeFile(join(artifactDirectory, filename), bytes);
  return {
    path: `artifacts/${filename}`,
    width: image.width,
    height: image.height,
    pngBytes: bytes.byteLength,
    pngSha256: sha256(bytes),
    rgbaSha256: sha256(image.frames[0].data),
  };
}

const cases = [
  { id: 'blue-hour', source: [31, 19], reference: [17, 29] },
  { id: 'muted-film', source: [23, 27], reference: [37, 15] },
  { id: 'warm-paper', source: [28, 16], reference: [15, 24] },
];

const reportCases = [];
for (const item of cases) {
  const source = makeImage(...item.source, item.id, false);
  const reference = makeImage(...item.reference, item.id, true);
  const methods = {
    unchanged: (image) => image,
    reinhard: (image) => reinhardTransfer(image, reference),
    histogram: (image) => histogramMatch(image, reference),
  };

  const artifacts = {
    source: await saveArtifact(`${item.id}-source.png`, source),
    reference: await saveArtifact(`${item.id}-reference.png`, reference),
  };
  const measurements = {};
  for (const [method, apply] of Object.entries(methods)) {
    const output = apply(source);
    const latencySamplesMs = [];
    for (let run = 0; run < measuredRuns; run++) {
      const started = performance.now();
      apply(source);
      latencySamplesMs.push(performance.now() - started);
    }
    measurements[method] = {
      meanRgbHistogramWasserstein: histogramDistance(output, reference),
      latencyMedianMs: percentile(latencySamplesMs, 0.5),
      latencyP95Ms: percentile(latencySamplesMs, 0.95),
      latencySamplesMs,
    };
    artifacts[method] = await saveArtifact(`${item.id}-${method}.png`, output);
  }

  reportCases.push({
    id: item.id,
    sourceDimensions: item.source,
    referenceDimensions: item.reference,
    sourcePixels: item.source[0] * item.source[1],
    referencePixels: item.reference[0] * item.reference[1],
    histogramMetric: 'Mean channel-wise normalized empirical-CDF distance (1D Wasserstein, divided by 255); lower is closer distributional alignment.',
    improvementVsUnchanged: Object.fromEntries(
      Object.entries(measurements).map(([method, result]) => [
        method,
        measurements.unchanged.meanRgbHistogramWasserstein - result.meanRgbHistogramWasserstein,
      ]),
    ),
    measurements,
    artifacts,
  });
}

const summary = Object.fromEntries(
  ['unchanged', 'reinhard', 'histogram'].map((method) => [
    method,
    {
      meanDistributionDistance:
        reportCases.reduce((sum, item) => sum + item.measurements[method].meanRgbHistogramWasserstein, 0) /
        reportCases.length,
      medianLatencyMs: percentile(
        reportCases.flatMap((item) => item.measurements[method].latencySamplesMs),
        0.5,
      ),
      p95LatencyMs: percentile(
        reportCases.flatMap((item) => item.measurements[method].latencySamplesMs),
        0.95,
      ),
    },
  ]),
);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runnerSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  environment: {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    fixtureMethod:
      'Deterministically generated RGB texture distributions; no third-party images or source pixels.',
    recipe: 'Three integer-coordinate modular texture recipes seeded by case ID; source and target use distinct channel transforms and different dimensions.',
    warmupRuns: 1,
    measuredRuns,
  },
  metricLimit: 'Distributional color similarity only. This does not measure semantic style quality, spatial preservation, or preference on photographs.',
  cases: reportCases,
  summary,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    report: reportPath,
    cases: reportCases.length,
    summary,
  }, null, 2),
);
