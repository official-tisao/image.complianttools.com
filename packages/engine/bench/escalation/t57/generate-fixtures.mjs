import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(directory, 'fixtures');
const manifestPath = join(fixtureDirectory, 'manifest.json');
const generatorPath = fileURLToPath(import.meta.url);
const supersampling = 4;

const fixtures = [
  {
    id: 'single-centered',
    width: 160,
    height: 160,
    faces: [{ x: 50, y: 28, width: 60, height: 76, skin: [211, 154, 116], hair: [59, 43, 39] }],
    purpose: 'One centered, front-facing synthetic face; exact box and basic blur/export behavior.',
  },
  {
    id: 'two-faces',
    width: 224,
    height: 160,
    faces: [
      { x: 24, y: 44, width: 52, height: 66, skin: [171, 119, 91], hair: [42, 48, 60] },
      { x: 136, y: 30, width: 60, height: 78, skin: [224, 180, 139], hair: [81, 55, 43] },
    ],
    purpose:
      'Two separated synthetic faces at different scales; multiple-region mapping and ordering.',
  },
  {
    id: 'edge-and-small',
    width: 160,
    height: 144,
    faces: [
      { x: -8, y: 20, width: 48, height: 64, skin: [200, 147, 115], hair: [47, 45, 54] },
      { x: 118, y: 96, width: 30, height: 38, skin: [192, 139, 105], hair: [70, 48, 42] },
    ],
    purpose: 'A clipped edge face and a small face; clipping and minimum-region edge cases.',
  },
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1 ? 0xedb88320 : 0) ^ (crc >>> 1);
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    rows[row] = 0;
    rgba.copy(rows, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideEllipse(x, y, centerX, centerY, radiusX, radiusY) {
  const dx = (x - centerX) / radiusX;
  const dy = (y - centerY) / radiusY;
  return dx * dx + dy * dy <= 1;
}

function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function sourceColor(x, y, width, height, face) {
  const background = [
    Math.round(213 - (y / height) * 12),
    Math.round(222 - (x / width) * 9),
    Math.round(229 - (y / height) * 7),
  ];
  if (!face) return background;
  const { x: left, y: top, width: faceWidth, height: faceHeight, skin, hair } = face;
  const cx = left + faceWidth / 2;
  const cy = top + faceHeight / 2;
  const rx = faceWidth / 2;
  const ry = faceHeight / 2;
  let color = background;

  // Neck and shoulders sit behind the head.
  if (
    x >= cx - rx * 0.34 &&
    x <= cx + rx * 0.34 &&
    y >= top + faceHeight * 0.7 &&
    y <= top + faceHeight * 1.14
  ) {
    color = skin.map((channel) => Math.round(channel * 0.82));
  }
  if (insideEllipse(x, y, cx, top + faceHeight * 1.16, rx * 0.8, ry * 0.31)) {
    color = hair.map((channel) => Math.max(0, channel - 8));
  }
  // Hair silhouette, ears and face skin.
  if (insideEllipse(x, y, cx, cy - ry * 0.08, rx * 1.08, ry * 1.12)) color = hair;
  if (insideEllipse(x, y, left - rx * 0.02, cy + ry * 0.02, rx * 0.22, ry * 0.22)) {
    color = skin.map((channel) => Math.max(0, Math.round(channel * 0.9)));
  }
  if (insideEllipse(x, y, left + faceWidth + rx * 0.02, cy + ry * 0.02, rx * 0.22, ry * 0.22)) {
    color = skin.map((channel) => Math.max(0, Math.round(channel * 0.9)));
  }
  if (insideEllipse(x, y, cx, cy, rx * 0.91, ry * 0.93)) {
    const light = Math.max(
      0.82,
      1.05 - Math.abs((x - cx) / rx) * 0.12 - Math.max(0, (y - cy) / ry) * 0.08,
    );
    color = skin.map((channel) => Math.min(255, Math.round(channel * light)));
  }
  // A short fringe with a few rounded locks keeps the generated shapes distinct from plain ovals.
  if (
    y < top + faceHeight * 0.24 &&
    insideEllipse(x, y, cx, top + faceHeight * 0.13, rx * 0.94, ry * 0.46)
  ) {
    color = hair;
  }

  const eyeY = top + faceHeight * 0.43;
  const eyeOffset = faceWidth * 0.23;
  for (const eyeX of [cx - eyeOffset, cx + eyeOffset]) {
    if (
      distanceToSegment(
        x,
        y,
        eyeX - faceWidth * 0.1,
        eyeY - faceHeight * 0.065,
        eyeX + faceWidth * 0.1,
        eyeY - faceHeight * 0.07,
      ) <
      faceWidth * 0.032
    ) {
      color = hair.map((channel) => Math.round(channel * 0.82));
    }
    if (insideEllipse(x, y, eyeX, eyeY, faceWidth * 0.09, faceHeight * 0.045))
      color = [246, 239, 224];
    if (insideEllipse(x, y, eyeX, eyeY, faceWidth * 0.028, faceHeight * 0.04)) color = [38, 39, 42];
  }
  // Nose bridge and a gently curved mouth, both deterministic geometric strokes.
  if (
    distanceToSegment(
      x,
      y,
      cx,
      top + faceHeight * 0.46,
      cx - faceWidth * 0.035,
      top + faceHeight * 0.66,
    ) <
    faceWidth * 0.035
  ) {
    color = skin.map((channel) => Math.max(0, Math.round(channel * 0.78)));
  }
  if (
    distanceToSegment(
      x,
      y,
      cx - faceWidth * 0.16,
      top + faceHeight * 0.76,
      cx + faceWidth * 0.16,
      top + faceHeight * 0.76,
    ) <
    faceHeight * 0.024
  ) {
    color = [112, 48, 51];
  }
  return color;
}

function render(fixture) {
  const pixels = Buffer.alloc(fixture.width * fixture.height * 4);
  for (let y = 0; y < fixture.height; y += 1) {
    for (let x = 0; x < fixture.width; x += 1) {
      const totals = [0, 0, 0];
      for (let sy = 0; sy < supersampling; sy += 1) {
        for (let sx = 0; sx < supersampling; sx += 1) {
          const sampleX = x + (sx + 0.5) / supersampling;
          const sampleY = y + (sy + 0.5) / supersampling;
          const face = fixture.faces.find((candidate) => {
            const cx = candidate.x + candidate.width / 2;
            const cy = candidate.y + candidate.height / 2;
            return (
              insideEllipse(sampleX, sampleY, cx, cy, candidate.width / 2, candidate.height / 2) ||
              insideEllipse(
                sampleX,
                sampleY,
                cx,
                cy - candidate.height * 0.08,
                candidate.width * 0.54,
                candidate.height * 0.56,
              )
            );
          });
          const color = sourceColor(sampleX, sampleY, fixture.width, fixture.height, face);
          for (let channel = 0; channel < 3; channel += 1) totals[channel] += color[channel];
        }
      }
      const offset = (y * fixture.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1)
        pixels[offset + channel] = Math.round(totals[channel] / (supersampling * supersampling));
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function manifestRecord(fixture, png, rgba) {
  return {
    id: fixture.id,
    path: `fixtures/${fixture.id}.png`,
    dimensions: { width: fixture.width, height: fixture.height },
    sizeBytes: png.length,
    pngSha256: sha256(png),
    rgbaSha256: sha256(rgba),
    groundTruthFaceBoxes: fixture.faces.map(({ x, y, width, height }) => ({
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: Math.min(fixture.width, x + width) - Math.max(0, x),
      height: Math.min(fixture.height, y + height) - Math.max(0, y),
    })),
    purpose: fixture.purpose,
  };
}

async function generate() {
  const generatorSha256 = sha256(await readFile(generatorPath));
  const manifest = {
    schemaVersion: 1,
    title: 'T57 synthetic face fixtures',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    releaseStatement:
      'Created for this project and dedicated to the public domain under CC0 1.0 Universal.',
    generator: 'generate-fixtures.mjs',
    generatorSha256,
    recipe: {
      method:
        'Deterministic procedural rasterization with fixed geometric facial features and 4x supersampling.',
      supersampling,
      colorFormat: 'opaque RGBA PNG, 8-bit sRGB-like display values',
      randomSeed: null,
      thirdPartyImageSources: [],
      realPersonLikenesses: false,
    },
    fixtureCount: fixtures.length,
    fixtures: [],
  };
  const outputFiles = new Map();
  for (const fixture of fixtures) {
    const rgba = render(fixture);
    const png = encodePng(fixture.width, fixture.height, rgba);
    outputFiles.set(join(fixtureDirectory, `${fixture.id}.png`), png);
    manifest.fixtures.push(manifestRecord(fixture, png, rgba));
  }
  outputFiles.set(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  return outputFiles;
}

async function main() {
  const expected = await generate();
  const verify = process.argv.includes('--verify');
  if (!verify) await mkdir(fixtureDirectory, { recursive: true });
  for (const [filePath, bytes] of expected) {
    if (verify) {
      const actual = await readFile(filePath);
      if (!actual.equals(bytes))
        throw new Error(`${filePath} differs from deterministic fixture output.`);
    } else {
      await writeFile(filePath, bytes);
    }
  }
  process.stdout.write(
    `${verify ? 'Verified' : 'Generated'} ${fixtures.length} T57 CC0 synthetic face fixtures.\n`,
  );
}

await main();
