#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { init as initPngDecoder } from '@jsquash/png/decode.js';

import { decodePngToRaster } from '../../../dist/index.js';
import {
  approximatePSNR,
  approximateSSIM,
  differenceHash,
  perceptualHash,
} from '../../../dist/cv/analysis-primitives.js';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(directory, 'fixtures');
const artifactDirectory = join(fixtureDirectory, 'artifacts');
const manifestPath = join(fixtureDirectory, 'manifest.json');
const outputPath = join(directory, 'results.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixedThreshold = 0.05;
const listedThresholds = [0.01, 0.025, fixedThreshold, 0.075, 0.1, 0.15, 0.2];

await initPngDecoder(
  await WebAssembly.compile(
    await readFile(
      new URL('../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url),
    ),
  ),
);

const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const fixtureById = new Map();
const loaded = new Map();
for (const fixture of manifest.fixtures) {
  if (fixtureById.has(fixture.id)) throw new Error(`Duplicate fixture ID ${fixture.id}.`);
  const pngBytes = new Uint8Array(await readFile(join(artifactDirectory, fixture.fileName)));
  if (pngBytes.byteLength !== fixture.sizeBytes || sha256(pngBytes) !== fixture.pngSha256)
    throw new Error(`PNG byte/hash mismatch for ${fixture.id}.`);
  const image = await decodePngToRaster(
    pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength),
  );
  if (
    image.width !== fixture.width ||
    image.height !== fixture.height ||
    sha256(image.frames[0].data) !== fixture.rgbaSha256
  ) {
    throw new Error(`Decoded image/hash mismatch for ${fixture.id}.`);
  }
  fixtureById.set(fixture.id, fixture);
  loaded.set(fixture.id, image);
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

function gaussianBlur(values, width, height, kernel) {
  const { radius, weights } = kernel;
  const horizontal = new Float64Array(values.length);
  const output = new Float64Array(values.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const sx = Math.max(0, Math.min(width - 1, x + dx));
        sum += values[row + sx] * weights[dx + radius];
      }
      horizontal[row + x] = sum;
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

function luminance(image) {
  const rgba = image.frames[0].data;
  const values = new Float64Array(image.width * image.height);
  for (let pixel = 0; pixel < values.length; pixel += 1) {
    const offset = pixel * 4;
    values[pixel] = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
  }
  return values;
}

function ssimLuminanceGaussian11x11(reference, candidate) {
  if (reference.width !== candidate.width || reference.height !== candidate.height)
    throw new Error('SSIM fixture dimensions must match.');
  const width = reference.width;
  const height = reference.height;
  const a = luminance(reference);
  const b = luminance(candidate);
  const a2 = new Float64Array(a.length);
  const b2 = new Float64Array(b.length);
  const ab = new Float64Array(a.length);
  for (let index = 0; index < a.length; index += 1) {
    a2[index] = a[index] * a[index];
    b2[index] = b[index] * b[index];
    ab[index] = a[index] * b[index];
  }
  const kernel = gaussianKernel();
  const meanA = gaussianBlur(a, width, height, kernel);
  const meanB = gaussianBlur(b, width, height, kernel);
  const meanA2 = gaussianBlur(a2, width, height, kernel);
  const meanB2 = gaussianBlur(b2, width, height, kernel);
  const meanAB = gaussianBlur(ab, width, height, kernel);
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    const varianceA = Math.max(0, meanA2[index] - meanA[index] * meanA[index]);
    const varianceB = Math.max(0, meanB2[index] - meanB[index] * meanB[index]);
    const covariance = meanAB[index] - meanA[index] * meanB[index];
    total +=
      ((2 * meanA[index] * meanB[index] + c1) * (2 * covariance + c2)) /
      ((meanA[index] ** 2 + meanB[index] ** 2 + c1) * (varianceA + varianceB + c2));
  }
  return total / a.length;
}

function round(value, places = 6) {
  return Number(value.toFixed(places));
}

function psnrForJson(value) {
  return Number.isFinite(value) ? round(value, 4) : 'Infinity';
}

const t60Pairs = [];
for (const sourceId of [
  ...new Set(manifest.fixtures.map((fixture) => fixture.sourceAssetId)),
].sort()) {
  const referenceId = `${sourceId}-reference`;
  const reference = loaded.get(referenceId);
  for (const fixture of manifest.fixtures.filter(
    (entry) => entry.sourceAssetId === sourceId && entry.variantId !== 'reference',
  )) {
    const candidate = loaded.get(fixture.id);
    const psnr = approximatePSNR(reference, candidate);
    t60Pairs.push({
      id: `${referenceId}__${fixture.id}`,
      sourceAssetId: sourceId,
      candidateId: fixture.id,
      relation: 'same-source-positive',
      expectedOrderingGroup: fixture.variantId,
      pixelIdentical: fixture.rgbaSha256 === fixtureById.get(referenceId).rgbaSha256,
      engineApproximatePsnrDb: psnrForJson(psnr),
      engineApproximateSsim: round(approximateSSIM(reference, candidate)),
      ssimLuminanceGaussian11x11: round(ssimLuminanceGaussian11x11(reference, candidate)),
    });
  }
}

const sourceIds = [...new Set(manifest.fixtures.map((fixture) => fixture.sourceAssetId))].sort();
for (let left = 0; left < sourceIds.length; left += 1) {
  for (let right = left + 1; right < sourceIds.length; right += 1) {
    const sourceA = sourceIds[left];
    const sourceB = sourceIds[right];
    const imageA = loaded.get(`${sourceA}-reference`);
    const imageB = loaded.get(`${sourceB}-reference`);
    t60Pairs.push({
      id: `${sourceA}-reference__${sourceB}-reference`,
      sourceAssetId: null,
      candidateId: null,
      relation: 'cross-source-negative',
      sourcePair: [sourceA, sourceB],
      expectedOrderingGroup: 'unrelated-reference',
      pixelIdentical: false,
      engineApproximatePsnrDb: psnrForJson(approximatePSNR(imageA, imageB)),
      engineApproximateSsim: round(approximateSSIM(imageA, imageB)),
      ssimLuminanceGaussian11x11: round(ssimLuminanceGaussian11x11(imageA, imageB)),
    });
  }
}

const sameSourcePairs = t60Pairs.filter((pair) => pair.relation === 'same-source-positive');
const crossSourcePairs = t60Pairs.filter((pair) => pair.relation === 'cross-source-negative');
const t60OrderingByMetric = {};
for (const metric of ['engineApproximateSsim', 'ssimLuminanceGaussian11x11']) {
  const meanSame =
    sameSourcePairs.reduce((sum, pair) => sum + pair[metric], 0) / sameSourcePairs.length;
  const meanCross =
    crossSourcePairs.reduce((sum, pair) => sum + pair[metric], 0) / crossSourcePairs.length;
  t60OrderingByMetric[metric] = {
    sameSourceMean: round(meanSame),
    crossSourceMean: round(meanCross),
    expectedSameSourceGreaterThanCrossSource: true,
    passed: meanSame > meanCross,
  };
}
const exactRows = t60Pairs.filter((pair) => pair.expectedOrderingGroup === 'exact-copy');
const jpegOrderRows = sourceIds.map((sourceAssetId) => {
  const quality90 = t60Pairs.find(
    (pair) => pair.sourceAssetId === sourceAssetId && pair.expectedOrderingGroup === 'jpeg-q90',
  );
  const quality45 = t60Pairs.find(
    (pair) => pair.sourceAssetId === sourceAssetId && pair.expectedOrderingGroup === 'jpeg-q45',
  );
  return {
    sourceAssetId,
    quality90PsnrDb: quality90.engineApproximatePsnrDb,
    quality45PsnrDb: quality45.engineApproximatePsnrDb,
    psnrExpectedQ90AtLeastQ45:
      quality90.engineApproximatePsnrDb === 'Infinity' ||
      quality45.engineApproximatePsnrDb === 'Infinity' ||
      quality90.engineApproximatePsnrDb >= quality45.engineApproximatePsnrDb,
    quality90Ssim: quality90.ssimLuminanceGaussian11x11,
    quality45Ssim: quality45.ssimLuminanceGaussian11x11,
    ssimExpectedQ90AtLeastQ45:
      quality90.ssimLuminanceGaussian11x11 >= quality45.ssimLuminanceGaussian11x11,
  };
});

const retrievalRecords = manifest.fixtures.map((fixture) => {
  const image = loaded.get(fixture.id);
  return {
    id: fixture.id,
    sourceAssetId: fixture.sourceAssetId,
    averageHash: perceptualHash(image),
    differenceHash: differenceHash(image),
  };
});

function bitDistance(left, right) {
  if (left.length !== right.length)
    throw new Error('Hash dimensions differ inside fixed-size corpus.');
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance / left.length;
}

function computeRetrievalPairs(hashName) {
  const pairs = [];
  for (let queryIndex = 0; queryIndex < retrievalRecords.length; queryIndex += 1) {
    const query = retrievalRecords[queryIndex];
    for (let candidateIndex = 0; candidateIndex < retrievalRecords.length; candidateIndex += 1) {
      if (candidateIndex === queryIndex) continue;
      const candidate = retrievalRecords[candidateIndex];
      pairs.push({
        queryId: query.id,
        candidateId: candidate.id,
        label:
          query.sourceAssetId === candidate.sourceAssetId
            ? 'positive-same-source'
            : 'negative-cross-source',
        distanceFraction: bitDistance(query[hashName], candidate[hashName]),
      });
    }
  }
  return pairs;
}

function scoreThreshold(pairs, threshold) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  for (const pair of pairs) {
    const predictedPositive = pair.distanceFraction <= threshold;
    const actualPositive = pair.label === 'positive-same-source';
    if (predictedPositive && actualPositive) truePositive += 1;
    else if (predictedPositive) falsePositive += 1;
    else if (actualPositive) falseNegative += 1;
    else trueNegative += 1;
  }
  const precision =
    truePositive + falsePositive === 0 ? 0 : truePositive / (truePositive + falsePositive);
  const recall =
    truePositive + falseNegative === 0 ? 0 : truePositive / (truePositive + falseNegative);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    threshold: round(threshold, 4),
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
  };
}

