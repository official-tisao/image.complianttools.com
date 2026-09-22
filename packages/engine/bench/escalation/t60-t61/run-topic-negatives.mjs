#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { init as initPngDecoder } from '@jsquash/png/decode.js';

import { createRaster, decodePngToRaster } from '../../../dist/index.js';
import { differenceHash, perceptualHash } from '../../../dist/cv/analysis-primitives.js';

const directory = dirname(fileURLToPath(import.meta.url));
const corpusDirectory = join(directory, 'fixtures', 'topic-negatives');
const artifactDirectory = join(corpusDirectory, 'artifacts');
const manifestPath = join(corpusDirectory, 'manifest.json');
const sourceManifestPath = join(corpusDirectory, 'source-manifest.json');
const outputPath = join(directory, 't61-topic-negatives-results.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const APP_HASH_DISTANCE_LIMIT = 6;
const FIXED_THRESHOLD = 0.05;

await initPngDecoder(
  await WebAssembly.compile(
    await readFile(
      new URL('../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url),
    ),
  ),
);

const productSource = await readFile(
  new URL('../../../../../apps/web/src/lib/T61DuplicateFinder.svelte', import.meta.url),
  'utf8',
);
for (const contract of [
  /const HASH_SIZE = 8;/,
  /const MAX_AVERAGE_DISTANCE = 6;/,
  /const MAX_DIFFERENCE_DISTANCE = 6;/,
  /context\.drawImage\(bitmap, 0, 0, HASH_SIZE, HASH_SIZE\);/,
]) {
  if (!contract.test(productSource))
    throw new Error(
      'T61 route preprocessing or threshold changed; review and update this benchmark.',
    );
}

const sourceManifestBytes = await readFile(sourceManifestPath);
const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8'));
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.sourceManifestSha256 !== sha256(sourceManifestBytes))
  throw new Error('Hard-negative source manifest SHA-256 mismatch.');
if (manifest.fixtures.length !== 12 || sourceManifest.assets.length !== 2)
  throw new Error('Expected six variants for each of two CC0 sources.');

const fixtures = [];
for (const fixture of manifest.fixtures) {
  const source = sourceManifest.assets.find((asset) => asset.id === fixture.sourceAssetId);
  if (!source || source.sha256 !== fixture.sourceSha256)
    throw new Error(`Source identity mismatch for ${fixture.id}.`);
  const bytes = new Uint8Array(await readFile(join(artifactDirectory, fixture.fileName)));
  if (bytes.byteLength !== fixture.sizeBytes || sha256(bytes) !== fixture.pngSha256)
    throw new Error(`PNG byte/hash mismatch for ${fixture.id}.`);
  const image = await decodePngToRaster(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  if (
    image.width !== fixture.width ||
    image.height !== fixture.height ||
    sha256(image.frames[0].data) !== fixture.rgbaSha256
  ) {
    throw new Error(`Decoded raster/hash mismatch for ${fixture.id}.`);
  }
  fixtures.push({
    id: fixture.id,
    sourceAssetId: fixture.sourceAssetId,
    sha256: fixture.pngSha256,
    dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,
  });
}

// T61 decodes in the browser and draws each full image into an 8x8 canvas
// before calling the engine hash primitives. Preserve that exact resampling
// path here instead of hashing the larger benchmark fixture directly.
const browser = await chromium.launch({ headless: true });
let canvasRecords;
let browserVersion;
try {
  browserVersion = browser.version();
  const page = await browser.newPage();
  canvasRecords = await page.evaluate(async (items) => {
    async function loadImage(dataUrl) {
      const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      try {
        if (!context) throw new Error('Could not create the T61 8x8 hash canvas.');
        context.drawImage(bitmap, 0, 0, 8, 8);
        return Array.from(context.getImageData(0, 0, 8, 8).data);
      } finally {
        bitmap.close();
      }
    }
    return Promise.all(
      items.map(async (item) => ({ ...item, rgba: await loadImage(item.dataUrl) })),
    );
  }, fixtures);
} finally {
  await browser.close();
}

const records = canvasRecords.map(({ id, sourceAssetId, sha256: fileSha256, rgba }) => {
  const image = createRaster(8, 8, new Uint8Array(rgba));
  return {
    id,
    sourceAssetId,
    sha256: fileSha256,
    averageHash: perceptualHash(image),
    differenceHash: differenceHash(image),
  };
});
if (
  records.some((record) => record.averageHash.length !== 64 || record.differenceHash.length !== 49)
)
  throw new Error(
    'Expected T61 production hash lengths of 64 average bits and 49 difference bits.',
  );

function distance(left, right) {
  let bits = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) bits += 1;
  return bits;
}

const pairs = [];
for (const query of records) {
  for (const candidate of records) {
    if (query.id === candidate.id) continue;
    const sameSource = query.sourceAssetId === candidate.sourceAssetId;
    const averageDistanceBits = distance(query.averageHash, candidate.averageHash);
    const differenceDistanceBits = distance(query.differenceHash, candidate.differenceHash);
    const exactDuplicate = query.sha256 === candidate.sha256;
    const visualNearMatch =
      averageDistanceBits <= APP_HASH_DISTANCE_LIMIT &&
      differenceDistanceBits <= APP_HASH_DISTANCE_LIMIT;
    pairs.push({
      queryId: query.id,
      candidateId: candidate.id,
      querySourceId: query.sourceAssetId,
      candidateSourceId: candidate.sourceAssetId,
      relation: sameSource
        ? 'positive-same-source'
        : 'topic-matched-negative-distinct-autumn-scene',
      exactDuplicate,
      averageDistanceBits,
      differenceDistanceBits,
      averageDistanceFraction: averageDistanceBits / query.averageHash.length,
      differenceDistanceFraction: differenceDistanceBits / query.differenceHash.length,
      productRulePredictsMatch: exactDuplicate || visualNearMatch,
      productMatchKind: exactDuplicate
        ? 'exact-sha256'
        : visualNearMatch
          ? 'visual-near-match'
          : 'none',
    });
  }
}

function confusion(selectedPairs, predict) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  for (const pair of selectedPairs) {
    const actualPositive = pair.relation === 'positive-same-source';
    const predictedPositive = predict(pair);
    if (actualPositive && predictedPositive) truePositive += 1;
    else if (!actualPositive && predictedPositive) falsePositive += 1;
    else if (actualPositive) falseNegative += 1;
    else trueNegative += 1;
  }
  const precision =
    truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
  const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
  return {
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    precision: Number(precision.toFixed(6)),
    recall: Number(recall.toFixed(6)),
    f1: Number(
      (precision + recall ? (2 * precision * recall) / (precision + recall) : 0).toFixed(6),
    ),
  };
}

