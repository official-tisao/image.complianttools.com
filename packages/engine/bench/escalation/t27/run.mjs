#!/usr/bin/env node

// Reproducible T27 placement measurement over the four item-verified CC0 fixtures.
// The target boxes are subjective annotations made for this narrow comparison.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { init as initJpegDecoder } from '@jsquash/jpeg/decode.js';

import {
  CropOptionsSchema,
  cropRaster,
  decodeJpegToRaster,
  ResizeOptionsSchema,
  resizeRaster,
} from '../../../dist/index.js';
import {
  approximateSaliencyCropRect,
  centerCropRect,
  ruleOfThirdsCropRect,
  smartCropAnalysisSize,
} from '../../../dist/ops/smart-crop.js';

const directory = dirname(fileURLToPath(import.meta.url));
const cc0Directory = join(directory, '../fixtures/cc0');
const cc0ManifestPath = join(cc0Directory, 'manifest.json');
const outputPath = join(directory, 'results.json');
const targetRatio = 1;
const maxRoutePixels = 12_000_000;

// Reviewer-drawn normalized rectangles on the route-compatible decoded image.
// They identify one visible focal region per image; they are not objective labels.
const subjects = {
  'landscape-dordogne': {
    description: 'Bright foreground-left leafy tree canopy against the darker valley.',
    normalizedRect: { x: 0.055, y: 0.255, width: 0.275, height: 0.43 },
  },
  'oak-leaves': {
    description: 'The large central hanging cluster of illuminated new oak leaves and flowers.',
    normalizedRect: { x: 0.17, y: 0.12, width: 0.66, height: 0.72 },
  },
  'gold-weight': {
    description: 'The central cast geometric gold-weight object, including its outer body.',
    normalizedRect: { x: 0.19, y: 0.15, width: 0.62, height: 0.7 },
  },
  'rome-map': {
    description:
      'A compact high-density street-plan region near the center of the historic map; no landmark identity is asserted.',
    normalizedRect: { x: 0.36, y: 0.34, width: 0.28, height: 0.32 },
  },
};

