import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(directory, '../../../../..');
const require = createRequire(path.join(repoRoot, 'package.json'));
const { chromium } = require('@playwright/test');
const manifest = JSON.parse(await readFile(path.join(directory, 'fixtures/manifest.json'), 'utf8'));
const modelRegister = JSON.parse(
  await readFile(path.join(repoRoot, 'docs/model-assets.json'), 'utf8'),
);
const model = modelRegister.assets.find(
  (asset) => asset.id === 'opencv-zoo-yunet-face-detection-2023mar',
);
if (!model) throw new Error('The YuNet model is missing from the registered model asset file.');

const baseUrl = process.env.T57_BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const report = {
  schemaVersion: 1,
  benchmark: 'T57 real-browser inference over the generated synthetic face fixtures',
  scope: 'Synthetic functional/edge-case behavior only; not real-photo detection accuracy.',
  measuredAt: new Date().toISOString(),
  browser: `Chromium ${browser.version()}`,
  runner: {
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    server: 'local production preview',
  },
  model: {
    id: model.id,
    sourceUrl: model.sourceUrl,
    sizeBytes: model.sizeBytes,
    sha256: model.sha256,
    license: model.license,
  },
  corpus: {
    license: manifest.license,
    fixtureManifestSha256: createHash('sha256')
      .update(await readFile(path.join(directory, 'fixtures/manifest.json')))
      .digest('hex'),
    fixtures: [],
  },
};

function intersectionOverUnion(left, right) {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function regionBoxes(labels) {
  return labels.map((label) => {
    const match = /^Area \d+: (\d+), (\d+), (\d+) × (\d+)$/u.exec(label.trim());
    if (!match) throw new Error(`Could not parse a T57 region label: ${label}`);
    return {
      x: Number(match[1]),
      y: Number(match[2]),
      width: Number(match[3]),
      height: Number(match[4]),
    };
  });
}

function matchBoxes(predictions, groundTruth, threshold = 0.5) {
  const matches = [];
  const used = new Set();
  for (const prediction of predictions) {
    let bestIndex = -1;
    let bestIou = 0;
    for (let index = 0; index < groundTruth.length; index += 1) {
      if (used.has(index)) continue;
      const iou = intersectionOverUnion(prediction, groundTruth[index]);
      if (iou > bestIou) {
        bestIndex = index;
        bestIou = iou;
      }
    }
    if (bestIndex >= 0 && bestIou >= threshold) {
      used.add(bestIndex);
      matches.push({ prediction, groundTruthIndex: bestIndex, iou: bestIou });
    }
  }
  return {
    matches,
    truePositives: matches.length,
    falsePositives: predictions.length - matches.length,
    falseNegatives: groundTruth.length - matches.length,
  };
}

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  const modelResponses = [];
  page.on('response', (response) => {
    if (response.url().includes(model.filename)) {
      modelResponses.push({ url: response.url(), status: response.status() });
    }
  });
  await page.goto(new URL('/blur-face', baseUrl).href);
  await page.getByTestId('t57-ready').waitFor({ state: 'visible' });

  for (const fixture of manifest.fixtures) {
    const filePath = path.join(directory, fixture.path);
    const fixtureBytes = await readFile(filePath);
    if (
      fixtureBytes.length !== fixture.sizeBytes ||
      createHash('sha256').update(fixtureBytes).digest('hex') !== fixture.pngSha256
    ) {
      throw new Error(`${fixture.id}: fixture bytes differ from their CC0 register entry.`);
    }
    const startedAt = Date.now();
    await page.getByTestId('t57-input').setInputFiles({
      name: `${fixture.id}.png`,
      mimeType: 'image/png',
      buffer: fixtureBytes,
    });
    await page.getByTestId('t57-file-info').waitFor({ state: 'visible' });
    await page.getByTestId('t57-suggest-faces').click();
    await page.getByTestId('t57-suggest-faces').waitFor({ state: 'visible', timeout: 180_000 });
    const notice = (await page.getByTestId('t57-notice').textContent())?.trim() ?? '';
    if (/Could not load or verify/u.test(notice)) {
      throw new Error(`${fixture.id}: the model download or inference failed: ${notice}`);
    }
    const labels = await page.locator('.region-list li span').allTextContents();
    const predictions = regionBoxes(labels);
    const match = matchBoxes(predictions, fixture.groundTruthFaceBoxes);
    report.corpus.fixtures.push({
      id: fixture.id,
      dimensions: fixture.dimensions,
      groundTruthFaceBoxes: fixture.groundTruthFaceBoxes,
      predictions,
      notice,
      elapsedMs: Date.now() - startedAt,
      ...match,
      scopeLimit: fixture.purpose,
    });
    await page.getByRole('button', { name: /Remove image/u }).click();
    await page.getByTestId('t57-ready').waitFor({ state: 'visible' });
  }

  report.modelResponses = modelResponses;
  if (modelResponses.some((response) => response.status !== 200)) {
    throw new Error(
      `The registered model request did not return HTTP 200: ${JSON.stringify(modelResponses)}`,
    );
  }
  if (modelResponses.length !== 1) {
    throw new Error(
      `Expected exactly one model request for the user session; saw ${modelResponses.length}.`,
    );
  }
  const output = path.join(directory, 'browser-smoke-results.json');
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`T57 YuNet browser smoke completed: ${output}\n`);
  process.stdout.write(
    `${JSON.stringify(
      report.corpus.fixtures.map(
        ({ id, truePositives, falsePositives, falseNegatives, elapsedMs }) => ({
          id,
          truePositives,
          falsePositives,
          falseNegatives,
          elapsedMs,
        }),
      ),
      null,
      2,
    )}\n`,
  );
} finally {
  await browser.close();
}
