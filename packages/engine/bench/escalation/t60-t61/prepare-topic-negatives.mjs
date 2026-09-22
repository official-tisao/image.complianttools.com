#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { init as initJpegDecoder } from '@jsquash/jpeg/decode.js';
import { init as initJpegEncoder } from '@jsquash/jpeg/encode.js';
import { init as initPngDecoder } from '@jsquash/png/decode.js';
import { init as initPngEncoder } from '@jsquash/png/encode.js';

import {
  cloneRaster,
  createRaster,
  cropRaster,
  CropOptionsSchema,
  decodeJpegToRaster,
  decodePngToRaster,
  encodeRasterAsJpeg,
  encodeRasterAsPng,
  resizeRaster,
  ResizeOptionsSchema,
} from '../../../dist/index.js';

const directory = dirname(fileURLToPath(import.meta.url));
const corpusDirectory = join(directory, 'fixtures', 'topic-negatives');
const sourceDirectory = join(corpusDirectory, 'sources');
const artifactDirectory = join(corpusDirectory, 'artifacts');
const sourceManifestPath = join(corpusDirectory, 'source-manifest.json');
const manifestPath = join(corpusDirectory, 'manifest.json');
const side = 128;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function initCodecs() {
  const jpegDecoder = await WebAssembly.compile(
    await readFile(
      new URL('../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', import.meta.url),
    ),
  );
  const jpegEncoder = await WebAssembly.compile(
    await readFile(
      new URL('../../../node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', import.meta.url),
    ),
  );
  const pngCodec = await WebAssembly.compile(
    await readFile(
      new URL('../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url),
    ),
  );
  await Promise.all([
    initJpegDecoder(jpegDecoder),
    initJpegEncoder(jpegEncoder),
    initPngDecoder(pngCodec),
    initPngEncoder(pngCodec),
  ]);
}

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

function centerSquare(image) {
  const length = Math.min(image.width, image.height);
  return cropRaster(
    image,
    CropOptionsSchema.parse({
      mode: 'rect',
      x: Math.floor((image.width - length) / 2),
      y: Math.floor((image.height - length) / 2),
      width: length,
      height: length,
      outputRounding: 1,
    }),
  );
}

function cropCenteredPercent(image, retainedPercent) {
  const retained = Math.floor((side * retainedPercent) / 100);
  const inset = Math.floor((side - retained) / 2);
  return cropRaster(
    image,
    CropOptionsSchema.parse({
      mode: 'rect',
      x: inset,
      y: inset,
      width: retained,
      height: retained,
      outputRounding: 1,
    }),
  );
}

function addBrightness(image, amount) {
  const output = image.frames[0].data.slice();
  for (let offset = 0; offset < output.length; offset += 4) {
    output[offset] = Math.min(255, output[offset] + amount);
    output[offset + 1] = Math.min(255, output[offset + 1] + amount);
    output[offset + 2] = Math.min(255, output[offset + 2] + amount);
  }
  return createRaster(image.width, image.height, output);
}

const transforms = [
  {
    id: 'reference',
    label: 'Normalized CC0 reference',
    parameters: { operation: 'center-square crop, then Lanczos3 resize to 128x128' },
  },
  {
    id: 'exact-copy',
    label: 'Exact pixel duplicate',
    parameters: { operation: 'copy normalized reference pixels without edits' },
  },
  {
    id: 'jpeg-q90',
    label: 'Same-source JPEG re-encode, quality 90',
    parameters: { operation: 'MozJPEG encode/decode', quality: 90 },
  },
  {
    id: 'jpeg-q45',
    label: 'Same-source JPEG re-encode, quality 45',
    parameters: { operation: 'MozJPEG encode/decode', quality: 45 },
  },
  {
    id: 'center-crop-90',
    label: 'Same-source centered 90% crop, restored to 128x128',
    parameters: {
      operation: 'center crop 90% width/height, then Lanczos3 resize to 128x128',
      retainedPercent: 90,
    },
  },
  {
    id: 'brightness-plus-12',
    label: 'Same-source RGB brightness shift',
    parameters: { operation: 'add 12 to each RGB channel with 255 clamp', amount: 12 },
  },
];

async function readRegistrations() {
  const bytes = await readFile(sourceManifestPath);
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.license !== 'CC0-1.0' || manifest.assets.length !== 2)
    throw new Error('Expected two individually registered CC0 topic-negative sources.');
  for (const asset of manifest.assets) {
    const sourceBytes = new Uint8Array(await readFile(join(sourceDirectory, asset.path)));
    if (sourceBytes.byteLength !== asset.sizeBytes || sha256(sourceBytes) !== asset.sha256)
      throw new Error(`CC0 source byte/hash mismatch for ${asset.id}.`);
    const metadataBytes = await readFile(join(sourceDirectory, asset.metadataSnapshot));
    if (sha256(metadataBytes) !== asset.metadataSnapshotSha256)
      throw new Error(`CC0 metadata snapshot hash mismatch for ${asset.id}.`);
    const snapshot = JSON.parse(metadataBytes.toString('utf8'));
    const page = Object.values(snapshot.query.pages)[0];
    const info = page.imageinfo[0];
    if (
      info.extmetadata.LicenseShortName.value !== 'CC0' ||
      !info.extmetadata.LicenseUrl.value.includes('publicdomain/zero/1.0') ||
      info.thumburl !== asset.sourceUrl ||
      info.thumbwidth !== asset.dimensions.width ||
      info.thumbheight !== asset.dimensions.height
    ) {
      throw new Error(`Item-level CC0 or thumbnail metadata check failed for ${asset.id}.`);
    }
  }
  return { bytes, manifest };
}

