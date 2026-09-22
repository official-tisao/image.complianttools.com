#!/usr/bin/env node

// Additive CC0 photo-derived T66 benchmark. This deliberately writes to
// cc0-results.json and cc0-artifacts/ so the original synthetic benchmark is
// preserved byte-for-byte.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { init as initJpegDecoder } from '@jsquash/jpeg/decode.js';
import { init as initPngEncoder } from '@jsquash/png/encode.js';
import {
  createRaster,
  CropOptionsSchema,
  cropRaster,
  decodeJpegToRaster,
  encodeRasterAsPng,
  removeObject,
  resizeRaster,
  ResizeOptionsSchema,
} from '../../../dist/index.js';

const directory = dirname(fileURLToPath(import.meta.url));
const cc0Directory = join(directory, '../fixtures/cc0');
const cc0ManifestPath = join(cc0Directory, 'manifest.json');
const artifactDirectory = join(directory, 'cc0-artifacts');
const outputPath = join(directory, 'cc0-results.json');
const side = 32;
const cropSide = 256;
const warmupCount = 1;
const measuredCount = 3;
const algorithms = ['telea', 'navier-stokes', 'confidence-priority', 'efros-leung', 'quilting'];

// The exact source crop is fixed in original JPEG pixels and independently
// resampled to 32x32 with Lanczos3. Each registered source has two views.
const casesBySource = {
  'landscape-dordogne': [
    { view: 'interior', crop: { x: 2050, y: 1260 }, mask: 'center-rectangle' },
    { view: 'offset', crop: { x: 2610, y: 1740 }, mask: 'irregular-left-edge' },
  ],
  'oak-leaves': [
    { view: 'interior', crop: { x: 1700, y: 1080 }, mask: 'center-rectangle' },
    { view: 'offset', crop: { x: 2220, y: 1510 }, mask: 'irregular-left-edge' },
  ],
  'gold-weight': [
    { view: 'interior', crop: { x: 1010, y: 790 }, mask: 'center-rectangle' },
    { view: 'offset', crop: { x: 1390, y: 1180 }, mask: 'irregular-left-edge' },
  ],
  'rome-map': [
    { view: 'interior', crop: { x: 1420, y: 640 }, mask: 'center-rectangle' },
    { view: 'offset', crop: { x: 1990, y: 1110 }, mask: 'irregular-left-edge' },
  ],
};

