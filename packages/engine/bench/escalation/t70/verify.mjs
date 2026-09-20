import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeFixtures } from './generate-fixtures.mjs';
import { sha256, SCALE_FACTORS } from './metrics.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
await writeFixtures({ checkOnly: true });

const manifest = JSON.parse(await readFile(join(directory, 'fixtures/manifest.json'), 'utf8'));
const report = JSON.parse(await readFile(join(directory, 'results.json'), 'utf8'));
assert.equal(
  report.fixtureCount,
  manifest.fixtureCount,
  'result fixture count differs from manifest',
);
assert.deepEqual(report.scaleFactors, SCALE_FACTORS);
assert.equal(report.measurements.length, manifest.fixtureCount * SCALE_FACTORS.length);

for (const fixtureEntry of manifest.fixtures) {
  const fixture = JSON.parse(await readFile(join(directory, fixtureEntry.path), 'utf8'));
  assert.equal(fixture.sourceGenerated, true, `${fixture.id} is not marked self-generated`);
  assert.equal(sha256(Buffer.from(fixture.rgbaBase64, 'base64')), fixtureEntry.rgbaSha256);
}

for (const measurement of report.measurements) {
  assert.ok(SCALE_FACTORS.includes(measurement.factor), 'unexpected scale factor');
  assert.equal(measurement.output.width, measurement.source.width * measurement.factor);
  assert.equal(measurement.output.height, measurement.source.height * measurement.factor);
  assert.equal(measurement.baseline.width, measurement.output.width);
  assert.equal(measurement.baseline.height, measurement.output.height);
  assert.equal(
    measurement.metrics.introducedRgbPixels,
    0,
    `${measurement.fixtureId} invented RGB colors`,
  );

  for (const image of [
    measurement.source.pngArtifact,
    measurement.baseline.pngArtifact,
    measurement.preGuardAverage.pngArtifact,
    measurement.output.pngArtifact,
  ]) {
    const bytes = await readFile(join(directory, image.path));
    assert.equal(sha256(bytes), image.pngSha256, `${image.path} PNG hash mismatch`);
  }
  assert.ok(
    measurement.preGuardAverage.metrics.introducedRgbPixels >= 0,
    `${measurement.fixtureId} ×${measurement.factor} lacks pre-fix comparison metrics`,
  );
}

const opaqueRows = report.measurements.filter(
  (measurement) => measurement.fixtureId === 'opaque-staircase-palette',
);
assert.equal(opaqueRows.length, SCALE_FACTORS.length);
assert.ok(opaqueRows.every((row) => row.metrics.comparisonToNearestNeighbor.exactRgbaMatch));

const mixedPocketRows = report.measurements.filter(
  (measurement) => measurement.fixtureId === 'transparent-pocket-mixed-palette',
);
const mixedPocketEntry = manifest.fixtures.find(
  (entry) => entry.id === 'transparent-pocket-mixed-palette',
);
const mixedPocketRgbPalette = new Set(
  mixedPocketEntry.paletteRgba.map((color) => color.slice(0, 3).join(',')),
);
assert.ok(mixedPocketRows.every((row) => row.metrics.focusBlock));
for (const row of mixedPocketRows) {
  assert.ok(row.preGuardAverage.metrics.introducedRgbPixels > 0);
  for (const rgba of row.metrics.focusBlock.paletteRgba) {
    assert.ok(
      mixedPocketRgbPalette.has(rgba.slice(0, 3).join(',')),
      `${row.fixtureId} ×${row.factor} focus block invented RGB ${rgba.slice(0, 3).join(',')}`,
    );
  }
}

const dominantPocketRows = report.measurements.filter(
  (measurement) => measurement.fixtureId === 'transparent-pocket-clear-dominance',
);
assert.ok(dominantPocketRows.every((row) => row.metrics.focusBlock.changedFromNearestPixels > 0));
assert.ok(dominantPocketRows.every((row) => row.preGuardAverage.metrics.introducedRgbPixels > 0));
assert.match(await readFile(join(directory, 'REPORT.md'), 'utf8'), /synthetic/i);

process.stdout.write(
  `Verified T70 fixture hashes, ${report.measurements.length} measurements, PNG artifacts, palette invariants, and transparent-pocket outcomes.\n`,
);
