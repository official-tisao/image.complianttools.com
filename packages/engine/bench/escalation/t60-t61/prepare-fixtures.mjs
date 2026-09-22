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
const fixtureDirectory = join(directory, 'fixtures');
const artifactDirectory = join(fixtureDirectory, 'artifacts');
const manifestPath = join(fixtureDirectory, 'manifest.json');
const cc0Directory = join(directory, '../fixtures/cc0');
const cc0ManifestPath = join(cc0Directory, 'manifest.json');
const side = 128;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function initCodecs() {
  await Promise.all([
    initJpegDecoder(
      await WebAssembly.compile(
        await readFile(
          new URL(
            '../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',
            import.meta.url,
          ),
        ),
      ),
    ),
    initJpegEncoder(
      await WebAssembly.compile(
        await readFile(
          new URL(
            '../../../node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
            import.meta.url,
          ),
        ),
      ),
    ),
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
  const x = Math.floor((image.width - length) / 2);
  const y = Math.floor((image.height - length) / 2);
  return cropRaster(
    image,
    CropOptionsSchema.parse({
      mode: 'rect',
      x,
      y,
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
  const input = image.frames[0].data;
  const output = input.slice();
  for (let offset = 0; offset < output.length; offset += 4) {
    output[offset] = Math.min(255, output[offset] + amount);
    output[offset + 1] = Math.min(255, output[offset + 1] + amount);
    output[offset + 2] = Math.min(255, output[offset + 2] + amount);
  }
  return createRaster(image.width, image.height, output);
}

async function savePng(image, filename) {
  const bytes = new Uint8Array(await encodeRasterAsPng(image));
  await writeFile(join(artifactDirectory, filename), bytes);
  return {
    path: `fixtures/artifacts/${filename}`,
    width: image.width,
    height: image.height,
    sizeBytes: bytes.byteLength,
    pngSha256: sha256(bytes),
    rgbaSha256: sha256(image.frames[0].data),
  };
}

async function verifyManifest() {
  await initCodecs();
  const cc0ManifestBytes = await readFile(cc0ManifestPath);
  const cc0Manifest = JSON.parse(cc0ManifestBytes.toString('utf8'));
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const generatorBytes = await readFile(fileURLToPath(import.meta.url));
  if (manifest.generator.scriptSha256 !== sha256(generatorBytes))
    throw new Error('T60/T61 fixture generator changed; regenerate the manifest and artifacts.');
  if (manifest.sourceManifestSha256 !== sha256(cc0ManifestBytes))
    throw new Error('The registered CC0 manifest changed; regenerate T60/T61 fixtures.');
  if (manifest.fixtures.length !== cc0Manifest.assets.length * 6)
    throw new Error('Expected one reference and five labeled variants per CC0 source.');

  const sources = new Map(cc0Manifest.assets.map((asset) => [asset.id, asset]));
  for (const fixture of manifest.fixtures) {
    const source = sources.get(fixture.sourceAssetId);
    if (!source || source.sha256 !== fixture.sourceSha256)
      throw new Error(`Missing or changed CC0 source registration for ${fixture.id}.`);
    const bytes = await readFile(join(fixtureDirectory, 'artifacts', fixture.fileName));
    if (bytes.byteLength !== fixture.sizeBytes || sha256(bytes) !== fixture.pngSha256)
      throw new Error(`PNG bytes or SHA-256 mismatch for ${fixture.id}.`);
    const decoded = await decodePngToRaster(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    if (
      decoded.width !== fixture.width ||
      decoded.height !== fixture.height ||
      sha256(decoded.frames[0].data) !== fixture.rgbaSha256
    ) {
      throw new Error(`Decoded dimensions or RGBA SHA-256 mismatch for ${fixture.id}.`);
    }
  }
  process.stdout.write(
    `Verified ${manifest.fixtures.length} derived T60/T61 fixtures against ${sources.size} registered CC0 sources.\n`,
  );
}

if (process.argv.includes('--verify')) {
  await verifyManifest();
} else {
  await initCodecs();
  const cc0ManifestBytes = await readFile(cc0ManifestPath);
  const cc0Manifest = JSON.parse(cc0ManifestBytes.toString('utf8'));
  await mkdir(artifactDirectory, { recursive: true });
  const fixtures = [];
  const definitions = [
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

  for (const asset of cc0Manifest.assets) {
    const sourceBytes = new Uint8Array(await readFile(join(cc0Directory, asset.path)));
    if (sha256(sourceBytes) !== asset.sha256)
      throw new Error(`CC0 source SHA-256 mismatch for ${asset.id}.`);
    const decoded = await decodeJpegToRaster(
      sourceBytes.buffer.slice(
        sourceBytes.byteOffset,
        sourceBytes.byteOffset + sourceBytes.byteLength,
      ),
    );
    const reference = resize(centerSquare(decoded), side, side);
    const compressed90 = await decodeJpegToRaster(
      await encodeRasterAsJpeg(reference, { quality: 90, progressive: false }),
    );
    const compressed45 = await decodeJpegToRaster(
      await encodeRasterAsJpeg(reference, { quality: 45, progressive: false }),
    );
    const cropped = resize(cropCenteredPercent(reference, 90), side, side);
    const variants = [
      {
        id: 'reference',
        image: reference,
        relation: 'reference',
        parameters: definitions[0].parameters,
      },
      {
        id: 'exact-copy',
        image: cloneRaster(reference),
        relation: 'same-source-positive',
        parameters: definitions[1].parameters,
      },
      {
        id: 'jpeg-q90',
        image: compressed90,
        relation: 'same-source-positive',
        parameters: definitions[2].parameters,
      },
      {
        id: 'jpeg-q45',
        image: compressed45,
        relation: 'same-source-positive',
        parameters: definitions[3].parameters,
      },
      {
        id: 'center-crop-90',
        image: cropped,
        relation: 'same-source-positive',
        parameters: definitions[4].parameters,
      },
      {
        id: 'brightness-plus-12',
        image: addBrightness(reference, 12),
        relation: 'same-source-positive',
        parameters: definitions[5].parameters,
      },
    ];

    for (const variant of variants) {
      const fileName = `${asset.id}-${variant.id}.png`;
      const artifact = await savePng(variant.image, fileName);
      fixtures.push({
        id: `${asset.id}-${variant.id}`,
        sourceAssetId: asset.id,
        sourceSha256: asset.sha256,
        license: 'CC0-1.0 source; generated derivative for benchmark use',
        relation: variant.relation,
        variantId: variant.id,
        label: definitions.find((definition) => definition.id === variant.id).label,
        transformation: variant.parameters,
        fileName,
        width: artifact.width,
        height: artifact.height,
        sizeBytes: artifact.sizeBytes,
        pngSha256: artifact.pngSha256,
        rgbaSha256: artifact.rgbaSha256,
      });
    }
    process.stderr.write(`prepared ${asset.id}: reference plus five variants\n`);
  }

  const generatorBytes = await readFile(fileURLToPath(import.meta.url));
  const manifest = {
    schemaVersion: 1,
    benchmark: 'P4-21 T60 comparison and T61 duplicate retrieval',
    sourceManifest: '../fixtures/cc0/manifest.json',
    sourceManifestSha256: sha256(cc0ManifestBytes),
    generator: {
      script: 'packages/engine/bench/escalation/t60-t61/prepare-fixtures.mjs',
      scriptSha256: sha256(generatorBytes),
      node: process.version,
      normalizedDimensions: { width: side, height: side },
      normalization:
        'Center square crop of each individually registered CC0 source, followed by engine Lanczos3 resize to 128x128. This deliberately fixes dimensions for metric and hash comparison; it is not a production preprocessing recommendation.',
      transforms: definitions,
      variantLabels:
        'All variants except reference share the sourceAssetId and are labeled same-source positives for the controlled T61 relation task; cross-source pairs are negatives.',
    },
    fixtureCount: fixtures.length,
    fixtures,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `Prepared ${fixtures.length} derived fixtures from ${cc0Manifest.assets.length} registered CC0 sources.\n`,
  );
}
