import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { init as initPngEncoder } from '@jsquash/png/encode.js';
import {
  encodeRasterAsPng,
  fbm,
  linearGradient,
  radialGradient,
  valueNoiseTexture,
  worleyNoise,
} from '../../../dist/index.js';

const directory = dirname(fileURLToPath(import.meta.url));
const artifactDirectory = join(directory, 'artifacts');
const reportPath = join(directory, 'results.json');
const warmupRuns = 1;
const measuredRuns = 7;

await initPngEncoder(
  await WebAssembly.compile(
    await readFile(join(directory, '../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm')),
  ),
);
await mkdir(artifactDirectory, { recursive: true });

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

const operations = [
  {
    id: 'value-noise',
    generate: (width, height, seed) => valueNoiseTexture({ width, height, seed, scale: 5 }),
  },
  { id: 'fbm', generate: (width, height, seed) => fbm({ width, height, seed, octaves: 4, scale: 5 }) },
  { id: 'worley', generate: (width, height, seed) => worleyNoise({ width, height, seed, points: 16 }) },
  { id: 'linear-gradient', generate: (width, height, seed) => linearGradient({ width, height, seed }) },
  { id: 'radial-gradient', generate: (width, height, seed) => radialGradient({ width, height, seed }) },
];
const dimensions = [128, 256, 512];
const seeds = [17, 42, 101];
const cases = [];

async function saveArtifact(filename, image) {
  const png = new Uint8Array(await encodeRasterAsPng(image));
  await writeFile(join(artifactDirectory, filename), png);
  return {
    path: `artifacts/${filename}`,
    width: image.width,
    height: image.height,
    pngBytes: png.byteLength,
    pngSha256: sha256(png),
    rgbaSha256: sha256(image.frames[0].data),
  };
}

for (const operation of operations) {
  for (const size of dimensions) {
    const seed = seeds[dimensions.indexOf(size)];
    const generate = () => operation.generate(size, size, seed);
    const reference = generate();
    const expectedHash = sha256(reference.frames[0].data);
    const expectedBytes = reference.frames[0].data.byteLength;
    if (reference.width !== size || reference.height !== size || expectedBytes !== size * size * 4)
      throw new Error(`${operation.id}/${size} returned unexpected image dimensions or byte length`);

    for (let index = 0; index < warmupRuns; index += 1) {
      const output = generate();
      if (sha256(output.frames[0].data) !== expectedHash)
        throw new Error(`${operation.id}/${size} changed pixels between deterministic runs`);
    }

    const latencySamplesMs = [];
    for (let index = 0; index < measuredRuns; index += 1) {
      const start = performance.now();
      const output = generate();
      latencySamplesMs.push(performance.now() - start);
      if (sha256(output.frames[0].data) !== expectedHash)
        throw new Error(`${operation.id}/${size} changed pixels during measured runs`);
    }

    const filename = `${operation.id}-${size}-seed-${seed}.png`;
    const artifact = await saveArtifact(filename, reference);
    cases.push({
      id: `${operation.id}-${size}-seed-${seed}`,
      operation: operation.id,
      seed,
      dimensions: { width: size, height: size },
      rawRgbaBytes: expectedBytes,
      deterministicWarmupRuns: warmupRuns,
      deterministicMeasuredRuns: measuredRuns,
      stableRgbaSha256AcrossRuns: expectedHash,
      latencyMs: {
        samples: latencySamplesMs,
        median: percentile(latencySamplesMs, 0.5),
        p95: percentile(latencySamplesMs, 0.95),
      },
      artifact,
    });
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runnerSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  environment: {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    corpus: 'Self-generated procedural outputs; no outside pixels or subjective reference targets.',
    warmupRuns,
    measuredRuns,
  },
  measurementScope:
    'Checks output dimensions, exact repeated-seed RGBA determinism, artifact integrity, and generation latency. It does not score visual quality or user preference.',
  summary: Object.fromEntries(
    operations.map((operation) => {
      const group = cases.filter((item) => item.operation === operation.id);
      const allLatencies = group.flatMap((item) => item.latencyMs.samples);
      return [
        operation.id,
        {
          cases: group.length,
          allSeedRunsDeterministic: group.every(
            (item) => item.deterministicWarmupRuns === warmupRuns && item.stableRgbaSha256AcrossRuns,
          ),
          medianLatencyMs: percentile(allLatencies, 0.5),
          p95LatencyMs: percentile(allLatencies, 0.95),
        },
      ];
    }),
  ),
  cases,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      report: reportPath,
      cases: cases.length,
      summary: report.summary,
    },
    null,
    2,
  ),
);
