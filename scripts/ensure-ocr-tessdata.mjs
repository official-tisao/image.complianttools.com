import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registerPath = path.join(root, 'docs', 'static-assets.json');
const tessdataRoot = path.join(root, 'apps', 'web', 'static', 'tessdata');
const tessdataCdn = 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@';
const aliases = new Map([['frk', 'deu_latf']]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function safeModelId(value) {
  return typeof value === 'string' && /^(?:[a-z0-9_-]+|script\/[A-Za-z0-9_-]+)$/.test(value);
}

function getRecord(records, modelId) {
  const filename = `${modelId}.traineddata`;
  const expectedPath = `apps/web/static/tessdata/${filename}`;
  const matches = records.filter((record) => record.path === expectedPath);
  if (matches.length !== 1)
    throw new Error(`Expected one registered OCR model row for ${expectedPath}.`);
  const [record] = matches;
  if (
    record.license !== 'Apache-2.0' ||
    !/^[a-f0-9]{40}$/.test(record.upstreamCommit ?? '') ||
    !/^[a-f0-9]{64}$/.test(record.sha256 ?? '') ||
    !Number.isSafeInteger(record.sizeBytes) ||
    record.sizeBytes <= 0
  ) {
    throw new Error(`OCR model registration is incomplete or invalid for ${expectedPath}.`);
  }
  const sourceUrl = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${record.upstreamCommit}/${filename}`;
  if (record.sourceUrl !== sourceUrl)
    throw new Error(`OCR source URL does not match the pinned file for ${expectedPath}.`);
  return record;
}

async function fileMatches(filePath, record) {
  if (!existsSync(filePath)) return false;
  const contents = await readFile(filePath);
  return contents.byteLength === record.sizeBytes && sha256(contents) === record.sha256;
}

/** Fetch only explicitly requested models and verify their registered size and SHA-256. */
export async function ensureOcrTessdata(
  modelIds,
  { fetchImpl = fetch, logger = console.log } = {},
) {
  if (!Array.isArray(modelIds) || modelIds.length === 0) {
    throw new Error('Pass one or more explicit tessdata model IDs; bulk downloads are disabled.');
  }
  const records = JSON.parse(await readFile(registerPath, 'utf8'));
  const requested = [...new Set(modelIds)];

  for (const requestedId of requested) {
    if (!safeModelId(requestedId)) throw new Error(`Invalid tessdata model ID: ${requestedId}.`);
    const modelId = aliases.get(requestedId) ?? requestedId;
    const record = getRecord(records, modelId);
    const filename = `${modelId}.traineddata`;
    const targetPath = path.resolve(tessdataRoot, filename);
    if (!targetPath.startsWith(`${path.resolve(tessdataRoot)}${path.sep}`)) {
      throw new Error(`Refusing to write OCR model outside tessdata: ${requestedId}.`);
    }

    if (await fileMatches(targetPath, record)) {
      logger(`OCR model cache verified: ${modelId} (${record.sizeBytes} bytes).`);
      continue;
    }

    if (modelId === 'script/Cyrillic') {
      throw new Error(
        'script/Cyrillic is blocked by the pinned CDN; restore its registered bundled file.',
      );
    }

    // jsDelivr denies script/Latin.traineddata (89 MB); retrieve that one from its
    // exact pinned official raw URL instead. The same registered size/hash gate applies.
    const url =
      modelId === 'script/Latin'
        ? record.sourceUrl
        : `${tessdataCdn}${record.upstreamCommit}/${filename}`;
    const response = await fetchImpl(url, { redirect: 'error' });
    if (!response.ok)
      throw new Error(`Could not fetch ${modelId} from the pinned CDN (HTTP ${response.status}).`);
    const contents = Buffer.from(await response.arrayBuffer());
    const actualHash = sha256(contents);
    if (contents.byteLength !== record.sizeBytes || actualHash !== record.sha256) {
      throw new Error(
        `Downloaded OCR model failed verification for ${modelId}: expected ${record.sizeBytes} bytes / ${record.sha256}; got ${contents.byteLength} bytes / ${actualHash}.`,
      );
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;
    try {
      await writeFile(temporaryPath, contents, { flag: 'wx' });
      await rename(temporaryPath, targetPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    logger(`OCR model downloaded and verified: ${modelId} (${record.sizeBytes} bytes).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await ensureOcrTessdata(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
