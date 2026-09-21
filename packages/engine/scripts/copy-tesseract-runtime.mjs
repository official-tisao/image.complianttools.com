import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const engineDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(engineDirectory, '../..');
const engineRequire = createRequire(resolve(engineDirectory, 'package.json'));

const tesseractEntry = engineRequire.resolve('tesseract.js');
const tesseractDirectory = resolve(dirname(tesseractEntry), '..');
const tesseractPackage = JSON.parse(
  await readFile(resolve(tesseractDirectory, 'package.json'), 'utf8'),
);
if (tesseractPackage.version !== '7.0.0') {
  throw new Error(`Expected tesseract.js 7.0.0, found ${tesseractPackage.version}`);
}

const tesseractRequire = createRequire(resolve(tesseractDirectory, 'package.json'));
const corePackagePath = tesseractRequire.resolve('tesseract.js-core/package.json');
const coreDirectory = dirname(corePackagePath);
const corePackage = JSON.parse(await readFile(corePackagePath, 'utf8'));
if (corePackage.version !== '7.0.0') {
  throw new Error(`Expected tesseract.js-core 7.0.0, found ${corePackage.version}`);
}
if (tesseractPackage.version !== corePackage.version) {
  throw new Error(
    `Tesseract.js and tesseract.js-core versions must match for the versioned OCR runtime path; got ${tesseractPackage.version} and ${corePackage.version}.`,
  );
}

const runtimeVersion = `v${tesseractPackage.version}`;
const targetDirectory = resolve(repositoryDirectory, 'apps/web/static/ocr-runtime', runtimeVersion);
await writeFile(
  resolve(engineDirectory, 'src/ocr-runtime-version.ts'),
  `/** Keep in sync with the Tesseract.js and Tesseract.js-core versions copied into static assets. */\nexport const OCR_RUNTIME_VERSION = '${runtimeVersion}' as const;\n`,
);

const files = [
  {
    source: resolve(tesseractDirectory, 'dist/worker.min.js'),
    name: 'worker.min.js',
    repository: 'tesseract.js',
    upstreamPath: 'dist/worker.min.js',
    revision: '42eae669e4b3a66429d8516f078912cc747a89df',
  },
  ...[
    'tesseract-core-lstm',
    'tesseract-core-simd-lstm',
    'tesseract-core-relaxedsimd-lstm',
    // The OSD helper uses worker.detect(), which Tesseract.js 7 only exposes with
    // the legacy core. These variants are copied locally and loaded only in helper mode.
    'tesseract-core',
    'tesseract-core-simd',
    'tesseract-core-relaxedsimd',
  ].flatMap((stem) =>
    ['wasm.js', 'wasm'].map((extension) => ({
      source: resolve(coreDirectory, `${stem}.${extension}`),
      name: `${stem}.${extension}`,
      repository: 'tesseract.js-core',
      upstreamPath: `${stem}.${extension}`,
      revision: 'acffef2b66eb44a31df297e11d905f4b39001068',
    })),
  ),
];

await mkdir(targetDirectory, { recursive: true });
const rows = [];
for (const file of files) {
  await copyFile(file.source, resolve(targetDirectory, file.name));
  const copiedPath = resolve(targetDirectory, file.name);
  const [contents, details] = await Promise.all([readFile(copiedPath), stat(copiedPath)]);
  const owner = file.repository === 'tesseract.js' ? 'tesseract.js' : 'tesseract.js-core';
  const sourceUrl = `https://raw.githubusercontent.com/naptha/${file.repository}/${file.revision}/${file.upstreamPath}`;
  rows.push({
    path: `apps/web/static/ocr-runtime/${runtimeVersion}/${file.name}`,
    sourceUrl,
    license: 'Apache-2.0',
    licenseUrl: `https://github.com/naptha/${owner}/blob/${file.revision}/LICENSE`,
    sha256: createHash('sha256').update(contents).digest('hex'),
    dateChecked: new Date().toISOString().slice(0, 10),
    sizeBytes: details.size,
  });
}

process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
