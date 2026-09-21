import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { init as initPngEncoder } from '@jsquash/png/encode.js';
import { createRaster, encodeRasterAsPng, removeObject } from '../../../dist/index.js';

const directory = dirname(fileURLToPath(import.meta.url));
const outputPath = join(directory, 'results.json');
const artifactDirectory = join(directory, 'artifacts');
const width = 48;
const height = 48;
const maskRect = { x: 20, y: 20, width: 8, height: 8 };
const warmupCount = 1;
const measuredCount = 5;
const algorithms = ['telea', 'navier-stokes', 'confidence-priority', 'efros-leung', 'quilting'];

await initPngEncoder(
  await WebAssembly.compile(
    await readFile(
      join(directory, '../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
    ),
  ),
);
await mkdir(artifactDirectory, { recursive: true });

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function percentileNearestRank(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hashLattice(seed, x, y) {
  let value =
    (seed ^ Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0xc2b2ae35, 0x27d4eb2f)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value / 0xffffffff;
}

function valueNoise(seed, x, y, spacing) {
  const gx = x / spacing;
  const gy = y / spacing;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;
  const smoothX = tx * tx * (3 - 2 * tx);
  const smoothY = ty * ty * (3 - 2 * ty);
  const top = hashLattice(seed, x0, y0) * (1 - smoothX) + hashLattice(seed, x0 + 1, y0) * smoothX;
  const bottom =
    hashLattice(seed, x0, y0 + 1) * (1 - smoothX) + hashLattice(seed, x0 + 1, y0 + 1) * smoothX;
  return top * (1 - smoothY) + bottom * smoothY;
}

function scenePixel(scene, x, y) {
  if (scene === 'woven-lattice') {
    const weaveA = Math.sin((2 * Math.PI * (x + 0.22 * y)) / 7);
    const weaveB = Math.cos((2 * Math.PI * (y - 0.18 * x)) / 9);
    const fine = Math.sin((2 * Math.PI * (x + y)) / 3);
    return [
      clampByte(126 + 43 * weaveA + 19 * weaveB + 9 * fine),
      clampByte(129 + 20 * weaveA + 46 * weaveB - 8 * fine),
      clampByte(132 - 32 * weaveA + 24 * weaveB + 10 * fine),
      255,
    ];
  }
  if (scene === 'crossing-bands') {
    const diagonal = Math.sin((2 * Math.PI * (x + y * 0.72)) / 12);
    const cross = Math.cos((2 * Math.PI * (x - y * 0.55)) / 17);
    const grain = (hashLattice(0x66a31, x, y) - 0.5) * 16;
    return [
      clampByte(138 + 48 * diagonal + 16 * cross + grain),
      clampByte(117 + 26 * diagonal - 47 * cross + grain),
      clampByte(123 - 36 * diagonal + 29 * cross - grain),
      255,
    ];
  }
  const cloud = valueNoise(0x66b27, x, y, 13) * 2 - 1;
  const middle = valueNoise(0x66b27, x, y, 6) * 2 - 1;
  const fine = (hashLattice(0x66b27, x, y) - 0.5) * 2;
  return [
    clampByte(132 + 38 * cloud + 24 * middle + 11 * fine),
    clampByte(125 + 29 * cloud - 35 * middle - 13 * fine),
    clampByte(119 - 31 * cloud + 34 * middle + 12 * fine),
    255,
  ];
}

function makeReference(id) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) pixels.set(scenePixel(id, x, y), (y * width + x) * 4);
  }
  return createRaster(width, height, pixels);
}

async function saveArtifact(filename, image) {
  const encoded = new Uint8Array(await encodeRasterAsPng(image));
  await writeFile(join(artifactDirectory, filename), encoded);
  return {
    path: `artifacts/${filename}`,
    width: image.width,
    height: image.height,
    pngBytes: encoded.byteLength,
    pngSha256: sha256(encoded),
    rgbaSha256: sha256(image.frames[0].data),
  };
}

function roiPsnr(reference, output, mask) {
  const a = reference.frames[0].data;
  const b = output.frames[0].data;
  let squaredError = 0;
  let pixelCount = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 255) continue;
    pixelCount += 1;
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = a[offset + channel] - b[offset + channel];
      squaredError += difference * difference;
    }
  }
  const mse = squaredError / (pixelCount * 3);
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

