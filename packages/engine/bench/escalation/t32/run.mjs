import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { init as initJpegDecoder } from '@jsquash/jpeg/decode.js';
import { init as initPngEncoder } from '@jsquash/png/encode.js';

import {
  createRaster,
  dcci,
  decodeJpegToRaster,
  encodeRasterAsPng,
  nedi,
  resizeRaster,
  ResizeOptionsSchema,
} from '../../../dist/index.js';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(directory, '..', 'fixtures', 'cc0');
const manifest = JSON.parse(await readFile(join(fixtureDirectory, 'manifest.json'), 'utf8'));
const outputPath = join(directory, 'results.json');
const artifactDirectory = join(directory, 'artifacts');
const maximumReferenceEdge = 256;
const warmupCount = 1;
const measuredCount = 3;

const decoderWasm = new URL('../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', import.meta.url);
await initJpegDecoder(await WebAssembly.compile(await readFile(decoderWasm)));
const pngEncoderWasm = new URL('../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url);
await initPngEncoder(await WebAssembly.compile(await readFile(pngEncoderWasm)));
await mkdir(artifactDirectory, { recursive: true });

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function savePngArtifact(filename, image) {
  if (Math.max(image.width, image.height) > maximumReferenceEdge)
    throw new Error(`Artifact ${filename} exceeds the ${maximumReferenceEdge}px long-edge limit.`);
  const bytes = new Uint8Array(await encodeRasterAsPng(image));
  const path = join(artifactDirectory, filename);
  await writeFile(path, bytes);
  return {
    path: `artifacts/${filename}`,
    width: image.width,
    height: image.height,
    pngSha256: sha256(bytes),
  };
}

function percentileNearestRank(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function evenAtLeastTwo(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function resize(image, width, height, algorithm) {
  return resizeRaster(
    image,
    ResizeOptionsSchema.parse({
      mode: 'pixels',
      width,
      height,
      lockAspect: false,
      algorithm,
      allowUpscale: true,
      roundTo: 1,
      maxPixels: 100_000_000,
    }),
  );
}

function psnr(reference, output) {
  if (reference.width !== output.width || reference.height !== output.height)
    throw new Error('PSNR inputs have different dimensions.');
  const a = reference.frames[0].data;
  const b = output.frames[0].data;
  let squaredError = 0;
  const channelCount = reference.width * reference.height * 3;
  for (let offset = 0; offset < a.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = a[offset + channel] - b[offset + channel];
      squaredError += difference * difference;
    }
  }
  const mse = squaredError / channelCount;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

function gaussianKernel(size = 11, sigma = 1.5) {
  const radius = Math.floor(size / 2);
  const weights = new Float64Array(size);
  let sum = 0;
  for (let index = 0; index < size; index += 1) {
    const distance = index - radius;
    const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
    weights[index] = weight;
    sum += weight;
  }
  for (let index = 0; index < size; index += 1) weights[index] /= sum;
  return { radius, weights };
}

function luminance(image) {
  const rgba = image.frames[0].data;
  const gray = new Float64Array(image.width * image.height);
  for (let pixel = 0; pixel < gray.length; pixel += 1) {
    const offset = pixel * 4;
    gray[pixel] = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
  }
  return gray;
}

function gaussianBlur(values, width, height, kernel) {
  const { radius, weights } = kernel;
  const horizontal = new Float64Array(values.length);
  const output = new Float64Array(values.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const sx = Math.max(0, Math.min(width - 1, x + dx));
        sum += values[y * width + sx] * weights[dx + radius];
      }
      horizontal[y * width + x] = sum;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const sy = Math.max(0, Math.min(height - 1, y + dy));
        sum += horizontal[sy * width + x] * weights[dy + radius];
      }
      output[y * width + x] = sum;
    }
  }
  return output;
}

function multiply(left, right) {
  const output = new Float64Array(left.length);
  for (let index = 0; index < output.length; index += 1) output[index] = left[index] * right[index];
  return output;
}