const t61Metrics = {};
for (const hashName of ['averageHash', 'differenceHash']) {
  const pairs = computeRetrievalPairs(hashName);
  const thresholds = listedThresholds.map((threshold) => scoreThreshold(pairs, threshold));
  const fixed = thresholds.find((entry) => entry.threshold === fixedThreshold);
  const sweep = [];
  for (let threshold = 0; threshold <= 0.300001; threshold += 0.005)
    sweep.push(scoreThreshold(pairs, threshold));
  const bestF1 = [...sweep].sort(
    (left, right) =>
      right.f1 - left.f1 || right.precision - left.precision || left.threshold - right.threshold,
  )[0];
  const hashLength = retrievalRecords[0][hashName].length;
  t61Metrics[hashName] = {
    hashBitCount: hashLength,
    directedQueryCount: retrievalRecords.length,
    directedPairCount: pairs.length,
    positiveDirectedPairCount: pairs.filter((pair) => pair.label === 'positive-same-source').length,
    negativeDirectedPairCount: pairs.filter((pair) => pair.label === 'negative-cross-source')
      .length,
    fixedThresholdPolicy:
      'Preselected Hamming-distance fraction <= 0.05; no threshold tuning used for the reported primary precision/recall.',
    fixedThresholdMetrics: fixed,
    thresholdSweep: thresholds,
    pairScores: pairs,
    bestF1OnThisCorpus: {
      ...bestF1,
      caveat:
        'Post-hoc descriptive threshold on this small corpus; not a held-out threshold or deployment recommendation.',
    },
  };
}

