import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(directory, 'fixtures');

function image(width, height, fill = [0, 0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(fill, offset);
  return { width, height, data };
}

function setPixel(target, x, y, rgba) {
  target.data.set(rgba, (y * target.width + x) * 4);
}

function staircasePaletteSprite() {
  const target = image(16, 16, [13, 19, 38, 255]);
  const palette = {
    outline: [37, 40, 75, 255],
    coral: [206, 67, 82, 255],
    gold: [244, 159, 66, 255],
    cream: [255, 235, 177, 255],
  };

  for (let y = 0; y < target.height; y += 1) {
    for (let x = 0; x < target.width; x += 1) {
      const distance = Math.abs(x - 7) + Math.abs(y - 7);
      if (distance <= 7) {
        const color =
          distance >= 6
            ? palette.outline
            : distance >= 4
              ? palette.coral
              : distance >= 2
                ? palette.gold
                : palette.cream;
        setPixel(target, x, y, color);
      }
    }
  }
  return {
    id: 'opaque-staircase-palette',
    description: 'Opaque stepped diamond icon with a five-colour palette and hard pixel edges.',
    focusPixel: null,
    target,
  };
}

function transparentOutlineSprite() {
  const target = image(16, 16);
  const colors = {
    outline: [28, 34, 58, 255],
    coral: [220, 69, 84, 255],
    gold: [247, 172, 60, 255],
  };

  for (let y = 0; y < target.height; y += 1) {
    for (let x = 0; x < target.width; x += 1) {
      const distance = Math.abs(x - 7) + Math.abs(y - 7);
      if (distance <= 6) {
        setPixel(
          target,
          x,
          y,
          distance >= 5 ? colors.outline : distance >= 3 ? colors.coral : colors.gold,
        );
      }
    }
  }
  return {
    id: 'transparent-outline-sprite',
    description: 'Transparent background with a hard-edged three-colour diamond sprite.',
    focusPixel: null,
    target,
  };
}

function transparentPocketSprite({ dominant }) {
  const target = image(3, 3);
  const ring = dominant
    ? [
        [220, 50, 60, 255],
        [220, 50, 60, 255],
        [220, 50, 60, 255],
        [220, 50, 60, 255],
        [30, 80, 230, 255],
        [220, 50, 60, 255],
        [220, 50, 60, 255],
        [220, 50, 60, 255],
      ]
    : [
        [240, 40, 40, 255],
        [30, 210, 70, 255],
        [30, 70, 240, 255],
        [240, 210, 20, 255],
        [220, 30, 210, 255],
        [20, 210, 220, 255],
        [240, 120, 20, 255],
        [130, 50, 220, 255],
      ];
  const locations = [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2],
    [1, 2],
    [0, 2],
    [0, 1],
  ];
  locations.forEach(([x, y], index) => setPixel(target, x, y, ring[index]));
  return {
    id: dominant ? 'transparent-pocket-clear-dominance' : 'transparent-pocket-mixed-palette',
    description: dominant
      ? 'Transparent centre with seven red and one blue opaque neighbours; red is the strict majority.'
      : 'Transparent centre surrounded by eight distinct opaque colours; no colour is dominant.',
    focusPixel: { x: 1, y: 1 },
    target,
  };
}

function uniqueRgba(data) {
  const colors = new Map();
  for (let offset = 0; offset < data.length; offset += 4) {
    const rgba = Array.from(data.subarray(offset, offset + 4));
    colors.set(rgba.join(','), rgba);
  }
  return [...colors.values()].sort((left, right) => left.join(',').localeCompare(right.join(',')));
}

export function generateFixtures() {
  return [
    staircasePaletteSprite(),
    transparentOutlineSprite(),
    transparentPocketSprite({ dominant: false }),
    transparentPocketSprite({ dominant: true }),
  ].map(({ id, description, focusPixel, target }) => ({
    id,
    description,
    width: target.width,
    height: target.height,
    focusPixel,
    sourceGenerated: true,
    rgbaSha256: createHash('sha256').update(target.data).digest('hex'),
    rgbaBase64: Buffer.from(target.data).toString('base64'),
    paletteRgba: uniqueRgba(target.data),
  }));
}

function fixtureText(fixture) {
  return `${JSON.stringify(fixture, null, 2)}\n`;
}

export async function writeFixtures({ checkOnly = false } = {}) {
  const fixtures = generateFixtures();
  const manifest = {
    schemaVersion: 1,
    generator: 'generate-fixtures.mjs',
    fixtureCount: fixtures.length,
    fixtures: fixtures.map(
      ({ id, description, width, height, focusPixel, rgbaSha256, paletteRgba }) => ({
        id,
        description,
        path: `fixtures/${id}.json`,
        width,
        height,
        focusPixel,
        sourceGenerated: true,
        rgbaBytes: width * height * 4,
        paletteRgba,
        rgbaSha256,
      }),
    ),
  };
  const expected = new Map([
    ...fixtures.map((fixture) => [`${fixture.id}.json`, fixtureText(fixture)]),
    ['manifest.json', `${JSON.stringify(manifest, null, 2)}\n`],
  ]);

  if (!checkOnly) await mkdir(fixtureDirectory, { recursive: true });
  for (const [filename, expectedText] of expected) {
    const path = resolve(fixtureDirectory, filename);
    if (checkOnly) {
      const existing = await readFile(path, 'utf8');
      if (existing !== expectedText)
        throw new Error(`${path} differs from deterministic generator output.`);
    } else {
      await writeFile(path, expectedText);
    }
  }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checkOnly = process.argv.includes('--check');
  const manifest = await writeFixtures({ checkOnly });
  process.stdout.write(
    `${checkOnly ? 'Verified' : 'Generated'} ${manifest.fixtureCount} deterministic T70 fixtures.\n`,
  );
}
