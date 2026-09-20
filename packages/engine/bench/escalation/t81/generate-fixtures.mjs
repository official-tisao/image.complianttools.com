#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { init as initPngDecoder } from '@jsquash/png/decode.js';
import { init as initPngEncoder } from '@jsquash/png/encode.js';

import { createRaster, decodePngToRaster, encodeRasterAsPng } from '../../../dist/index.js';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(directory, 'fixtures');
const artifactDirectory = join(fixtureDirectory, 'inputs');
const manifestPath = join(fixtureDirectory, 'manifest.json');
const width = 192;
const height = 128;
const targetWidth = 128;
const targetHeight = 128;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const cases = [
  {
    id: 'centered-subject',
    patternSeed: 11,
    objects: [{ id: 'subject-a', x: 68, y: 24, width: 56, height: 80, palette: 'magenta' }],
  },
  {
    id: 'left-subject',
    patternSeed: 23,
    objects: [{ id: 'subject-a', x: 12, y: 24, width: 50, height: 80, palette: 'magenta' }],
  },
  {
    id: 'edge-pair',
    patternSeed: 37,
    objects: [
      { id: 'subject-a', x: 10, y: 28, width: 50, height: 72, palette: 'magenta' },
      { id: 'subject-b', x: 132, y: 28, width: 50, height: 72, palette: 'cyan' },
    ],
  },
];

const palettes = {
  magenta: {
    base: [230, 28, 95],
    detail: [175, 22, 110],
    mask: [255, 0, 0],
  },
  cyan: {
    base: [20, 205, 195],
    detail: [25, 145, 150],
    mask: [0, 255, 0],
  },
};

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

function drawCase(scene, makeMask = false) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const shade = (x * 3 + y * 5 + scene.patternSeed) % 9;
      rgba[offset] = 34 + shade;
      rgba[offset + 1] = 50 + shade;
      rgba[offset + 2] = 76 + shade;
      rgba[offset + 3] = 255;
    }
  }

  for (const object of scene.objects) {
    const palette = palettes[object.palette];
    for (let localY = 0; localY < object.height; localY += 1) {
      for (let localX = 0; localX < object.width; localX += 1) {
        const x = object.x + localX;
        const y = object.y + localY;
        const offset = (y * width + x) * 4;
        if (makeMask) {
          rgba[offset] = palette.mask[0];
          rgba[offset + 1] = palette.mask[1];
          rgba[offset + 2] = palette.mask[2];
          rgba[offset + 3] = 255;
          continue;
        }
        const border =
          localX < 2 || localY < 2 || localX >= object.width - 2 || localY >= object.height - 2;
        const grid = localX % 8 === 0 || localY % 8 === 0;
        const checker =
          (Math.floor(localX / 6) + Math.floor(localY / 6) + scene.patternSeed) % 2 === 0;
        const detail = border || grid || checker;
        const color = detail ? palette.detail : palette.base;
        rgba[offset] = color[0];
        rgba[offset + 1] = color[1];
        rgba[offset + 2] = color[2];
        rgba[offset + 3] = 255;
      }
    }
  }
  return createRaster(width, height, rgba);
}

async function save(image, fileName) {
  const png = new Uint8Array(await encodeRasterAsPng(image));
  await writeFile(join(artifactDirectory, fileName), png);
  return {
    fileName,
    width: image.width,
    height: image.height,
    sizeBytes: png.byteLength,
    pngSha256: sha256(png),
    rgbaSha256: sha256(image.frames[0].data),
  };
}

async function verify() {
  const scriptBytes = await readFile(fileURLToPath(import.meta.url));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.generator.scriptSha256 !== sha256(scriptBytes))
    throw new Error('T81 fixture generator changed; regenerate inputs and manifest.');
  if (manifest.fixtures.length !== cases.length)
    throw new Error(`Expected ${cases.length} T81 cases.`);
  for (const fixture of manifest.fixtures) {
    for (const key of ['input', 'subjectMask']) {
      const entry = fixture[key];
      const bytes = await readFile(join(artifactDirectory, entry.fileName));
      if (bytes.byteLength !== entry.sizeBytes || sha256(bytes) !== entry.pngSha256)
        throw new Error(`${fixture.id} ${key}: PNG bytes or SHA-256 mismatch.`);
      const raster = await decodePngToRaster(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      if (
        raster.width !== entry.width ||
        raster.height !== entry.height ||
        sha256(raster.frames[0].data) !== entry.rgbaSha256
      ) {
        throw new Error(`${fixture.id} ${key}: decoded dimensions or RGBA hash mismatch.`);
      }
    }
  }
  process.stdout.write(`Verified ${manifest.fixtures.length} generated T81 input/mask pairs.\n`);
}

if (process.argv.includes('--verify')) {
  await verify();
} else {
  await mkdir(artifactDirectory, { recursive: true });
  const fixtures = [];
  for (const scene of cases) {
    const input = drawCase(scene);
    const subjectMask = drawCase(scene, true);
    const inputArtifact = await save(input, `${scene.id}-input.png`);
    const maskArtifact = await save(subjectMask, `${scene.id}-mask.png`);
    fixtures.push({
      id: scene.id,
      source: 'Self-generated deterministic synthetic scene; no third-party assets.',
      width,
      height,
      target: { width: targetWidth, height: targetHeight },
      patternSeed: scene.patternSeed,
      background: 'Dark low-detail field with deterministic per-pixel shade variation.',
      subjectPattern:
        'High-contrast two-colour grid/checker pattern inside each annotated rectangle.',
      objects: scene.objects.map((object) => ({
        ...object,
        annotatedPixels: object.width * object.height,
        outputDetectionPredicate:
          object.palette === 'magenta'
            ? 'R > 120 && G < 90 && B > 70'
            : 'R < 80 && G > 100 && B > 90',
      })),
      expectedConstraints: [
        `Each output should be exactly ${targetWidth}x${targetHeight}.`,
        'Every annotated subject should remain detectable and inside the output frame.',
        'Report each subject bounding-box aspect change, pixel retention, and centroid against the source annotation.',
      ],
      input: inputArtifact,
      subjectMask: maskArtifact,
    });
    process.stderr.write(`generated ${scene.id}\n`);
  }
  const scriptBytes = await readFile(fileURLToPath(import.meta.url));
  const manifest = {
    schemaVersion: 1,
    benchmark: 'P4-21 T81 saliency-weighted adaptive-resize synthetic fixtures',
    generator: {
      script: 'packages/engine/bench/escalation/t81/generate-fixtures.mjs',
      scriptSha256: sha256(scriptBytes),
      node: process.version,
      inputDimensions: { width, height },
      targetDimensions: { width: targetWidth, height: targetHeight },
      scenarios: cases.map(({ id, patternSeed, objects }) => ({ id, patternSeed, objects })),
      transformations: {
        saliencyRetarget:
          'Engine saliencyRetarget with no mask and with a binary mask marking all subject rectangles.',
        resizeControl: 'Engine resizeRaster Lanczos3 directly to the target dimensions.',
        cropControl:
          'Centered crop to the target aspect ratio, followed by Lanczos3 resize if needed.',
      },
    },
    fixtureCount: fixtures.length,
    fixtures,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Generated ${fixtures.length} deterministic T81 synthetic fixtures.\n`);
}