function roiSsim(reference, output, mask) {
  const width = reference.width;
  const height = reference.height;
  const a = reference.frames[0].data;
  const b = output.frames[0].data;
  const radius = 3;
  const sigma = 1.2;
  const weights = [];
  let weightSum = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const weight = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      weights.push({ dx, dy, weight });
      weightSum += weight;
    }
  }
  for (const sample of weights) sample.weight /= weightSum;
  const gray = (data, x, y) => {
    const offset = (y * width + x) * 4;
    return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  };
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let sum = 0;
  let centerCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] !== 255) continue;
      let meanA = 0;
      let meanB = 0;
      let meanA2 = 0;
      let meanB2 = 0;
      let meanAB = 0;
      for (const { dx, dy, weight } of weights) {
        const sx = Math.max(0, Math.min(width - 1, x + dx));
        const sy = Math.max(0, Math.min(height - 1, y + dy));
        const av = gray(a, sx, sy);
        const bv = gray(b, sx, sy);
        meanA += weight * av;
        meanB += weight * bv;
        meanA2 += weight * av * av;
        meanB2 += weight * bv * bv;
        meanAB += weight * av * bv;
      }
      const varianceA = Math.max(0, meanA2 - meanA * meanA);
      const varianceB = Math.max(0, meanB2 - meanB * meanB);
      const covariance = meanAB - meanA * meanB;
      const numerator = (2 * meanA * meanB + c1) * (2 * covariance + c2);
      const denominator = (meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2);
      sum += numerator / denominator;
      centerCount += 1;
    }
  }
  return sum / centerCount;
}

function validateOutput(input, output, mask, id, algorithm) {
  if (output.width !== width || output.height !== height)
    throw new Error(`${algorithm} returned incorrect dimensions for ${id}.`);
  const before = input.frames[0].data;
  const after = output.frames[0].data;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 255) continue;
    const offset = index * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      if (before[offset + channel] !== after[offset + channel])
        throw new Error(`${algorithm} changed an unmasked pixel in ${id}.`);
    }
  }
}

const fixtures = [];
const timingsByMethod = new Map(algorithms.map((algorithm) => [algorithm, []]));
for (const id of ['woven-lattice', 'crossing-bands', 'seeded-cloud']) {
  const reference = makeReference(id);
  const inputData = reference.frames[0].data.slice();
  const mask = new Uint8ClampedArray(width * height);
  for (let y = maskRect.y; y < maskRect.y + maskRect.height; y += 1) {
    for (let x = maskRect.x; x < maskRect.x + maskRect.width; x += 1) {
      mask[y * width + x] = 255;
      const offset = (y * width + x) * 4;
      inputData[offset] = 255;
      inputData[offset + 1] = 0;
      inputData[offset + 2] = 255;
    }
  }
  const input = createRaster(width, height, inputData);
  const referenceArtifact = await saveArtifact(`${id}-reference.png`, reference);
  const inputArtifact = await saveArtifact(`${id}-masked-input.png`, input);
  const methodResults = [];
  for (const algorithm of algorithms) {
    for (let iteration = 0; iteration < warmupCount; iteration += 1)
      removeObject(input, { algorithm, mask });
    const elapsedMs = [];
    let output;
    for (let iteration = 0; iteration < measuredCount; iteration += 1) {
      const started = performance.now();
      output = removeObject(input, { algorithm, mask });
      elapsedMs.push(performance.now() - started);
    }
    validateOutput(input, output, mask, id, algorithm);
    const outputArtifact = await saveArtifact(`${id}-${algorithm}.png`, output);
    const psnr = roiPsnr(reference, output, mask);
    const ssim = roiSsim(reference, output, mask);
    const timing = {
      samplesMs: elapsedMs.map((value) => Number(value.toFixed(3))),
      medianMs: Number(percentileNearestRank(elapsedMs, 0.5).toFixed(3)),
      p95Ms: Number(percentileNearestRank(elapsedMs, 0.95).toFixed(3)),
    };
    timingsByMethod.get(algorithm).push(...elapsedMs);
    methodResults.push({
      algorithm,
      output: outputArtifact,
      latency: timing,
      roiPsnrRgbDb: Number(psnr.toFixed(4)),
      roiSsimRec601Gaussian7x7: Number(ssim.toFixed(6)),
    });
  }
  fixtures.push({
    id,
    generator: {
      type: 'deterministic in-code procedural field',
      parameters:
        id === 'woven-lattice'
          ? 'Three RGB channels combine fixed-period sinusoidal woven waves; no random state.'
          : id === 'crossing-bands'
            ? 'Crossing sinusoidal RGB bands plus per-pixel hash noise, seed 0x66a31.'
            : 'Bilinear smooth value-noise octaves at spacings 13 and 6 plus per-pixel hash noise, seed 0x66b27.',
    },
    width,
    height,
    mask: {
      rectangle: maskRect,
      maskedPixelCount: mask.reduce((sum, value) => sum + (value === 255 ? 1 : 0), 0),
      rawMaskSha256: sha256(mask),
      fillColorRgba: [255, 0, 255, 255],
    },
    reference: referenceArtifact,
    maskedInput: inputArtifact,
    scoreRegion:
      'PSNR scores RGB pixels whose mask value is 255. SSIM averages 7x7 Gaussian-window local SSIM (sigma 1.2) at those same masked-pixel centers; windows include surrounding known context.',
    methods: methodResults,
  });
  process.stderr.write(`completed ${id}\n`);
}