const positives = pairs.filter((pair) => pair.relation === 'positive-same-source');
const topicNegatives = pairs.filter(
  (pair) => pair.relation === 'topic-matched-negative-distinct-autumn-scene',
);
const allPairs = [...positives, ...topicNegatives];
const exactPairs = allPairs.filter((pair) => pair.exactDuplicate);
const nonExactPairs = allPairs.filter((pair) => !pair.exactDuplicate);
const result = {
  schemaVersion: 1,
  benchmark: 'P4-21 T61 topic-matched distinct-source autumn-leaf negatives',
  recordedAt: new Date().toISOString(),
  sourceManifest: 'fixtures/topic-negatives/source-manifest.json',
  sourceManifestSha256: sha256(sourceManifestBytes),
  fixtureManifest: 'fixtures/topic-negatives/manifest.json',
  fixtureManifestSha256: sha256(manifestBytes),
  methods: {
    averageHash:
      'Production perceptualHash (64 average-threshold bits) applied to the route canvas pixels.',
    differenceHash:
      'Production differenceHash (49 horizontal-gradient bits) applied to the route canvas pixels.',
    productRule: `The current T61 product reports exact SHA-256 groups first. For byte-distinct files, its visual near-match rule requires average-hash Hamming distance <= ${APP_HASH_DISTANCE_LIMIT}/64, difference-hash Hamming distance <= ${APP_HASH_DISTANCE_LIMIT}/49, and source aspect ratios differing by no more than 10%. The fixtures share the same dimensions and aspect ratio. Hash inputs use Chromium ${browserVersion}'s 8x8 canvas draw, matching the route's browser preprocessing before production engine hash primitives.`,
    fixedThreshold:
      'The previously reported 5% threshold is retained as a secondary fixed comparison; it is not substituted for the product rule.',
  },
  scope: {
    cc0SourceCount: sourceManifest.assets.length,
    sourceCaptures: sourceManifest.assets.map(
      ({ id, title, creator, dimensions, sha256: sourceSha256 }) => ({
        id,
        title,
        creator,
        dimensions,
        sha256: sourceSha256,
      }),
    ),
    fixtureCount: records.length,
    directedPairCount: pairs.length,
    exactDuplicateDirectedPairCount: exactPairs.length,
    positiveDirectedPairCount: positives.length,
    topicMatchedNegativeDirectedPairCount: topicNegatives.length,
    limitation:
      'Two CC0 autumn-leaf photos share a subject but differ visibly in scene composition and texture. They are topic-matched negatives, not near-identical hard negatives, and do not represent duplicate retrieval across image types or user libraries.',
  },
  browser: {
    name: 'Chromium',
    version: browserVersion,
    hashCanvas:
      '8x8; imageSmoothingEnabled and imageSmoothingQuality use browser defaults, matching the T61 route.',
  },
  productRule: {
    allPairs: confusion(allPairs, (pair) => pair.productRulePredictsMatch),
    exactDuplicates: confusion(allPairs, (pair) => pair.exactDuplicate),
    visualNearMatches: confusion(
      nonExactPairs,
      (pair) =>
        !pair.exactDuplicate &&
        pair.averageDistanceBits <= APP_HASH_DISTANCE_LIMIT &&
        pair.differenceDistanceBits <= APP_HASH_DISTANCE_LIMIT,
    ),
    topicNegatives: confusion(topicNegatives, (pair) => pair.productRulePredictsMatch),
  },
  fixedThreshold: {
    thresholdFraction: FIXED_THRESHOLD,
    allPairs: confusion(
      allPairs,
      (pair) =>
        pair.averageDistanceFraction <= FIXED_THRESHOLD &&
        pair.differenceDistanceFraction <= FIXED_THRESHOLD,
    ),
    topicNegatives: confusion(
      topicNegatives,
      (pair) =>
        pair.averageDistanceFraction <= FIXED_THRESHOLD &&
        pair.differenceDistanceFraction <= FIXED_THRESHOLD,
    ),
  },
  closestTopicNegativePairs: [...topicNegatives]
    .sort(
      (left, right) =>
        left.averageDistanceBits +
        left.differenceDistanceBits -
        (right.averageDistanceBits + right.differenceDistanceBits),
    )
    .slice(0, 12),
  pairs,
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(
  `Measured ${pairs.length} directed pairs: ${positives.length} same-source positives and ${topicNegatives.length} topic-matched negatives.\n` +
    `Product route: precision ${result.productRule.allPairs.precision}, recall ${result.productRule.allPairs.recall}; exact pairs ${exactPairs.length}; visual near-match recall ${result.productRule.visualNearMatches.recall}; topic-negative false positives ${result.productRule.topicNegatives.falsePositive}/${topicNegatives.length}.\n`,
);
