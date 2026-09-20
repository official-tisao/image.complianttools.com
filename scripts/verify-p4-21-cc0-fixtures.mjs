import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/engine/bench/escalation/fixtures/cc0',
);
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const seenIds = new Set();
const seenPaths = new Set();

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

for (const asset of manifest.assets) {
  if (seenIds.has(asset.id)) throw new Error(`Duplicate fixture ID: ${asset.id}`);
  if (seenPaths.has(asset.path)) throw new Error(`Duplicate fixture path: ${asset.path}`);
  seenIds.add(asset.id);
  seenPaths.add(asset.path);

  if (asset.license !== 'CC0-1.0' || manifest.license !== 'CC0-1.0') {
    throw new Error(`${asset.id}: fixture is not registered as CC0-1.0.`);
  }
  for (const field of ['sourceUrl', 'sourcePageUrl', 'metadataApiUrl', 'licenseEvidence']) {
    if (typeof asset[field] !== 'string' || asset[field].length === 0) {
      throw new Error(`${asset.id}: missing ${field} provenance.`);
    }
  }
  if (path.basename(asset.path) !== asset.path || path.basename(asset.metadataSnapshot) !== asset.metadataSnapshot) {
    throw new Error(`${asset.id}: fixture path must stay in the registered corpus directory.`);
  }

  const image = await readFile(path.join(directory, asset.path));
  if (image.byteLength !== asset.sizeBytes) throw new Error(`${asset.id}: byte-size mismatch.`);
  if (sha256(image) !== asset.sha256) throw new Error(`${asset.id}: SHA-256 mismatch.`);
  if (image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
    throw new Error(`${asset.id}: expected a JPEG fixture.`);
  }

  const metadataBytes = await readFile(path.join(directory, asset.metadataSnapshot));
  if (sha256(metadataBytes) !== asset.metadataSnapshotSha256) {
    throw new Error(`${asset.id}: metadata snapshot SHA-256 mismatch.`);
  }
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  if (asset.metadataApiUrl.includes('commons.wikimedia.org')) {
    const page = Object.values(metadata.query?.pages ?? {})[0];
    const imageInfo = page?.imageinfo?.[0];
    const ext = imageInfo?.extmetadata;
    if (
      ext?.LicenseShortName?.value !== 'CC0' ||
      !/^https?:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0/.test(
        String(ext?.LicenseUrl?.value ?? ''),
      )
    ) {
      throw new Error(`${asset.id}: Commons metadata does not prove CC0.`);
    }
    if (imageInfo.width !== asset.dimensions.width || imageInfo.height !== asset.dimensions.height) {
      throw new Error(`${asset.id}: dimensions do not match Commons metadata.`);
    }
  } else if (asset.metadataApiUrl.includes('openaccess-api.clevelandart.org')) {
    const record = metadata.data;
    if (record?.share_license_status !== 'CC0') {
      throw new Error(`${asset.id}: Cleveland Museum API does not prove CC0.`);
    }
    const matchingImage = Object.values(record.images ?? {}).some(
      (imageRecord) =>
        imageRecord &&
        Number(imageRecord.width) === asset.dimensions.width &&
        Number(imageRecord.height) === asset.dimensions.height &&
        imageRecord.url === asset.sourceUrl,
    );
    if (!matchingImage) throw new Error(`${asset.id}: selected rendition does not match API metadata.`);
  } else {
    throw new Error(`${asset.id}: unrecognized metadata source.`);
  }
}

console.log(`CC0_FIXTURES_OK ${manifest.assets.length} assets: content, hashes, dimensions, and item-level CC0 metadata verified.`);