async function savePng(image, fileName) {
  const bytes = new Uint8Array(await encodeRasterAsPng(image));
  await writeFile(join(artifactDirectory, fileName), bytes);
  return {
    width: image.width,
    height: image.height,
    sizeBytes: bytes.byteLength,
    pngSha256: sha256(bytes),
    rgbaSha256: sha256(image.frames[0].data),
  };
}

async function verify() {
  await initCodecs();
  const { bytes: sourceManifestBytes, manifest: sourceManifest } = await readRegistrations();
  const fixtureManifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(fixtureManifestBytes.toString('utf8'));
  const scriptBytes = await readFile(fileURLToPath(import.meta.url));
  if (manifest.sourceManifestSha256 !== sha256(sourceManifestBytes))
    throw new Error('Hard-negative source manifest hash mismatch; regenerate fixtures.');
  if (manifest.generator.scriptSha256 !== sha256(scriptBytes))
    throw new Error('Hard-negative fixture generator changed; regenerate fixtures.');
  if (manifest.fixtures.length !== sourceManifest.assets.length * transforms.length)
    throw new Error('Expected six fixtures per CC0 source.');
  for (const fixture of manifest.fixtures) {
    const source = sourceManifest.assets.find((asset) => asset.id === fixture.sourceAssetId);
    if (!source || source.sha256 !== fixture.sourceSha256)
      throw new Error(`Source registration mismatch for ${fixture.id}.`);
    const pngBytes = new Uint8Array(await readFile(join(artifactDirectory, fixture.fileName)));
    if (pngBytes.byteLength !== fixture.sizeBytes || sha256(pngBytes) !== fixture.pngSha256)
      throw new Error(`PNG bytes/hash mismatch for ${fixture.id}.`);
    const image = await decodePngToRaster(
      pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength),
    );
    if (
      image.width !== fixture.width ||
      image.height !== fixture.height ||
      sha256(image.frames[0].data) !== fixture.rgbaSha256
    ) {
      throw new Error(`Decoded dimensions or RGBA hash mismatch for ${fixture.id}.`);
    }
  }
  process.stdout.write(
    `Verified ${manifest.fixtures.length} topic-negative fixtures from ${sourceManifest.assets.length} CC0 items.\n`,
  );
}

if (process.argv.includes('--verify')) {
  await verify();
} else {
  await initCodecs();
  const { bytes: sourceManifestBytes, manifest: sourceManifest } = await readRegistrations();
  await mkdir(artifactDirectory, { recursive: true });
  const fixtures = [];
  for (const asset of sourceManifest.assets) {
    const sourceBytes = new Uint8Array(await readFile(join(sourceDirectory, asset.path)));
    const decoded = await decodeJpegToRaster(
      sourceBytes.buffer.slice(
        sourceBytes.byteOffset,
        sourceBytes.byteOffset + sourceBytes.byteLength,
      ),
    );
    const reference = resize(centerSquare(decoded), side, side);
    const jpeg90 = await decodeJpegToRaster(
      await encodeRasterAsJpeg(reference, { quality: 90, progressive: false }),
    );
    const jpeg45 = await decodeJpegToRaster(
      await encodeRasterAsJpeg(reference, { quality: 45, progressive: false }),
    );
    const variants = [
      reference,
      cloneRaster(reference),
      jpeg90,
      jpeg45,
      resize(cropCenteredPercent(reference, 90), side, side),
      addBrightness(reference, 12),
    ];
    for (const [index, image] of variants.entries()) {
      const transform = transforms[index];
      const fileName = `${asset.id}-${transform.id}.png`;
      const encoded = await savePng(image, fileName);
      fixtures.push({
        id: `${asset.id}-${transform.id}`,
        sourceAssetId: asset.id,
        sourceSha256: asset.sha256,
        relation: index === 0 ? 'reference' : 'same-source-positive',
        label: transform.label,
        transformation: transform.parameters,
        fileName,
        ...encoded,
      });
    }
  }
  const scriptBytes = await readFile(fileURLToPath(import.meta.url));
  const manifest = {
    schemaVersion: 1,
    benchmark: 'P4-21 T61 topic-matched distinct-source autumn-leaf negatives',
    sourceManifest: 'source-manifest.json',
    sourceManifestSha256: sha256(sourceManifestBytes),
    generator: {
      script: 'packages/engine/bench/escalation/t60-t61/prepare-topic-negatives.mjs',
      scriptSha256: sha256(scriptBytes),
      node: process.version,
      normalizedDimensions: { width: side, height: side },
      normalization:
        'Center square crop of each 960x640 CC0 thumbnail, then engine Lanczos3 resize to 128x128.',
      transforms,
      semanticNegativeDefinition:
        'The two distinct source photos share an autumn-leaf subject but have different composition and texture; cross-source pairs are topic-matched negatives. This does not claim they are near-identical visual hard negatives.',
    },
    fixtureCount: fixtures.length,
    fixtures,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `Prepared ${fixtures.length} topic-negative fixtures from ${sourceManifest.assets.length} CC0 items.\n`,
  );
}
