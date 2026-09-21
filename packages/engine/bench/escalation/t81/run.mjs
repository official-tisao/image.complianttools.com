#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { init as initPngDecoder } from '@jsquash/png/decode.js';
import { init as initPngEncoder } from '@jsquash/png/encode.js';

import {
  cropRaster,
  CropOptionsSchema,
  decodePngToRaster,
  encodeRasterAsPng,
  resizeRaster,
  ResizeOptionsSchema,
  saliencyRetarget,
} from '../../../dist/index.js';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(directory, 'fixtures');
const inputDirectory = join(fixtureDirectory, 'inputs');
const artifactDirectory = join(directory, 'artifacts');
const manifestPath = join(fixtureDirectory, 'manifest.json');
const resultsPath = join(directory, 'results.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

execFileSync(process.execPath, [join(directory, 'generate-fixtures.mjs'), '--verify'], {
  stdio: 'inherit',
});

await Promise.all([
  initPngDecoder(
    await WebAssembly.compile(
      await readFile(
        new URL(
          '../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
          import.meta.url,
        ),
      ),
    ),
  ),
  initPngEncoder(
    await WebAssembly.compile(
      await readFile(
        new URL(
          '../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
          import.meta.url,
        ),
      ),
    ),
  ),
]);
await mkdir(artifactDirectory, { recursive: true });

const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));

function resize(image, width, height) {
  return resizeRaster(
    image,
    ResizeOptionsSchema.parse({
      mode: 'pixels',
      width,
      height,
      lockAspect: false,
      algorithm: 'lanczos3',
      allowUpscale: true,
      roundTo: 1,
      maxPixels: 100_000_000,
    }),
  );
}

function decodePng(bytes) {
  return decodePngToRaster(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}

async function loadFixture(entry) {
  const inputBytes = await readFile(join(inputDirectory, entry.input.fileName));
  const maskBytes = await readFile(join(inputDirectory, entry.subjectMask.fileName));
  if (
    inputBytes.byteLength !== entry.input.sizeBytes ||
    sha256(inputBytes) !== entry.input.pngSha256 ||
    maskBytes.byteLength !== entry.subjectMask.sizeBytes ||
    sha256(maskBytes) !== entry.subjectMask.pngSha256
  ) {
    throw new Error(`${entry.id}: input or subject-mask PNG hash mismatch.`);
  }
  return {
    input: await decodePng(inputBytes),
    subjectMask: await decodePng(maskBytes),
  };
}

function makeProtectMask(maskRaster) {
  const rgba = maskRaster.frames[0].data;
  const mask = new Uint8ClampedArray(maskRaster.width * maskRaster.height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const offset = pixel * 4;
    if (rgba[offset] > 200 || rgba[offset + 1] > 200) mask[pixel] = 255;
  }
  return mask;
}

function subjectPredicate(palette) {
  if (palette === 'magenta') return (r, g, b) => r > 120 && g < 90 && b > 70;
  if (palette === 'cyan') return (r, g, b) => r < 80 && g > 100 && b > 90;
  throw new Error(`Unknown subject palette ${palette}.`);
}

function measureSubject(image, palette) {
  const data = image.frames[0].data;
  const matches = subjectPredicate(palette);
  let count = 0;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (!matches(data[offset], data[offset + 1], data[offset + 2])) continue;
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
    }
  }
  if (count === 0) {
    return { pixelCount: 0, bbox: null, centroid: null, bboxAspectRatio: null };
  }
  const bbox = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  return {
    pixelCount: count,
    bbox,
    centroid: { x: sumX / count, y: sumY / count },
    bboxAspectRatio: bbox.width / bbox.height,
  };
}

async function saveOutput(image, filename) {
  const bytes = new Uint8Array(await encodeRasterAsPng(image));
  await writeFile(join(artifactDirectory, filename), bytes);
  return {
    path: `artifacts/${filename}`,
    width: image.width,
    height: image.height,
    sizeBytes: bytes.byteLength,
    pngSha256: sha256(bytes),
    rgbaSha256: sha256(image.frames[0].data),
  };
}