function ssim(reference, output) {
  if (reference.width !== output.width || reference.height !== output.height)
    throw new Error('SSIM inputs have different dimensions.');
  const width = reference.width;
  const height = reference.height;
  const a = luminance(reference);
  const b = luminance(output);
  const kernel = gaussianKernel();
  const meanA = gaussianBlur(a, width, height, kernel);
  const meanB = gaussianBlur(b, width, height, kernel);
  const meanA2 = gaussianBlur(multiply(a, a), width, height, kernel);
  const meanB2 = gaussianBlur(multiply(b, b), width, height, kernel);
  const meanAB = gaussianBlur(multiply(a, b), width, height, kernel);
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const varianceA = Math.max(0, meanA2[index] - meanA[index] * meanA[index]);
    const varianceB = Math.max(0, meanB2[index] - meanB[index] * meanB[index]);
    const covariance = meanAB[index] - meanA[index] * meanB[index];
    const numerator =
      (2 * meanA[index] * meanB[index] + c1) * (2 * covariance + c2);
    const denominator =
      (meanA[index] * meanA[index] + meanB[index] * meanB[index] + c1) *
      (varianceA + varianceB + c2);
    sum += numerator / denominator;
  }
  return sum / a.length;
}

function verifyMetrics() {
  const unchanged = createRaster(13, 13, new Uint8ClampedArray(13 * 13 * 4).fill(100));
  const oneLevelBrighter = createRaster(13, 13, new Uint8ClampedArray(13 * 13 * 4).fill(101));
  if (psnr(unchanged, unchanged) !== Infinity || Math.abs(ssim(unchanged, unchanged) - 1) > 1e-12)
    throw new Error('Metric sanity check failed for identical images.');
  const expectedOneLevelPsnr = 20 * Math.log10(255);
  if (Math.abs(psnr(unchanged, oneLevelBrighter) - expectedOneLevelPsnr) > 1e-10)
    throw new Error('PSNR sanity check failed for a uniform one-level difference.');
}

verifyMetrics();

const methods = [
  ['lanczos3', (image) => resize(image, image.width * 2, image.height * 2, 'lanczos3')],
  ['dcci-implementation', (image) => dcci(image, 2)],
  ['nedi-implementation', (image) => nedi(image, 2)],
];
const fixtures = [];
const samplesByMethod = new Map(methods.map(([name]) => [name, []]));

for (const asset of manifest.assets) {
  const encoded = new Uint8Array(await readFile(join(fixtureDirectory, asset.path)));
  const sourceHash = sha256(encoded);
  if (sourceHash !== asset.sha256)
    throw new Error(`Fixture hash mismatch for ${asset.id}: expected ${asset.sha256}, got ${sourceHash}.`);

  const decoded = await decodeJpegToRaster(
    encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
  );
  const scale = Math.min(1, maximumReferenceEdge / Math.max(decoded.width, decoded.height));
  const referenceWidth = evenAtLeastTwo(decoded.width * scale);
  const referenceHeight = evenAtLeastTwo(decoded.height * scale);
  const reference = resize(decoded, referenceWidth, referenceHeight, 'lanczos3');
  const lowResolution = resize(reference, referenceWidth / 2, referenceHeight / 2, 'lanczos3');
  const filePrefix = asset.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const referenceArtifact = await savePngArtifact(`${filePrefix}-reference.png`, reference);
  const lowResolutionArtifact = await savePngArtifact(`${filePrefix}-low-resolution.png`, lowResolution);
  const methodResults = [];

  for (const [methodName, upscale] of methods) {
    for (let iteration = 0; iteration < warmupCount; iteration += 1) upscale(lowResolution);
    const elapsedMs = [];
    let output;
    for (let iteration = 0; iteration < measuredCount; iteration += 1) {
      const started = performance.now();
      output = upscale(lowResolution);
      elapsedMs.push(performance.now() - started);
    }
    if (output.width !== reference.width || output.height !== reference.height)
      throw new Error(`${methodName} produced unexpected dimensions for ${asset.id}.`);

    const outputBytes = new Uint8Array(output.frames[0].data.buffer);
    const pngArtifact = await savePngArtifact(`${filePrefix}-${methodName}.png`, output);
    const timing = {
      samplesMs: elapsedMs.map((value) => Number(value.toFixed(3))),
      medianMs: Number(percentileNearestRank(elapsedMs, 0.5).toFixed(3)),
      p95Ms: Number(percentileNearestRank(elapsedMs, 0.95).toFixed(3)),
    };
    samplesByMethod.get(methodName).push(...elapsedMs);
    methodResults.push({
      method: methodName,
      output: {
        width: output.width,
        height: output.height,
        rgbaSha256: sha256(outputBytes),
        pngArtifact,
      },
      latency: timing,
      psnrRgbDb: Number(psnr(reference, output).toFixed(4)),
      ssimLuminanceGaussian11x11: Number(ssim(reference, output).toFixed(6)),
    });
  }

  fixtures.push({
    id: asset.id,
    sourceSha256: sourceHash,
    sourceDimensions: { width: decoded.width, height: decoded.height },
    referenceDimensions: { width: reference.width, height: reference.height },
    lowResolutionDimensions: { width: lowResolution.width, height: lowResolution.height },
    referenceArtifact,
    lowResolutionArtifact,
    downsample: 'Lanczos3, 2x reduction from the reduced reference',
    methods: methodResults,
  });
  process.stderr.write(`completed ${asset.id}\n`);
}

