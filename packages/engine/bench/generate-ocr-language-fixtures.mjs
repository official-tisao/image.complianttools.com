import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OCR_FIXTURE_HEIGHT,
  OCR_FIXTURE_WIDTH,
  ocrLanguageFixtures,
} from './ocr-language-fixtures.mjs';

const repositoryDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtureDirectory = path.resolve(
  repositoryDirectory,
  'packages/engine/bench/fixtures/ocr-language',
);
const manifestPath = path.join(fixtureDirectory, 'manifest.json');
const rootRequire = createRequire(path.join(repositoryDirectory, 'package.json'));
const { chromium } = rootRequire('@playwright/test');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function verifyFixtures() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.fixtures.length !== ocrLanguageFixtures.length) {
    throw new Error(`Expected ${ocrLanguageFixtures.length} OCR fixtures in ${manifestPath}.`);
  }
  for (const spec of ocrLanguageFixtures) {
    const asset = manifest.fixtures.find((fixture) => fixture.language === spec.language);
    if (
      !asset ||
      asset.groundTruth !== spec.text ||
      asset.requestedFontStack !== spec.font ||
      asset.dimensions?.width !== OCR_FIXTURE_WIDTH ||
      asset.dimensions?.height !== OCR_FIXTURE_HEIGHT
    ) {
      throw new Error(`The manifest does not match the declared ${spec.language} fixture recipe.`);
    }
    const fixturePath = path.resolve(repositoryDirectory, asset.path);
    const relativePath = path.relative(fixtureDirectory, fixturePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Refusing to read an OCR fixture outside ${fixtureDirectory}.`);
    }
    const bytes = await readFile(fixturePath);
    if (
      bytes.byteLength !== asset.sizeBytes ||
      sha256(bytes) !== asset.pngSha256 ||
      bytes.toString('ascii', 1, 4) !== 'PNG' ||
      bytes.readUInt32BE(16) !== OCR_FIXTURE_WIDTH ||
      bytes.readUInt32BE(20) !== OCR_FIXTURE_HEIGHT
    ) {
      throw new Error(`The OCR fixture bytes, hash, or dimensions do not match: ${asset.path}.`);
    }
  }
  process.stdout.write(`Verified ${manifest.fixtures.length} persisted OCR language fixtures.\n`);
}

if (process.argv.includes('--verify')) {
  await verifyFixtures();
} else {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const generated = await page.evaluate(
      async ({ fixtures, width, height }) =>
        Promise.all(
          fixtures.map(async (fixture) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas 2D context is unavailable.');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, width, height);
            context.fillStyle = '#111';
            context.font = `48px ${fixture.font}`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(fixture.text, width / 2, height / 2, width - 48);
            const pixels = context.getImageData(0, 0, width, height).data;
            const view = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
            let rgbaBinary = '';
            for (let offset = 0; offset < view.length; offset += 32_768) {
              rgbaBinary += String.fromCharCode(...view.subarray(offset, offset + 32_768));
            }
            return {
              ...fixture,
              pngBase64: canvas.toDataURL('image/png').slice('data:image/png;base64,'.length),
              rgbaBase64: btoa(rgbaBinary),
            };
          }),
        ),
      {
        fixtures: ocrLanguageFixtures,
        width: OCR_FIXTURE_WIDTH,
        height: OCR_FIXTURE_HEIGHT,
      },
    );
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const manifest = {
      schemaVersion: 1,
      purpose: 'Self-generated OCR text-recognition fixtures; no scanned or third-party images.',
      renderer: {
        browser: `Chromium ${browser.version()}`,
        userAgent,
        method:
          'Canvas 2D, white background, #111 text, centered, 48 CSS px, PNG encoded losslessly.',
        dimensions: { width: OCR_FIXTURE_WIDTH, height: OCR_FIXTURE_HEIGHT },
      },
      fixtures: [],
    };

    await mkdir(fixtureDirectory, { recursive: true });
    for (const fixture of generated) {
      const png = Buffer.from(fixture.pngBase64, 'base64');
      const relativePath = `packages/engine/bench/fixtures/ocr-language/${fixture.language}.png`;
      const fixturePath = path.resolve(repositoryDirectory, relativePath);
      await writeFile(fixturePath, png);
      manifest.fixtures.push({
        language: fixture.language,
        groundTruth: fixture.text,
        requestedFontStack: fixture.font,
        dimensions: { width: OCR_FIXTURE_WIDTH, height: OCR_FIXTURE_HEIGHT },
        path: relativePath,
        sizeBytes: png.byteLength,
        pngSha256: sha256(png),
        rgbaSha256: sha256(Buffer.from(fixture.rgbaBase64, 'base64')),
      });
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await verifyFixtures();
  } finally {
    await browser.close();
  }
}