function centerCrop(image, targetWidth, targetHeight) {
  const targetAspect = targetWidth / targetHeight;
  const inputAspect = image.width / image.height;
  let cropWidth = image.width;
  let cropHeight = image.height;
  if (inputAspect > targetAspect) cropWidth = Math.round(image.height * targetAspect);
  else cropHeight = Math.round(image.width / targetAspect);
  const x = Math.floor((image.width - cropWidth) / 2);
  const y = Math.floor((image.height - cropHeight) / 2);
  const cropped = cropRaster(
    image,
    CropOptionsSchema.parse({ mode: 'rect', x, y, width: cropWidth, height: cropHeight }),
  );
  return cropped.width === targetWidth && cropped.height === targetHeight
    ? cropped
    : resize(cropped, targetWidth, targetHeight);
}

function cropRetention(object, cropX, cropY, cropWidth, cropHeight) {
  const left = Math.max(object.x, cropX);
  const top = Math.max(object.y, cropY);
  const right = Math.min(object.x + object.width, cropX + cropWidth);
  const bottom = Math.min(object.y + object.height, cropY + cropHeight);
  const retainedWidth = Math.max(0, right - left);
  const retainedHeight = Math.max(0, bottom - top);
  return (retainedWidth * retainedHeight) / (object.width * object.height);
}

const caseResults = [];
for (const fixture of manifest.fixtures) {
  const { input, subjectMask } = await loadFixture(fixture);
  const target = fixture.target;
  const expectedAreaScale = (target.width / input.width) * (target.height / input.height);
  const centerCropWidth = Math.round(input.height * (target.width / target.height));
  const centerCropX = Math.floor((input.width - centerCropWidth) / 2);
  const protectMask = makeProtectMask(subjectMask);
  const variants = [
    { id: 'lanczos3-resize', image: resize(input, target.width, target.height) },
    { id: 'center-crop', image: centerCrop(input, target.width, target.height) },
    {
      id: 'saliency-retarget',
      image: saliencyRetarget(input, { targetWidth: target.width, targetHeight: target.height }),
    },
    {
      id: 'saliency-retarget-protect-mask',
      image: saliencyRetarget(input, {
        targetWidth: target.width,
        targetHeight: target.height,
        protectMask,
      }),
    },
  ];

  const methodResults = [];
  for (const variant of variants) {
    const filename = `${fixture.id}-${variant.id}.png`;
    const artifact = await saveOutput(variant.image, filename);
    const objects = fixture.objects.map((object) => {
      const measured = measureSubject(variant.image, object.palette);
      const sourceAspect = object.width / object.height;
      const idealResizeCenterX = ((object.x + (object.width - 1) / 2) / input.width) * target.width;
      const cropExpectedRetention = cropRetention(
        object,
        centerCropX,
        0,
        centerCropWidth,
        input.height,
      );
      return {
        id: object.id,
        sourceBBox: { x: object.x, y: object.y, width: object.width, height: object.height },
        annotatedInputPixels: object.annotatedPixels,
        measuredOutputPixels: measured.pixelCount,
        outputPixelRetentionRatio: Number(
          (measured.pixelCount / object.annotatedPixels).toFixed(4),
        ),
        expectedUniformResizePixelRatio: Number(expectedAreaScale.toFixed(4)),
        expectedCenterCropAreaRetentionRatio: Number(cropExpectedRetention.toFixed(4)),
        outputBBox: measured.bbox,
        outputCentroid: measured.centroid,
        outputBBoxAspectRatio:
          measured.bboxAspectRatio === null ? null : Number(measured.bboxAspectRatio.toFixed(4)),
        sourceBBoxAspectRatio: Number(sourceAspect.toFixed(4)),
        bboxAspectChangePercent:
          measured.bboxAspectRatio === null
            ? null
            : Number(((measured.bboxAspectRatio / sourceAspect - 1) * 100).toFixed(2)),
        centroidOffsetFromProportionalResizePx:
          measured.centroid === null
            ? null
            : Number((measured.centroid.x - idealResizeCenterX).toFixed(2)),
        detected: measured.pixelCount > 0,
      };
    });
    const alpha = variant.image.frames[0].data;
    let opaquePixels = 0;
    for (let offset = 3; offset < alpha.length; offset += 4)
      if (alpha[offset] === 255) opaquePixels += 1;
    methodResults.push({
      method: variant.id,
      artifact,
      passesTargetGeometry:
        variant.image.width === target.width && variant.image.height === target.height,
      opaquePixelCount: opaquePixels,
      allSubjectsDetected: objects.every((object) => object.detected),
      objects,
    });
  }

  caseResults.push({
    id: fixture.id,
    input: {
      path: `fixtures/inputs/${fixture.input.fileName}`,
      width: input.width,
      height: input.height,
      pngSha256: fixture.input.pngSha256,
      rgbaSha256: fixture.input.rgbaSha256,
    },
    subjectMask: {
      path: `fixtures/inputs/${fixture.subjectMask.fileName}`,
      pngSha256: fixture.subjectMask.pngSha256,
      rgbaSha256: fixture.subjectMask.rgbaSha256,
    },
    target,
    expectations: fixture.expectedConstraints,
    methods: methodResults,
  });
  process.stderr.write(`benchmarked ${fixture.id}\n`);
}