await Promise.all([
  initJpegDecoder(
    await WebAssembly.compile(
      await readFile(
        new URL('../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', import.meta.url),
      ),
    ),
  ),
  initPngEncoder(
    await WebAssembly.compile(
      await readFile(
        new URL('../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url),
      ),
    ),
  ),
]);
await mkdir(artifactDirectory, { recursive: true });

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const asArrayBuffer = (bytes) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

function assertContained(base, candidate, label) {
  const rel = relative(base, candidate);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`))
    throw new Error(`${label} escapes the registered CC0 fixture directory.`);
}

async function loadAndValidateManifest() {
  const raw = await readFile(cc0ManifestPath);
  const manifest = JSON.parse(raw.toString('utf8'));
  if (manifest.schemaVersion !== 1 || manifest.license !== 'CC0-1.0')
    throw new Error('Expected the registered CC0-1.0 source manifest.');
  const expectedIds = Object.keys(casesBySource).sort();
  const actualIds = manifest.assets.map((asset) => asset.id).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds))
    throw new Error(`CC0 source set changed; expected ${expectedIds.join(', ')}.`);
  for (const asset of manifest.assets) {
    if (asset.license !== 'CC0-1.0') throw new Error(`${asset.id} is not registered as CC0-1.0.`);
    const imagePath = join(cc0Directory, asset.path);
    assertContained(cc0Directory, imagePath, `${asset.id} image`);
    const imageBytes = await readFile(imagePath);
    if (imageBytes.byteLength !== asset.sizeBytes || sha256(imageBytes) !== asset.sha256)
      throw new Error(`Registered source size/hash mismatch for ${asset.id}.`);
    const metadataPath = join(cc0Directory, asset.metadataSnapshot);
    assertContained(cc0Directory, metadataPath, `${asset.id} metadata`);
    const metadataBytes = await readFile(metadataPath);
    if (sha256(metadataBytes) !== asset.metadataSnapshotSha256)
      throw new Error(`Registered license metadata hash mismatch for ${asset.id}.`);
    const metadata = JSON.parse(metadataBytes.toString('utf8'));
    const licenseIsCC0 =
      metadata?.data?.share_license_status === 'CC0' ||
      Object.values(metadata?.query?.pages ?? {}).some((page) =>
        page?.imageinfo?.some(
          (info) =>
            info?.extmetadata?.LicenseShortName?.value === 'CC0' &&
            /^https?:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0(?:\/|$)/.test(
              info?.extmetadata?.LicenseUrl?.value ?? '',
            ),
        ),
      );
    if (!licenseIsCC0) throw new Error(`Item-level source metadata does not confirm CC0 for ${asset.id}.`);
  }
  return manifest;
}

function prepareCaseRaster(source, crop) {
  const cropImage = cropRaster(
    source,
    CropOptionsSchema.parse({
      mode: 'rect',
      x: crop.x,
      y: crop.y,
      width: cropSide,
      height: cropSide,
      outputRounding: 1,
    }),
  );
  return resizeRaster(
    cropImage,
    ResizeOptionsSchema.parse({
      mode: 'pixels',
      width: side,
      height: side,
      lockAspect: false,
      algorithm: 'lanczos3',
      allowUpscale: true,
      roundTo: 1,
      maxPixels: 1_000_000,
    }),
  );
}

function makeMask(kind) {
  const mask = new Uint8ClampedArray(side * side);
  if (kind === 'center-rectangle') {
    for (let y = 13; y < 19; y += 1)
      for (let x = 13; x < 19; x += 1) mask[y * side + x] = 255;
    return { mask, shape: '6x6 rectangle at (13,13), fully interior' };
  }
  // A stepped, irregular mask whose leftmost run touches the crop boundary.
  const rows = [3, 5, 6, 7, 7, 6, 5, 3];
  for (let y = 0; y < rows.length; y += 1)
    for (let x = 0; x < rows[y]; x += 1) mask[(11 + y) * side + x] = 255;
  return { mask, shape: 'irregular stepped 8-row mask at x=0; touches left image boundary' };
}

function saveScoreRegion(reference, output, mask) {
  const expected = reference.frames[0].data;
  const actual = output.frames[0].data;
  let squaredError = 0;
  let maskedPixelCount = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] !== 255) continue;
    maskedPixelCount += 1;
    const offset = pixel * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = expected[offset + channel] - actual[offset + channel];
      squaredError += delta * delta;
    }
  }
  const mse = squaredError / (maskedPixelCount * 3);
  const roiPsnrRgbDb = mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);

  // Windowed Rec.601 SSIM at masked-pixel centers. The Gaussian window also
  // samples known neighboring context, matching the existing synthetic T66 run.
  const radius = 3;
  const sigma = 1.2;
  const weights = [];
  let weightSum = 0;
  for (let dy = -radius; dy <= radius; dy += 1)
    for (let dx = -radius; dx <= radius; dx += 1) {
      const weight = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      weights.push({ dx, dy, weight });
      weightSum += weight;
    }
  for (const sample of weights) sample.weight /= weightSum;
  const gray = (data, x, y) => {
    const offset = (y * side + x) * 4;
    return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  };
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let ssimSum = 0;
  let centerCount = 0;
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      if (mask[y * side + x] !== 255) continue;
      let meanA = 0;
      let meanB = 0;
      let meanA2 = 0;
      let meanB2 = 0;
      let meanAB = 0;
      for (const { dx, dy, weight } of weights) {
        const sx = Math.max(0, Math.min(side - 1, x + dx));
        const sy = Math.max(0, Math.min(side - 1, y + dy));
        const a = gray(expected, sx, sy);
        const b = gray(actual, sx, sy);
        meanA += weight * a;
        meanB += weight * b;
        meanA2 += weight * a * a;
        meanB2 += weight * b * b;
        meanAB += weight * a * b;
      }
      const varianceA = Math.max(0, meanA2 - meanA * meanA);
      const varianceB = Math.max(0, meanB2 - meanB * meanB);
      const covariance = meanAB - meanA * meanB;
      ssimSum +=
        ((2 * meanA * meanB + c1) * (2 * covariance + c2)) /
        ((meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2));
      centerCount += 1;
    }
  }
  return {
    maskedPixelCount,
    roiPsnrRgbDb: Number(roiPsnrRgbDb.toFixed(4)),
    roiSsimRec601Gaussian7x7: Number((ssimSum / centerCount).toFixed(6)),
  };
}

function assertPreservedPixels(input, output, mask, id, algorithm) {
  if (output.width !== side || output.height !== side)
    throw new Error(`${algorithm} returned unexpected dimensions for ${id}.`);
  const before = input.frames[0].data;
  const after = output.frames[0].data;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] === 255) continue;
    const offset = pixel * 4;
    for (let channel = 0; channel < 4; channel += 1)
      if (before[offset + channel] !== after[offset + channel])
        throw new Error(`${algorithm} changed an unmasked pixel for ${id}.`);
  }
}

async function writeArtifact(name, image) {
  const png = new Uint8Array(await encodeRasterAsPng(image));
  await writeFile(join(artifactDirectory, name), png);
  return {
    path: `cc0-artifacts/${name}`,
    width: image.width,
    height: image.height,
    pngBytes: png.byteLength,
    pngSha256: sha256(png),
    rgbaSha256: sha256(image.frames[0].data),
  };
}

function maskRaster(mask) {
  const pixels = new Uint8ClampedArray(side * side * 4);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const offset = pixel * 4;
    const value = mask[pixel];
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  return createRaster(side, side, pixels);
}

const sourceManifest = await loadAndValidateManifest();
const fixtureResults = [];
const timingByAlgorithm = new Map(algorithms.map((name) => [name, []]));

for (const asset of sourceManifest.assets) {
  const sourceBytes = await readFile(join(cc0Directory, asset.path));
  const source = await decodeJpegToRaster(asArrayBuffer(sourceBytes));
  if (source.width !== asset.dimensions.width || source.height !== asset.dimensions.height)
    throw new Error(`Decoded dimensions disagree with registration for ${asset.id}.`);
  for (const caseSpec of casesBySource[asset.id]) {
    if (
      caseSpec.crop.x < 0 ||
      caseSpec.crop.y < 0 ||
      caseSpec.crop.x + cropSide > source.width ||
      caseSpec.crop.y + cropSide > source.height
    )
      throw new Error(`Crop leaves source image bounds for ${asset.id}/${caseSpec.view}.`);
    const id = `${asset.id}-${caseSpec.view}`;
    const reference = prepareCaseRaster(source, caseSpec.crop);
    const { mask, shape } = makeMask(caseSpec.mask);
    const inputData = reference.frames[0].data.slice();
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      if (mask[pixel] !== 255) continue;
      const offset = pixel * 4;
      inputData[offset] = 255;
      inputData[offset + 1] = 0;
      inputData[offset + 2] = 255;
      inputData[offset + 3] = 255;
    }
    const input = createRaster(side, side, inputData);
    const safeId = id.replaceAll(/[^a-z0-9-]/gi, '-');
    const referenceArtifact = await writeArtifact(`${safeId}-reference.png`, reference);
    const inputArtifact = await writeArtifact(`${safeId}-masked-input.png`, input);
    const maskArtifact = await writeArtifact(`${safeId}-mask.png`, maskRaster(mask));
    const methods = [];
    for (const algorithm of algorithms) {
      for (let iteration = 0; iteration < warmupCount; iteration += 1)
        removeObject(input, { algorithm, mask });
      const samplesMs = [];
      let output;
      for (let iteration = 0; iteration < measuredCount; iteration += 1) {
        const started = performance.now();
        output = removeObject(input, { algorithm, mask });
        samplesMs.push(performance.now() - started);
      }
      assertPreservedPixels(input, output, mask, id, algorithm);
      const outputArtifact = await writeArtifact(`${safeId}-${algorithm}.png`, output);
      const scores = saveScoreRegion(reference, output, mask);
      const sorted = [...samplesMs].sort((a, b) => a - b);
      const latency = {
        samplesMs: samplesMs.map((value) => Number(value.toFixed(3))),
        medianMs: Number(sorted[Math.ceil(sorted.length * 0.5) - 1].toFixed(3)),
        p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3)),
      };
      timingByAlgorithm.get(algorithm).push(...samplesMs);
      methods.push({ algorithm, output: outputArtifact, latency, ...scores });
    }
    fixtureResults.push({
      id,
      source: {
        id: asset.id,
        title: asset.title,
        creator: asset.creator,
        license: asset.license,
        licenseEvidence: asset.licenseEvidence,
        sourcePageUrl: asset.sourcePageUrl,
        imagePath: `../fixtures/cc0/${asset.path}`,
        imageBytes: asset.sizeBytes,
        imageSha256: asset.sha256,
        metadataPath: `../fixtures/cc0/${asset.metadataSnapshot}`,
        metadataSha256: asset.metadataSnapshotSha256,
      },
      derivation: {
        decode: 'Pinned local JPEG decoder @jsquash/jpeg from the workspace lockfile; decoded 8-bit RGBA.',
        cropPixelsInSource: { ...caseSpec.crop, width: cropSide, height: cropSide },
        cropToOutput: `Lanczos3 resampling from ${cropSide}x${cropSide} to ${side}x${side}.`,
      },
      width: side,
      height: side,
      mask: {
        shape,
        rawMaskSha256: sha256(mask),
        maskedPixelCount: mask.reduce((sum, value) => sum + (value === 255 ? 1 : 0), 0),
        fillColorRgba: [255, 0, 255, 255],
        artifact: maskArtifact,
      },
      reference: referenceArtifact,
      maskedInput: inputArtifact,
      scoreRegion:
        'PSNR uses RGB channels of masked pixels only. SSIM is Rec.601 luminance, 7x7 Gaussian windows (sigma 1.2) centered on masked pixels; windows include neighboring known context.',
      methods,
    });
    process.stderr.write(`completed ${id}\n`);
  }
}

const aggregate = algorithms.map((algorithm) => {
  const rows = fixtureResults.flatMap((fixture) => fixture.methods).filter((row) => row.algorithm === algorithm);
  const timings = timingByAlgorithm.get(algorithm).sort((a, b) => a - b);
  const median = timings[Math.ceil(timings.length * 0.5) - 1];
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
  return {
    algorithm,
    meanRoiPsnrRgbDb: Number(
      (rows.reduce((sum, row) => sum + row.roiPsnrRgbDb, 0) / rows.length).toFixed(4),
    ),
    meanRoiSsim: Number(
      (rows.reduce((sum, row) => sum + row.roiSsimRec601Gaussian7x7, 0) / rows.length).toFixed(6),
    ),
    medianLatencyMs: Number(median.toFixed(3)),
    p95LatencyMs: Number(p95.toFixed(3)),
  };
});

const report = {
  schemaVersion: 1,
  benchmark: 'P4-21 T66 CC0 photo-derived inpainting proxy',
  recordedAt: new Date().toISOString(),
  benchmarkScriptSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  sourceManifestPath: '../fixtures/cc0/manifest.json',
  sourceManifestSha256: sha256(await readFile(cc0ManifestPath)),
  fixtureCount: fixtureResults.length,
  sourceCount: sourceManifest.assets.length,
  assetPolicy:
    'Uses four individually registered CC0-1.0 source images and their locally pinned item-level metadata snapshots. The runner verifies source bytes, metadata hashes, and CC0 declarations before producing derivatives.',
  setup: {
    dimensions: `${side}x${side}`,
    sourceCrop: `${cropSide}x${cropSide} in original JPEG pixels, then Lanczos3 resampling`,
    masks: 'Eight cases: one 6x6 interior rectangle and one irregular stepped 8-row mask touching the left crop boundary per source.',
    fillColorRgba: [255, 0, 255, 255],
    algorithms,
  },
  latencyMethodology: `${warmupCount} warmup and ${measuredCount} timed synchronous removeObject calls per case and method. PNG output, score calculation, decoding, cropping, and resampling are excluded. Aggregate p95 is nearest-rank over ${fixtureResults.length * measuredCount} samples per method.`,
  qualityMethodology: {
    psnr: 'Exact RGB channel MSE strictly over masked pixels compared with the original pre-occlusion crop; PSNR=10*log10(255^2/MSE).',
    ssim: 'Mean local SSIM of Rec.601 luminance, 7x7 Gaussian window (sigma 1.2), C1=(0.01*255)^2 and C2=(0.03*255)^2, clamped-edge extension, with window centers restricted to masked pixels.',
    limitation:
      'These are synthetic occlusions over resized CC0 photographs. The hidden source pixels are known by construction, but this is not ground truth for real object removal, because no real object was removed and no plausible replacement scene was annotated.',
  },
  artifactMethodology:
    'Lossless RGBA PNGs for the reference, magenta-occluded input, binary mask, and every method output. PNG and decoded RGBA SHA-256 hashes and dimensions are recorded.',
  invariants: [
    'Every output must preserve all unmasked RGBA pixels exactly.',
    'Every output must retain the 32x32 input dimensions.',
    'Only registered manifest assets may be used; a source, item-level metadata, or license hash mismatch aborts the run.',
  ],
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: os.cpus().length,
    runtime: 'Node.js CPU, synchronous single-threaded benchmark loop; no browser or GPU backend.',
  },
  aggregate,
  fixtures: fixtureResults,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`Wrote ${fixtureResults.length} cases to ${outputPath}\n`);
