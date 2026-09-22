import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const register = JSON.parse(
  await readFile(path.join(repositoryRoot, 'docs/static-assets.json'), 'utf8'),
);
const tessdataRows = register.filter((row) => row.path.startsWith('apps/web/static/tessdata/'));
const lazyRows = tessdataRows.filter((row) => row.delivery === 'lazy-cdn');
const latinPath = 'apps/web/static/tessdata/script/Latin.traineddata';
const cyrillicPath = 'apps/web/static/tessdata/script/Cyrillic.traineddata';
const latin = tessdataRows.find((row) => row.path === latinPath);
const cyrillic = tessdataRows.find((row) => row.path === cyrillicPath);

if (!latin?.deliveryUrl || !latin.sourceUrl || !cyrillic) {
  throw new Error('The pinned OCR catalogue is missing its Latin or bundled Cyrillic record.');
}

async function head(url) {
  return fetch(url, {
    method: 'HEAD',
    headers: { 'accept-encoding': 'identity' },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
}

function assertTransport(response, expectedSize, { expectJsDelivrVersion = false } = {}) {
  const size = Number(response.headers.get('content-length'));
  if (
    response.status !== 200 ||
    size !== expectedSize ||
    response.headers.get('content-type') !== 'application/octet-stream' ||
    response.headers.get('access-control-allow-origin') !== '*' ||
    response.headers.get('cross-origin-resource-policy') !== 'cross-origin' ||
    response.headers.get('content-encoding') !== null
  ) {
    throw new Error(
      `Unexpected model transport response: ${JSON.stringify({
        status: response.status,
        size,
        expectedSize,
        contentType: response.headers.get('content-type'),
        allowOrigin: response.headers.get('access-control-allow-origin'),
        resourcePolicy: response.headers.get('cross-origin-resource-policy'),
        contentEncoding: response.headers.get('content-encoding'),
      })}`,
    );
  }
  if (expectJsDelivrVersion && response.headers.get('x-jsd-version') !== expectJsDelivrVersion) {
    throw new Error(
      `jsDelivr served an unexpected revision: ${response.headers.get('x-jsd-version')}.`,
    );
  }
}

const localCyrillicPath = path.resolve(repositoryRoot, cyrillicPath);
const cyrillicBytes = await readFile(localCyrillicPath);
const cyrillicSha256 = createHash('sha256').update(cyrillicBytes).digest('hex');
if (cyrillicBytes.byteLength !== cyrillic.sizeBytes || cyrillicSha256 !== cyrillic.sha256) {
  throw new Error(
    `Bundled Cyrillic data failed its register check: got ${cyrillicBytes.byteLength} bytes / ${cyrillicSha256}.`,
  );
}

let next = 0;
const cdnResults = new Array(lazyRows.length);
async function checkCdnWorker() {
  while (true) {
    const index = next++;
    if (index >= lazyRows.length) return;
    const row = lazyRows[index];
    try {
      cdnResults[index] = { row, response: await head(row.deliveryUrl) };
    } catch (error) {
      cdnResults[index] = { row, error };
    }
  }
}
await Promise.all(Array.from({ length: 8 }, () => checkCdnWorker()));

const latinCdn = cdnResults.find(({ row }) => row.path === latinPath);
if (!latinCdn || latinCdn.error || latinCdn.response.status !== 403) {
  throw new Error('Expected the pinned jsDelivr Latin model URL to return its known HTTP 403.');
}
assertTransport(await head(latin.sourceUrl), latin.sizeBytes);

let passedCdn = 0;
const unexpected = [];
for (const result of cdnResults) {
  if (result.row.path === latinPath) continue;
  if (result.error) {
    unexpected.push({ path: result.row.path, error: String(result.error) });
    continue;
  }
  try {
    assertTransport(result.response, result.row.sizeBytes, {
      expectJsDelivrVersion: result.row.upstreamCommit,
    });
    passedCdn++;
  } catch (error) {
    unexpected.push({ path: result.row.path, error: String(error) });
  }
}

if (unexpected.length > 0) {
  throw new Error(`Unexpected OCR CDN catalogue failures: ${JSON.stringify(unexpected, null, 2)}`);
}

console.log(
  `OCR model sources verified: ${passedCdn}/${lazyRows.length - 1} pinned jsDelivr entries pass HEAD size/version/CORS/CORP checks; Latin jsDelivr is 403 and its pinned raw source passes; bundled Cyrillic is ${cyrillicBytes.byteLength} bytes with a matching SHA-256. No model binaries were downloaded.`,
);