const aggregate = {};
for (const method of [
  'lanczos3-resize',
  'center-crop',
  'saliency-retarget',
  'saliency-retarget-protect-mask',
]) {
  const rows = caseResults.flatMap((fixture) =>
    fixture.methods
      .find((entry) => entry.method === method)
      .objects.map((object) => ({
        ...object,
        geometryPass: fixture.methods.find((entry) => entry.method === method).passesTargetGeometry,
      })),
  );
  aggregate[method] = {
    outputGeometryPassCount: caseResults.filter(
      (fixture) => fixture.methods.find((entry) => entry.method === method).passesTargetGeometry,
    ).length,
    caseCount: caseResults.length,
    subjectCount: rows.length,
    detectedSubjectCount: rows.filter((row) => row.detected).length,
    meanSubjectPixelRetentionRatio: Number(
      (rows.reduce((sum, row) => sum + row.outputPixelRetentionRatio, 0) / rows.length).toFixed(4),
    ),
    meanAbsoluteBBoxAspectChangePercent: Number(
      (
        rows.reduce((sum, row) => sum + Math.abs(row.bboxAspectChangePercent ?? 100), 0) /
        rows.length
      ).toFixed(2),
    ),
    meanCentroidOffsetFromProportionalResizePx: Number(
      (
        rows.reduce(
          (sum, row) => sum + Math.abs(row.centroidOffsetFromProportionalResizePx ?? 0),
          0,
        ) / rows.length
      ).toFixed(2),
    ),
  };
}

const result = {
  schemaVersion: 1,
  benchmark: 'P4-21 T81 adaptive-resize geometry and subject-preservation comparison',
  recordedAt: new Date().toISOString(),
  fixtureManifest: {
    path: 'fixtures/manifest.json',
    sha256: sha256(manifestBytes),
    fixtureCount: manifest.fixtureCount,
  },
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    runtime: 'Node.js CPU, single-threaded benchmark loop; no GPU or model used.',
  },
  metricMethodology: {
    subjectDetection:
      'Exact known palette classes from generated synthetic subjects; Lanczos edge blends are handled by broad RGB predicates recorded in the fixture manifest.',
    bboxAspectChange:
      'Absolute percentage change between detected output subject bounding-box aspect ratio and its annotated input rectangle aspect ratio. Zero is ideal for shape preservation.',
    pixelRetention:
      'Detected subject-colour pixels divided by the subject rectangle area in the input. The uniform resize control has a theoretical area ratio of targetWidth/sourceWidth × targetHeight/sourceHeight; centered crop retention is computed from exact rectangle intersection.',
    centroid:
      'Horizontal subject centroid offset from the position under a uniform proportional resize to target width; it is diagnostic and not a perceptual score.',
  },
  limitations: [
    'Three self-generated scenes with simple annotated rectangular subjects do not represent natural photographs, portraits, text, or mixed saliency.',
    'There is no exact perceptual ground truth for retargeting; measures are geometry, known-class retention, and location diagnostics only.',
    'Center-crop is a conventional composition control and intentionally discards edge content; Lanczos3 is a conventional whole-frame resize control and intentionally changes aspect ratio.',
    'Results measure this CPU engine implementation and these 192x128 to 128x128 tasks only; they do not establish route behavior or larger-image performance.',
  ],
  aggregate,
  fixtures: caseResults,
};

await writeFile(resultsPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ aggregate: result.aggregate, fixtureCount: result.fixtures.length }, null, 2)}\n`,
);
