#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { init as initJpegDecoder } from '@jsquash/jpeg/decode.js';
import { init as initJpegEncoder } from '@jsquash/jpeg/encode.js';
import { init as initPngEncoder } from '@jsquash/png/encode.js';

import {
  applyBlur,
  decodeJpegToRaster,
  encodeRasterAsJpeg,
  encodeRasterAsPng,
  resizeRaster,
  ResizeOptionsSchema,
} from '../../../../dist/index.js';
import { grainFilter } from '../../../../dist/filters/grain.js';

const directory = dirname(fileURLToPath(import.meta.url));
const t32Directory = dirname(directory);
const fixtureDirectory = join(t32Directory, '..', 'fixtures', 'cc0');
const cc0Manifest = JSON.parse(await readFile(join(fixtureDirectory, 'manifest.json'), 'utf8'));
const artifactDirectory = join(directory, 'artifacts');
const maxReferenceEdge = 256;

await initJpegDecoder(await WebAssembly.compile(await readFile(new URL('../../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', import.meta.url))));
await initJpegEncoder(await WebAssembly.compile(await readFile(new URL('../../../../node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', import.meta.url))));
await initPngEncoder(await WebAssembly.compile(await readFile(new URL('../../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url))));
await mkdir(artifactDirectory, { recursive: true });

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function resize(image, width, height, algorithm = 'lanczos3') {
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

function alignedReferenceSize(width, height) {
  const scale = Math.min(1, maxReferenceEdge / Math.max(width, height));
  const aligned = (value) => Math.max(4, Math.floor((value * scale) / 4) * 4);
  return { width: aligned(width), height: aligned(height) };
}

async function saveArtifact(filename, image) {
  const bytes = new Uint8Array(await encodeRasterAsPng(image));
  await writeFile(join(artifactDirectory, filename), bytes);
  return {
    path: `artifacts/${filename}`,
    width: image.width,
    height: image.height,
    pngSha256: sha256(bytes),
  };
}

const fixtureRows = [];

for (const asset of cc0Manifest.assets) {
  const sourceBytes = new Uint8Array(await readFile(join(fixtureDirectory, asset.path)));
  if (sha256(sourceBytes) !== asset.sha256)
    throw new Error(`CC0 source SHA-256 mismatch for ${asset.id}.`);
  const decoded = await decodeJpegToRaster(
    sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength),
  );
  const referenceSize = alignedReferenceSize(decoded.width, decoded.height);
  const reference = resize(decoded, referenceSize.width, referenceSize.height);
  const inputWidth = reference.width / 4;
  const inputHeight = reference.height / 4;
  if (!Number.isInteger(inputWidth) || !Number.isInteger(inputHeight))
    throw new Error(`Reference dimensions are not divisible by four for ${asset.id}.`);

  const blurredReference = applyBlur(reference, 'gaussian', 1);
  const cleanInput = resize(reference, inputWidth, inputHeight);
  const blurInput = resize(blurredReference, inputWidth, inputHeight);
  const jpegInput = await decodeJpegToRaster(
    await encodeRasterAsJpeg(cleanInput, { quality: 45 }),
  );
  const blurredGrain = grainFilter.apply(blurInput, { amount: 12, monochromatic: false });
  const blurGrainJpegInput = await decodeJpegToRaster(
    await encodeRasterAsJpeg(blurredGrain, { quality: 45 }),
  );

  const cases = [
    { id: 'clean-x4', image: cleanInput, degradation: { resize: 'Lanczos3 x4 reduction' } },
    {
      id: 'blur-x4',
      image: blurInput,
      degradation: { blur: 'three-pass box approximation of Gaussian, radius 1 at reference size', resize: 'Lanczos3 x4 reduction' },
    },
    {
      id: 'jpeg-q45-x4',
      image: jpegInput,
      degradation: { resize: 'Lanczos3 x4 reduction', jpegQuality: 45 },
    },
    {
      id: 'blur-grain-jpeg-q45-x4',
      image: blurGrainJpegInput,
      degradation: {
        blur: 'three-pass box approximation of Gaussian, radius 1 at reference size',
        resize: 'Lanczos3 x4 reduction',
        deterministicGrain: 'amount 12, per-channel',
        jpegQuality: 45,
      },
    },
  ];

  const referenceArtifact = await saveArtifact(`${asset.id}-reference.png`, reference);
  for (const testCase of cases) {
    const safeCaseId = testCase.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const inputArtifact = await saveArtifact(`${asset.id}-${safeCaseId}-input.png`, testCase.image);
    const tier1Output = resize(testCase.image, reference.width, reference.height);
    const tier1Artifact = await saveArtifact(`${asset.id}-${safeCaseId}-tier1-lanczos3.png`, tier1Output);
    fixtureRows.push({
      id: `${asset.id}-${safeCaseId}`,
      degradationCase: testCase.id,
      sourceAssetId: asset.id,
      sourceSha256: asset.sha256,
      reference: referenceArtifact,
      input: inputArtifact,
      tier1Lanczos3: tier1Artifact,
      degradation: testCase.degradation,
    });
  }
  process.stderr.write(`prepared ${asset.id}: ${cases.length} x4 degradation cases\n`);
}

const report = {
  schemaVersion: 1,
  benchmark: 'P4-21 T32 x4 controlled synthetic photo degradation fixtures',
  generator: {
    script: 'packages/engine/bench/escalation/t32/x4-degraded/prepare-fixtures.mjs',
    node: process.version,
    maximumReferenceLongEdge: maxReferenceEdge,
    referenceDimensions: 'Each source is Lanczos3 reduced to a maximum 256px long edge; both dimensions are rounded down to a multiple of four to permit exact x4 scale checks.',
    sourceManifest: '../fixtures/cc0/manifest.json',
    sourceManifestSha256: sha256(await readFile(join(fixtureDirectory, 'manifest.json'))),
    transformations: 'Clean x4 downsample; one controlled reference-size blur; JPEG quality 45 after downsample; and controlled blur + deterministic grain + JPEG quality 45. Inputs are synthetic degradations derived from the individually registered CC0 photos, not real degraded camera captures.',
    jpeg: 'Pinned workspace @jsquash/jpeg, baseline encoder settings except the recorded quality value.',
    blur: 'Repository applyBlur gaussian mode, implemented as three box-blur passes; radius 1 at reference dimensions.',
    grain: 'Repository deterministic grain filter, amount 12 per-channel at low-resolution dimensions.',
    baseline: 'The exact Tier 1 engine resizeRaster Lanczos3 implementation is applied to every saved input and the result is saved with its pixel and PNG hashes.',
  },
  fixtureCount: fixtureRows.length,
  fixtures: fixtureRows,
};

await writeFile(join(directory, 'fixtures.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ fixtureCount: report.fixtureCount, sourceCount: cc0Manifest.assets.length, sourceManifestSha256: report.generator.sourceManifestSha256 }, null, 2)}\n`);