const expectedAssetIds = Object.keys(subjects).sort();
const methods = ['center', 'thirds', 'approximate-saliency'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const asArrayBuffer = (bytes) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

await initJpegDecoder(
  await WebAssembly.compile(
    await readFile(
      new URL('../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', import.meta.url),
    ),
  ),
);

function assertContained(base, candidate, label) {
  const rel = relative(base, candidate);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`))
    throw new Error(`${label} escapes the registered CC0 fixture directory.`);
}

async function loadAndValidateManifest() {
  const bytes = await readFile(cc0ManifestPath);
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.schemaVersion !== 1 || manifest.license !== 'CC0-1.0')
    throw new Error('Expected the registered CC0-1.0 source manifest.');
  const actualIds = manifest.assets.map((asset) => asset.id).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedAssetIds))
    throw new Error(`Expected exactly these four CC0 fixtures: ${expectedAssetIds.join(', ')}.`);

  for (const asset of manifest.assets) {
    if (asset.license !== 'CC0-1.0') throw new Error(`${asset.id} is not registered as CC0-1.0.`);
    const imagePath = join(cc0Directory, asset.path);
    assertContained(cc0Directory, imagePath, `${asset.id} source image`);
    const imageBytes = await readFile(imagePath);
    if (imageBytes.byteLength !== asset.sizeBytes || sha256(imageBytes) !== asset.sha256)
      throw new Error(`Registered source size/hash mismatch for ${asset.id}.`);

    const metadataPath = join(cc0Directory, asset.metadataSnapshot);
    assertContained(cc0Directory, metadataPath, `${asset.id} metadata snapshot`);
    const metadataBytes = await readFile(metadataPath);
    if (sha256(metadataBytes) !== asset.metadataSnapshotSha256)
      throw new Error(`Registered item-level metadata hash mismatch for ${asset.id}.`);
    const metadata = JSON.parse(metadataBytes.toString('utf8'));
    const confirmsCC0 =
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
    if (!confirmsCC0) throw new Error(`Item-level metadata does not confirm CC0 for ${asset.id}.`);
  }

  return { manifest, manifestSha256: sha256(bytes) };
}

function routeCompatibleInput(source) {
  if (source.width * source.height <= maxRoutePixels) {
    return {
      image: source,
      preparation: { applied: false, reason: 'Source is within the route 12-megapixel limit.' },
    };
  }

  // The Dordogne source is 14.03 MP and would be rejected by T27. This fixed
  // Lanczos3 derivative is below the route's 12 MP ceiling and preserves aspect.
  const width = 4096;
  const height = 2728;
  const image = resizeRaster(
    source,
    ResizeOptionsSchema.parse({
      mode: 'pixels',
      width,
      height,
      lockAspect: false,
      algorithm: 'lanczos3',
      allowUpscale: false,
      roundTo: 1,
      maxPixels: maxRoutePixels,
    }),
  );
  if (image.width * image.height > maxRoutePixels)
    throw new Error('Prepared fixture exceeds the route 12-megapixel limit.');
  return {
    image,
    preparation: {
      applied: true,
      method:
        'Production resizeRaster with Lanczos3; user-facing dimensions are unchanged by T27 itself.',
      width,
      height,
      rgbaSha256: sha256(image.frames[0].data),
    },
  };
}

function focalMetrics(box, crop) {
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const intersectionWidth = Math.max(
    0,
    Math.min(right, crop.x + crop.width) - Math.max(left, crop.x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(bottom, crop.y + crop.height) - Math.max(top, crop.y),
  );
  const retainedFraction =
    (intersectionWidth * intersectionHeight) / Math.max(1, box.width * box.height);
  const dx = (left + box.width / 2 - (crop.x + crop.width / 2)) / crop.width;
  const dy = (top + box.height / 2 - (crop.y + crop.height / 2)) / crop.height;
  return {
    retainedFraction,
    subjectCenterOffsetInCropUnits: { x: dx, y: dy, euclidean: Math.hypot(dx, dy) },
  };
}

function integerPixelCrop(image, crop) {
  const width = Math.max(1, Math.round(crop.width));
  const height = Math.max(1, Math.round(crop.height));
  const x = Math.min(image.width - width, Math.max(0, Math.round(crop.x)));
  const y = Math.min(image.height - height, Math.max(0, Math.round(crop.y)));
  const output = cropRaster(
    image,
    CropOptionsSchema.parse({ mode: 'rect', x, y, width, height, outputRounding: 1 }),
  );
  return { output, integerRect: { x, y, width: output.width, height: output.height } };
}

function getCrop(method, image) {
  const center = centerCropRect(image.width, image.height, targetRatio);
  if (method === 'center') return center;
  if (method === 'thirds') return ruleOfThirdsCropRect(image.width, image.height, center);

  const analysis = smartCropAnalysisSize(image.width, image.height);
  // The Svelte route creates this preview through canvas.drawImage. The headless
  // runner uses the same bounded dimensions and the production Lanczos3 resizer;
  // the scorer itself is the same production approximateSaliencyCropRect call.
  const analysisImage = resizeRaster(
    image,
    ResizeOptionsSchema.parse({
      mode: 'pixels',
      width: analysis.width,
      height: analysis.height,
      lockAspect: false,
      algorithm: 'lanczos3',
      allowUpscale: false,
      roundTo: 1,
      maxPixels: analysis.width * analysis.height,
    }),
  );
  return approximateSaliencyCropRect(
    center,
    {
      width: analysisImage.width,
      height: analysisImage.height,
      data: analysisImage.frames[0].data,
    },
    analysis.scale,
  );
}

const { manifest, manifestSha256 } = await loadAndValidateManifest();
const fixtures = [];
for (const asset of manifest.assets) {
  const bytes = new Uint8Array(await readFile(join(cc0Directory, asset.path)));
  const decoded = await decodeJpegToRaster(asArrayBuffer(bytes));
  if (decoded.width !== asset.dimensions.width || decoded.height !== asset.dimensions.height)
    throw new Error(`Decoded dimensions disagree with the CC0 manifest for ${asset.id}.`);

  const { image, preparation } = routeCompatibleInput(decoded);
  const subject = subjects[asset.id];
  const targetBox = {
    x: subject.normalizedRect.x * image.width,
    y: subject.normalizedRect.y * image.height,
    width: subject.normalizedRect.width * image.width,
    height: subject.normalizedRect.height * image.height,
  };
  const measurements = [];

  for (const method of methods) {
    const crop = getCrop(method, image);
    const { output, integerRect } = integerPixelCrop(image, crop);
    const metrics = focalMetrics(targetBox, crop);
    measurements.push({
      method,
      cropRect: crop,
      rasterizedCropRect: integerRect,
      outputDimensions: { width: output.width, height: output.height },
      targetBoxRetentionFraction: metrics.retainedFraction,
      subjectCenterOffsetInCropUnits: metrics.subjectCenterOffsetInCropUnits,
      outputRgbaSha256: sha256(output.frames[0].data),
    });
  }

  const outputSizes = new Set(
    measurements.map((item) => `${item.outputDimensions.width}x${item.outputDimensions.height}`),
  );
  if (outputSizes.size !== 1)
    throw new Error(`T27 methods must use the same fixed crop dimensions for ${asset.id}.`);
  if (
    measurements.some(
      (item) => Math.abs(item.cropRect.width / item.cropRect.height - targetRatio) > 1e-9,
    )
  ) {
    throw new Error(`A T27 crop did not preserve the fixed target ratio for ${asset.id}.`);
  }

  fixtures.push({
    id: asset.id,
    source: {
      title: asset.title,
      creator: asset.creator,
      license: asset.license,
      licenseEvidence: asset.licenseEvidence,
      sourcePageUrl: asset.sourcePageUrl,
      relativePath: `../fixtures/cc0/${asset.path}`,
      byteLength: bytes.byteLength,
      sha256: asset.sha256,
      originalDimensions: { width: decoded.width, height: decoded.height },
      metadataSnapshotPath: `../fixtures/cc0/${asset.metadataSnapshot}`,
      metadataSnapshotSha256: asset.metadataSnapshotSha256,
    },
    routeInput: {
      width: image.width,
      height: image.height,
      megapixels: (image.width * image.height) / 1_000_000,
      preparation,
      decodedRgbaSha256: sha256(decoded.frames[0].data),
      preparedRgbaSha256: sha256(image.frames[0].data),
    },
    annotation: {
      reviewer: 'Project reviewer; manually drawn after visual inspection.',
      subject: subject.description,
      normalizedRect: subject.normalizedRect,
      pixelRect: targetBox,
      note: 'This single-reviewer target is subjective and is not a visual-quality or preference label.',
    },
    measurements,
  });
  process.stderr.write(`measured ${asset.id}\n`);
}

const aggregate = Object.fromEntries(
  methods.map((method) => {
    const samples = fixtures.map((fixture) =>
      fixture.measurements.find((item) => item.method === method),
    );
    const mean = (select) =>
      samples.reduce((sum, sample) => sum + select(sample), 0) / samples.length;
    return [
      method,
      {
        fixtureCount: samples.length,
        meanTargetBoxRetentionFraction: mean((sample) => sample.targetBoxRetentionFraction),
        meanSubjectCenterOffsetEuclideanCropUnits: mean(
          (sample) => sample.subjectCenterOffsetInCropUnits.euclidean,
        ),
      },
    ];
  }),
);

const scriptBytes = await readFile(fileURLToPath(import.meta.url));
const report = {
  schemaVersion: 1,
  benchmark: 'P4-21 T27 Smart Crop placement vs reviewer-drawn focal boxes',
  recordedAt: new Date().toISOString(),
  runnerSha256: sha256(scriptBytes),
  sourceManifestPath: '../fixtures/cc0/manifest.json',
  sourceManifestSha256: manifestSha256,
  sourceCount: fixtures.length,
  caseCount: fixtures.length * methods.length,
  assetPolicy:
    'Uses only the four individually registered CC0-1.0 image fixtures and their local item-level metadata snapshots. No new assets or downloads are used.',
  setup: {
    targetAspectRatio: '1:1 square',
    cropGeometry:
      'Largest square crop permitted by each route input; placement functions receive the full prepared source dimensions.',
    routeInputLimitPixels: maxRoutePixels,
    analysisPreview:
      'smartCropAnalysisSize (maximum side 256); Lanczos3 production resizeRaster in this headless runner.',
    comparedMethods: methods,
    output:
      'Production cropRaster applied to the route crop rectangle rounded to integer pixel coordinates and dimensions.',
    outputHash:
      'SHA-256 over exact output RGBA bytes; output image files are not persisted to avoid copying large photo crops.',
    fixedSizeInvariant:
      'The runner aborts if the three methods disagree on output dimensions for an asset or if any selected crop differs from the 1:1 ratio.',
  },
  methodology: {
    cropFunctions:
      'Uses the production centerCropRect, ruleOfThirdsCropRect, smartCropAnalysisSize, and approximateSaliencyCropRect functions imported from packages/engine/dist/ops/smart-crop.js, the same module imported by T27SmartCrop.svelte.',
    retention:
      'Area of the reviewer-drawn rectangle intersecting the floating-point selected crop divided by the full rectangle area; range 0–1.',
    offset:
      'Reviewer-box center relative to crop center, with x divided by crop width and y divided by crop height; Euclidean value is descriptive and is not treated as a preference score.',
    annotation:
      'A single project reviewer manually drew one normalized box per image before comparing crop outputs. Boxes are subjective; no second annotator, user study, or visual-quality grading was used.',
    dordogneInput:
      'The 14.03 MP Dordogne source exceeds the T27 12 MP route limit; it is deterministically resized with production Lanczos3 resizeRaster to 4096x2728 before crop analysis. The other three source dimensions are used unchanged.',
    saliencyInput:
      'The web route obtains its <=256 px saliency preview through canvas.drawImage. This headless runner uses production Lanczos3 resizeRaster at the same preview dimensions, so exact preview pixels can differ from a browser canvas; the production saliency scorer and crop geometry functions are unchanged.',
    limitations:
      'This four-image, one-box-per-image measurement compares rectangle retention and box-center position only. It does not measure visual quality, semantic subject detection, or user preference and does not establish performance on other images or aspect ratios.',
  },
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    runtime:
      'Node.js CPU; deterministic crop and geometry calculations, no network or model runtime.',
  },
  aggregate,
  fixtures,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
