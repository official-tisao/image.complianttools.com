import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const register = JSON.parse(await readFile(path.join(root, 'docs/model-assets.json'), 'utf8'));
const approvedSourceAssetIds = new Set([
  'realesrgan-x4plus-v0.1.0',
  'realesrgan-x2plus-v0.2.1',
]);
const sourceAssets = register.assets.filter(
  (asset) => approvedSourceAssetIds.has(asset.id) && asset.filename.endsWith('.pth'),
);
if (sourceAssets.length !== approvedSourceAssetIds.size) {
  throw new Error('The model register must contain both exact owner-directed Real-ESRGAN source checkpoints.');
}
const outputDirectory = path.resolve(
  process.argv[2] ?? process.env.P4_MODEL_CACHE_DIR ?? path.join(os.tmpdir(), 'image-complianttools-models'),
);
await mkdir(outputDirectory, { recursive: true });

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

for (const asset of sourceAssets) {
  const destination = path.join(outputDirectory, asset.filename);
  const temporary = `${destination}.partial`;
  let bytes;
  try {
    bytes = await readFile(destination);
  } catch {
    bytes = undefined;
  }

  if (bytes && bytes.byteLength === asset.sizeBytes && sha256(bytes) === asset.sha256) {
    console.log(`${asset.filename}: cached and verified (${bytes.byteLength} bytes, SHA-256 ${asset.sha256})`);
    continue;
  }
  if (bytes) {
    throw new Error(
      `${asset.filename}: an existing cached file does not match the register; choose a clean output directory rather than overwriting it.`,
    );
  }

  const response = await fetch(asset.sourceUrl, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`${asset.filename}: download returned HTTP ${response.status}.`);
  const downloaded = new Uint8Array(await response.arrayBuffer());
  const actualHash = sha256(downloaded);
  if (downloaded.byteLength !== asset.sizeBytes) {
    throw new Error(`${asset.filename}: expected ${asset.sizeBytes} bytes, got ${downloaded.byteLength}.`);
  }
  if (actualHash !== asset.sha256) {
    throw new Error(`${asset.filename}: SHA-256 mismatch: expected ${asset.sha256}, got ${actualHash}.`);
  }
  await rm(temporary, { force: true });
  await writeFile(temporary, downloaded);
  await rename(temporary, destination);
  console.log(`${asset.filename}: downloaded and verified (${downloaded.byteLength} bytes, SHA-256 ${actualHash})`);
}

console.log(`REAL_ESRGAN_SOURCES_OK ${sourceAssets.length} source checkpoints in ${outputDirectory}`);
