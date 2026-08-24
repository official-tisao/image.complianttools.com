import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractRawCameraPreview } from '../packages/engine/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'packages/engine/test/fixtures/raw-real-corpus.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const outputDirectory = path.resolve(process.argv[2] ?? path.join(root, '.cache/raw-corpus'));
const maximumFileBytes = 64 * 1024 * 1024;

if (manifest.files.length < 15)
  throw new Error('The real RAW corpus must contain at least 15 files.');
const vendors = new Set(manifest.files.map((entry) => entry.vendor));
if (vendors.size < 8) throw new Error('The real RAW corpus must cover at least 8 camera vendors.');
if (manifest.license !== 'CC0-1.0') throw new Error('The real RAW corpus must remain CC0.');

await mkdir(outputDirectory, { recursive: true });

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function loadVerified(entry) {
  const destination = path.join(outputDirectory, entry.filename);
  try {
    const cached = await readFile(destination);
    if (digest(cached) === entry.sha256) return cached;
  } catch {
    // Missing cache entries are downloaded below.
  }

  const temporary = `${destination}.partial`;
  await rm(temporary, { force: true });
  const response = await globalThis.fetch(entry.url, {
    signal: globalThis.AbortSignal.timeout(300_000),
  });
  if (!response.ok)
    throw new Error(`${entry.filename}: download returned HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumFileBytes)
    throw new Error(`${entry.filename}: declared size exceeds the 64 MiB corpus limit.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumFileBytes)
    throw new Error(`${entry.filename}: downloaded size exceeds the 64 MiB corpus limit.`);
  const actual = digest(bytes);
  if (actual !== entry.sha256)
    throw new Error(`${entry.filename}: expected SHA-256 ${entry.sha256}, received ${actual}.`);
  await writeFile(temporary, bytes);
  await rm(destination, { force: true });
  await rename(temporary, destination);
  return bytes;
}

const results = [];
for (const entry of manifest.files) {
  const bytes = await loadVerified(entry);
  let preview;
  try {
    preview = extractRawCameraPreview(bytes);
  } catch (error) {
    throw new Error(`${entry.filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (
    preview.label !== 'camera preview' ||
    preview.bytes.length < 4 ||
    preview.bytes[0] !== 0xff ||
    preview.bytes[1] !== 0xd8 ||
    preview.bytes.at(-2) !== 0xff ||
    preview.bytes.at(-1) !== 0xd9
  )
    throw new Error(
      `${entry.filename}: extractor did not return a complete labelled JPEG preview.`,
    );
  results.push(`${entry.vendor}/${entry.model} ${entry.format} ${preview.bytes.length}B preview`);
}

console.log(`RAW_CORPUS_OK ${results.length} files ${vendors.size} vendors`);
for (const result of results) console.log(result);