const result = {
  schemaVersion: 1,
  benchmark: 'P4-21 T60 compare metrics and T61 thresholded duplicate retrieval',
  recordedAt: new Date().toISOString(),
  fixtureManifest: {
    path: 'fixtures/manifest.json',
    sha256: sha256(manifestBytes),
    fixtureCount: manifest.fixtureCount,
    cc0SourceCount: sourceIds.length,
  },
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    runtime: 'Node.js CPU, single-threaded; no GPU or learned model used.',
  },
  metricMethodology: {
    psnr: 'Engine approximatePSNR over exact 8-bit RGB MSE; identical pixels serialize as the string "Infinity".',
    engineApproximateSsim:
      'The repository approximateSSIM is 1 - mean absolute Rec.601 luminance difference / 255. This is not standard windowed SSIM.',
    ssim: 'Separately computed mean local SSIM of Rec.601 luminance with an 11x11 Gaussian window (sigma 1.5), C1=(0.01*255)^2, C2=(0.03*255)^2, clamped-edge samples, and full-image window centers.',
    expectedOrder:
      'For each source, exact copy must be perfect and JPEG quality 90 should score at least as high as quality 45; across the corpus, same-source variants should average more similar than cross-source source references.',
  },
  t60: {
    pairCount: t60Pairs.length,
    sameSourceVariantPairCount: sameSourcePairs.length,
    crossSourceReferencePairCount: crossSourcePairs.length,
    exactCopyChecks: {
      pairCount: exactRows.length,
      allPixelIdentical: exactRows.every((pair) => pair.pixelIdentical),
      allPsnrInfinite: exactRows.every((pair) => pair.engineApproximatePsnrDb === 'Infinity'),
      allEngineApproximateSsimOne: exactRows.every((pair) => pair.engineApproximateSsim === 1),
      allWindowedSsimOne: exactRows.every((pair) => pair.ssimLuminanceGaussian11x11 === 1),
    },
    perSourceJpegOrdering: jpegOrderRows,
    sameSourceVersusCrossSourceMeanOrdering: t60OrderingByMetric,
    pairs: t60Pairs,
  },
  t61: {
    labelDefinition:
      'Same sourceAssetId is a positive duplicate relation (reference, exact pixel copy, JPEG re-encodes, centered crop, and brightness-shift variants). Different sourceAssetId is a negative relation.',
    limitation:
      'The four registered sources form easy negatives; there are no manually curated visually similar cross-source hard negatives. Results measure pairwise candidate scores, not a user study or production threshold.',
    metrics: t61Metrics,
  },
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
const compact = {
  t60: {
    pairCount: result.t60.pairCount,
    exactCopyChecks: result.t60.exactCopyChecks,
    perSourceJpegOrdering: result.t60.perSourceJpegOrdering,
    sameSourceVersusCrossSourceMeanOrdering: result.t60.sameSourceVersusCrossSourceMeanOrdering,
  },
  t61: Object.fromEntries(
    Object.entries(result.t61.metrics).map(([name, metrics]) => [
      name,
      {
        fixedThresholdMetrics: metrics.fixedThresholdMetrics,
        bestF1OnThisCorpus: metrics.bestF1OnThisCorpus,
      },
    ]),
  ),
};
process.stdout.write(`${JSON.stringify(compact, null, 2)}\n`);
