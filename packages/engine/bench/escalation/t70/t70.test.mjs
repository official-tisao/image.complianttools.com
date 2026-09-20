import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { pixelArtScale } from '../../../dist/cv/pixel-art.js';
import { generateFixtures } from './generate-fixtures.mjs';
import {
  inspectOutput,
  nearestNeighborScale,
  preGuardAverageScale,
  rasterFromFixture,
  SCALE_FACTORS,
  sha256,
} from './metrics.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const generated = generateFixtures();
const persistedManifest = JSON.parse(
  await readFile(join(directory, 'fixtures/manifest.json'), 'utf8'),
);
const fixtures = await Promise.all(
  persistedManifest.fixtures.map(async (entry) =>
    JSON.parse(await readFile(join(directory, entry.path), 'utf8')),
  ),
);

test('T70 fixture generation is deterministic and matches persisted hashes', () => {
  assert.equal(generated.length, persistedManifest.fixtureCount);
  for (const expected of generated) {
    const persisted = fixtures.find((fixture) => fixture.id === expected.id);
    assert.ok(persisted, `missing persisted fixture ${expected.id}`);
    assert.equal(persisted.rgbaSha256, expected.rgbaSha256);
    assert.equal(sha256(Buffer.from(persisted.rgbaBase64, 'base64')), expected.rgbaSha256);
  }
});

test('opaque limited-palette sprite is exact nearest-neighbour at ×2, ×3 and ×4', () => {
  const fixture = fixtures.find((entry) => entry.id === 'opaque-staircase-palette');
  assert.ok(fixture);
  const source = rasterFromFixture(fixture);
  for (const factor of SCALE_FACTORS) {
    const baseline = nearestNeighborScale(source, factor);
    const actual = pixelArtScale(source, factor);
    assert.deepEqual(actual.frames[0].data, baseline.frames[0].data, `factor ×${factor}`);
  }
});

test('T70 continuation never invents an RGB color outside the source palette', () => {
  for (const fixture of fixtures) {
    const source = rasterFromFixture(fixture);
    const sourceRgb = new Set();
    for (let offset = 0; offset < source.frames[0].data.length; offset += 4) {
      sourceRgb.add(Array.from(source.frames[0].data.subarray(offset, offset + 3)).join(','));
    }
    for (const factor of SCALE_FACTORS) {
      const output = pixelArtScale(source, factor).frames[0].data;
      for (let offset = 0; offset < output.length; offset += 4) {
        const rgb = Array.from(output.subarray(offset, offset + 3)).join(',');
        assert.ok(sourceRgb.has(rgb), `${fixture.id} ×${factor} introduced RGB ${rgb}`);
      }
    }
  }
});

test('regression fixture reproduces the pre-fix invented-color failure', () => {
  for (const id of ['transparent-pocket-mixed-palette', 'transparent-pocket-clear-dominance']) {
    const fixture = fixtures.find((entry) => entry.id === id);
    assert.ok(fixture);
    const source = rasterFromFixture(fixture);
    for (const factor of SCALE_FACTORS) {
      const nearest = nearestNeighborScale(source, factor);
      const preGuard = preGuardAverageScale(source, factor);
      const beforeFix = inspectOutput(source, nearest, preGuard, fixture.focusPixel);
      assert.ok(
        beforeFix.introducedRgbPixels > 0,
        `${id} ×${factor} should reproduce the old averaged RGB color`,
      );
    }
  }
});

test('mixed transparent center never receives an invented blended RGB color', () => {
  const fixture = fixtures.find((entry) => entry.id === 'transparent-pocket-mixed-palette');
  assert.ok(fixture?.focusPixel);
  const source = rasterFromFixture(fixture);
  for (const factor of SCALE_FACTORS) {
    const actual = pixelArtScale(source, factor);
    const { x, y } = fixture.focusPixel;
    const sourceRgb = new Set();
    for (let offset = 0; offset < source.frames[0].data.length; offset += 4) {
      sourceRgb.add(Array.from(source.frames[0].data.subarray(offset, offset + 3)).join(','));
    }
    for (let dy = 0; dy < factor; dy += 1) {
      for (let dx = 0; dx < factor; dx += 1) {
        const offset = ((y * factor + dy) * actual.width + x * factor + dx) * 4;
        const rgb = Array.from(actual.frames[0].data.subarray(offset, offset + 3)).join(',');
        assert.ok(sourceRgb.has(rgb), `factor ×${factor}, center subpixel ${dx},${dy}: ${rgb}`);
      }
    }
  }
});

test('transparent center with a strict red majority continues with that source color', () => {
  const fixture = fixtures.find((entry) => entry.id === 'transparent-pocket-clear-dominance');
  assert.ok(fixture?.focusPixel);
  const source = rasterFromFixture(fixture);
  for (const factor of SCALE_FACTORS) {
    const baseline = nearestNeighborScale(source, factor);
    const actual = pixelArtScale(source, factor);
    const { x, y } = fixture.focusPixel;
    let changedPixels = 0;
    for (let dy = 0; dy < factor; dy += 1) {
      for (let dx = 0; dx < factor; dx += 1) {
        const offset = ((y * factor + dy) * actual.width + x * factor + dx) * 4;
        const pixel = actual.frames[0].data.subarray(offset, offset + 4);
        const reference = baseline.frames[0].data.subarray(offset, offset + 4);
        if (!pixel.every((channel, index) => channel === reference[index])) {
          changedPixels += 1;
          assert.deepEqual(Array.from(pixel.subarray(0, 3)), [220, 50, 60]);
          assert.ok(pixel[3] > 0 && pixel[3] < 255);
        }
      }
    }
    assert.ok(changedPixels > 0, `factor ×${factor} should continue the strict-majority red color`);
  }
});
