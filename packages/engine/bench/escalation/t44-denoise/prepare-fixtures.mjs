#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { init as initJpegDecoder } from '@jsquash/jpeg/decode.js';
import { init as initPngEncoder } from '@jsquash/png/encode.js';
import {
  CropOptionsSchema,
  ResizeOptionsSchema,
  cropRaster,
  decodeJpegToRaster,
  encodeRasterAsPng,
  resizeRaster,
} from '../../../dist/index.js';

const directory = dirname(fileURLToPath(import.meta.url));
const cc0Directory = join(directory, '../fixtures/cc0');
const manifestPath = join(directory, 'fixtures/manifest.json');
const fixtureDirectory = join(directory, 'fixtures');
const side = 128;
const cropSide = 256;

const cropBySource = {
  'landscape-dordogne': { x: 2050, y: 1260 },
  'oak-leaves': { x: 1700, y: 1080 },
  'gold-weight': { x: 1010, y: 790 },
  'rome-map': { x: 1420, y: 640 },
};

const noiseDefinitions = [
  { id: 'gaussian-sigma12', kind: 'gaussian', sigma: 12 },
  { id: 'gaussian-sigma24', kind: 'gaussian', sigma: 24 },
  { id: 'impulse-2pct', kind: 'impulse', density: 0.02 },
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const asArrayBuffer = (bytes) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

function seedFromLabel(label) {
  return Number.parseInt(sha256(Buffer.from(label, 'utf8')).slice(0, 8), 16) >>> 0;
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function gaussianGenerator(random) {
  let spare;
  return () => {
    if (spare !== undefined) {
      const value = spare;
      spare = undefined;
      return value;
    }
    let first = random();
    while (first <= Number.EPSILON) first = random();
    const second = random();
    const radius = Math.sqrt(-2 * Math.log(first));
    const angle = 2 * Math.PI * second;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

function addNoise(reference, definition, seed) {
  const source = reference.frames[0].data;
  const output = source.slice();
  const random = randomGenerator(seed);
  const gaussian = definition.kind === 'gaussian' ? gaussianGenerator(random) : undefined;

  for (let offset = 0; offset < source.length; offset += 4) {
    if (definition.kind === 'impulse') {
      if (random() >= definition.density) continue;
      const value = random() < 0.5 ? 0 : 255;
      output[offset] = value;
      output[offset + 1] = value;
      output[offset + 2] = value;
      continue;
    }
    output[offset] = Math.max(0, Math.min(255, Math.round(source[offset] + definition.sigma * gaussian())));
    output[offset + 1] = Math.max(0, Math.min(255, Math.round(source[offset + 1] + definition.sigma * gaussian())));
    output[offset + 2] = Math.max(0, Math.min(255, Math.round(source[offset + 2] + definition.sigma * gaussian())));
  }
  return { ...reference, frames: [{ ...reference.frames[0], data: output }] };
}

async function initializeCodecs() {
  await Promise.all([
    initJpegDecoder(
      await WebAssembly.compile(
        await readFile(new URL('../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', import.meta.url)),
      ),
    ),
    initPngEncoder(
      await WebAssembly.compile(
        await readFile(new URL('../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url)),
      ),
    ),
  ]);
}

async function verifySourceAssets() {
  const manifest = JSON.parse(await readFile(join(cc0Directory, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.license !== 'CC0-1.0') {
    throw new Error('Expected the registered CC0-1.0 corpus manifest.');
  }
  const assets = [...manifest.assets].sort((left, right) => left.id.localeCompare(right.id));
  const expectedIds = Object.keys(cropBySource).sort();
  if (JSON.stringify(assets.map((asset) => asset.id)) !== JSON.stringify(expectedIds)) {
    throw new Error('The registered CC0 source set changed; review this benchmark before regeneration.');
  }

  for (const asset of assets) {
    if (asset.license !== 'CC0-1.0') throw new Error(asset.id + ' is not item-registered as CC0-1.0.');
    const imageBytes = await readFile(join(cc0Directory, asset.path));
    if (imageBytes.byteLength !== asset.sizeBytes || sha256(imageBytes) !== asset.sha256) {
      throw new Error('Registered source image size/hash mismatch: ' + asset.id);
    }
    const metadataBytes = await readFile(join(cc0Directory, asset.metadataSnapshot));
    if (sha256(metadataBytes) !== asset.metadataSnapshotSha256) {
      throw new Error('Registered source metadata hash mismatch: ' + asset.id);
    }
    const metadata = JSON.parse(metadataBytes.toString('utf8'));
    const isCommons = asset.metadataApiUrl.includes('commons.wikimedia.org');
    const isCleveland = asset.metadataApiUrl.includes('openaccess-api.clevelandart.org');
    const provesCc0 = isCommons
      ? Object.values(metadata.query?.pages ?? {}).some((page) =>
          page?.imageinfo?.some((info) =>
            info?.extmetadata?.LicenseShortName?.value === 'CC0' &&
            /^https?:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0(?:\/|$)/.test(info?.extmetadata?.LicenseUrl?.value ?? ''),
          ),
        )
      : isCleveland && metadata.data?.share_license_status === 'CC0';
    if (!provesCc0) throw new Error('Preserved item metadata does not prove CC0 for ' + asset.id);
  }
  return assets;
}

async function encodePng(image) {
  return new Uint8Array(await encodeRasterAsPng(image));
}

async function persistArtifact(relativePath, image, checkOnly) {
  const bytes = await encodePng(image);
  const targetPath = join(fixtureDirectory, relativePath);
  const record = {
    path: 'fixtures/' + relativePath.replaceAll('\\', '/'),
    width: image.width,
    height: image.height,
    pngBytes: bytes.byteLength,
    pngSha256: sha256(bytes),
    rgbaSha256: sha256(image.frames[0].data),
  };
  if (checkOnly) {
    const persisted = await readFile(targetPath);
    if (!persisted.equals(Buffer.from(bytes))) throw new Error('Fixture bytes are not reproducible: ' + relativePath);
  } else {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bytes);
  }
  return record;
}

export async function prepareFixtures({ checkOnly = false } = {}) {
  await initializeCodecs();
  const sourceAssets = await verifySourceAssets();
  const fixtures = [];
  const sourceRecords = [];

  for (const asset of sourceAssets) {
    const sourceBytes = await readFile(join(cc0Directory, asset.path));
    const source = await decodeJpegToRaster(asArrayBuffer(sourceBytes));
    if (source.width !== asset.dimensions.width || source.height !== asset.dimensions.height) {
      throw new Error('Decoded dimensions disagree with the source registration: ' + asset.id);
    }
    const crop = cropBySource[asset.id];
    if (crop.x < 0 || crop.y < 0 || crop.x + cropSide > source.width || crop.y + cropSide > source.height) {
      throw new Error('Fixture crop exceeds the registered source image: ' + asset.id);
    }
    const cropped = cropRaster(
      source,
      CropOptionsSchema.parse({ mode: 'rect', x: crop.x, y: crop.y, width: cropSide, height: cropSide, outputRounding: 1 }),
    );
    const reference = resizeRaster(
      cropped,
      ResizeOptionsSchema.parse({
        mode: 'pixels', width: side, height: side, lockAspect: false, algorithm: 'lanczos3',
        allowUpscale: true, roundTo: 1, maxPixels: 1_000_000,
      }),
    );
    const sourceRecord = {
      id: asset.id,
      title: asset.title,
      creator: asset.creator,
      license: asset.license,
      licenseEvidence: asset.licenseEvidence,
      sourceUrl: asset.sourceUrl,
      sourcePageUrl: asset.sourcePageUrl,
      imagePath: '../fixtures/cc0/' + asset.path,
      imageBytes: asset.sizeBytes,
      imageSha256: asset.sha256,
      metadataPath: '../fixtures/cc0/' + asset.metadataSnapshot,
      metadataSha256: asset.metadataSnapshotSha256,
      dimensions: asset.dimensions,
    };
    sourceRecords.push(sourceRecord);

    for (const definition of noiseDefinitions) {
      const id = asset.id + '-' + definition.id;
      const seed = seedFromLabel('p4-21-t44-denoise-v1/' + id);
      const noisy = addNoise(reference, definition, seed);
      const cleanPath = id + '-reference.png';
      const noisyPath = id + '-input.png';
      const referenceArtifact = await persistArtifact(cleanPath, reference, checkOnly);
      const inputArtifact = await persistArtifact(noisyPath, noisy, checkOnly);
      fixtures.push({
        id,
        sourceId: asset.id,
        cropPixelsInSource: { x: crop.x, y: crop.y, width: cropSide, height: cropSide },
        derivation: {
          decoder: '@jsquash/jpeg decoder pinned by pnpm-lock.yaml; decoded to 8-bit sRGB RGBA.',
          resizer: 'Production resizeRaster Lanczos3 from the exact registered source crop.',
          outputDimensions: { width: side, height: side },
          noise: { ...definition, seedAlgorithm: 'first uint32 from SHA-256 of the versioned fixture ID' },
          alpha: 'Preserved unchanged from the clean reference.',
        },
        seed,
        noise: definition,
        reference: referenceArtifact,
        input: inputArtifact,
      });
    }
  }

  const manifest = {
    schemaVersion: 1,
    benchmark: 'P4-21 T44 denoise on deterministic synthetic noise derived from registered CC0 images',
    generatedAt: 'reproducible; no wall-clock timestamp',
    sourceCorpusManifest: '../fixtures/cc0/manifest.json',
    sourceCorpusLicense: 'CC0-1.0, individually registered and metadata-hash verified',
    outputDimensions: { width: side, height: side },
    sourceCropPixels: { width: cropSide, height: cropSide },
    fixtures: {
      count: fixtures.length,
      artifactsPerCase: 2,
      entries: fixtures,
    },
    sources: sourceRecords,
  };
  const serialized = JSON.stringify(manifest, null, 2) + '\n';
  if (checkOnly) {
    const current = await readFile(manifestPath, 'utf8');
    if (current !== serialized) throw new Error('Fixture manifest is not reproducible.');
  } else {
    await mkdir(fixtureDirectory, { recursive: true });
    await writeFile(manifestPath, serialized);
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const checkOnly = process.argv.includes('--verify');
  const manifest = await prepareFixtures({ checkOnly });
  process.stdout.write(
    (checkOnly ? 'T44_FIXTURES_REPRODUCIBLE ' : 'T44_FIXTURES_WRITTEN ') +
      manifest.fixtures.count + ' cases; ' + manifest.sources.length + ' registered CC0 sources.\n',
  );
}