const report = {
  schemaVersion: 1,
  benchmark: 'P4-21 T66 local object-removal inpainting comparison',
  recordedAt: new Date().toISOString(),
  benchmarkScriptSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  fixtureCount: fixtures.length,
  assetPolicy:
    'All scenes and exact pre-occlusion references are generated in this script. No external images or downloaded model assets are used.',
  setup: {
    width,
    height,
    mask: `${maskRect.width}x${maskRect.height} rectangle at (${maskRect.x},${maskRect.y}); same opaque magenta fill and mask for every method; input/reference dimensions are unchanged.`,
    algorithms,
  },
  latencyMethodology: `${warmupCount} warmup and ${measuredCount} timed calls per scene and method; only the exported removeObject call is timed. PNG encoding, metric calculation, and fixture generation are excluded. p95 uses nearest-rank and equals the maximum with five samples.`,
  qualityMethodology: {
    psnr: 'Exact RGB channel MSE strictly over the masked pixels, compared with the original generated values before occlusion; PSNR=10*log10(255^2/MSE).',
    ssim: 'Mean local SSIM of Rec.601 luminance, with a 7x7 Gaussian window (sigma 1.2), constants C1=(0.01*255)^2 and C2=(0.03*255)^2, clamped-edge extension, and window centers restricted to masked pixels. The window samples include known neighboring context.',
  },
  artifactMethodology:
    'Reference, masked input, and each output are saved as lossless 8-bit RGBA PNGs. Encoded-PNG and raw-RGBA SHA-256 hashes are recorded with dimensions.',
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: os.cpus().length,
    runtime: 'Node.js CPU, synchronous single-threaded benchmark loop; no browser or GPU backend.',
  },
  implementationNotes: [
    'Calls use the exported removeObject controller; all five currently exported algorithm choices are compared on the identical masked input for each fixture.',
    'Quality scores measure recovery of a small, known hidden synthetic patch. They do not establish quality on real photographs, varied mask geometries, larger objects, or user-selected content.',
    'The implementations are repository-local algorithm labels; this comparison does not independently validate conformance to the named academic methods.',
    'PSNR reflects only exact ROI RGB error; SSIM uses each ROI pixel as a local-window center but also reads adjacent unmasked context. Both are descriptive metrics and not a user study.',
  ],
  aggregateLatency: Object.fromEntries(
    algorithms.map((algorithm) => {
      const values = timingsByMethod.get(algorithm);
      return [
        algorithm,
        {
          sampleCount: values.length,
          medianMs: Number(percentileNearestRank(values, 0.5).toFixed(3)),
          p95Ms: Number(percentileNearestRank(values, 0.95).toFixed(3)),
        },
      ];
    }),
  ),
  aggregateQuality: Object.fromEntries(
    algorithms.map((algorithm) => {
      const values = fixtures.map((fixture) =>
        fixture.methods.find((result) => result.algorithm === algorithm),
      );
      return [
        algorithm,
        {
          fixtureCount: values.length,
          meanRoiPsnrRgbDb: Number(
            (values.reduce((sum, value) => sum + value.roiPsnrRgbDb, 0) / values.length).toFixed(4),
          ),
          meanRoiSsimRec601Gaussian7x7: Number(
            (
              values.reduce((sum, value) => sum + value.roiSsimRec601Gaussian7x7, 0) / values.length
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