const report = {
  schemaVersion: 1,
  benchmark: 'P4-21 T32 Tier 1 scale-2 reconstruction',
  recordedAt: new Date().toISOString(),
  corpusManifestSha256: sha256(await readFile(join(fixtureDirectory, 'manifest.json'))),
  fixtureCount: fixtures.length,
  resolutionPolicy: `Lanczos3-reduced reference, maximum long edge ${maximumReferenceEdge}px and even dimensions; synthetic low-resolution input is exactly half width and height.`,
  latencyMethodology: `${warmupCount} warmup and ${measuredCount} timed runs per fixture and method; timing excludes JPEG decode, fixture reduction, low-resolution generation, and metrics. p95 uses nearest-rank; with three samples this is the maximum sample.`,
  qualityMethodology: {
    psnr: 'Exact 8-bit RGB channel MSE against the reduced reference; PSNR=10*log10(255^2/MSE).',
    ssim: 'Mean local SSIM of Rec.601 luminance, using an 11x11 Gaussian window (sigma 1.5), constants C1=(0.01*255)^2 and C2=(0.03*255)^2, clamped-edge extension, and full-resolution window centers.',
  },
  artifactMethodology: 'Each reduced reference, generated low-resolution input, and algorithm output is saved as an 8-bit RGBA lossless PNG using the pinned workspace @jsquash/png package; paths are relative to this benchmark directory, with encoded-file SHA-256 recorded.',
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: os.cpus().length,
    runtime: 'Node.js CPU, single-threaded benchmark loop; no browser or GPU backend.',
  },
  implementationNotes: [
    'DCCI and NEDI labels refer to the repository implementations invoked from the engine build; this benchmark does not independently validate conformance to academic algorithm specifications.',
    'The source fixture JPEGs already contain source compression; the deterministic reduced reference and half-resolution Lanczos3 degradation isolate repeatable resize behavior, not camera sensor restoration.',
    'Results cover the Tier 1 scale-2 path only. No learned model, ONNX Runtime, or Real-ESRGAN path is loaded or compared.',
    'Four fixtures are image-operation samples, not a statistically representative natural-image corpus or OCR ground truth.',
  ],
  aggregateLatency: Object.fromEntries(
    methods.map(([methodName]) => {
      const values = samplesByMethod.get(methodName);
      return [
        methodName,
        {
          sampleCount: values.length,
          medianMs: Number(percentileNearestRank(values, 0.5).toFixed(3)),
          p95Ms: Number(percentileNearestRank(values, 0.95).toFixed(3)),
        },
      ];
    }),
  ),
  aggregateQuality: Object.fromEntries(
    methods.map(([methodName]) => {
      const values = fixtures.map((fixture) =>
        fixture.methods.find((method) => method.method === methodName),
      );
      return [
        methodName,
        {
          fixtureCount: values.length,
          meanPsnrRgbDb: Number(
            (values.reduce((sum, value) => sum + value.psnrRgbDb, 0) / values.length).toFixed(4),
          ),
          meanSsimLuminanceGaussian11x11: Number(
            (
              values.reduce((sum, value) => sum + value.ssimLuminanceGaussian11x11, 0) /
              values.length
            ).toFixed(6),
          ),
        },
      ];
    }),
  ),
  fixtures,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
