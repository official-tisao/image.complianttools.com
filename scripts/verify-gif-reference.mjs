import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { decodeGif, encodeGif } from '../packages/engine/dist/index.js';

const corpus = resolve(process.argv[2] ?? 'packages/engine/test/fixtures/gif-reference');
const reference = process.env.GIFSICLE_PATH;
if (!reference) {
  console.error(
    'Usage: GIFSICLE_PATH=/path/to/gifsicle node scripts/verify-gif-reference.mjs <corpus>',
  );
  process.exit(2);
}

const files = readdirSync(corpus)
  .filter((file) => file.toLowerCase().endsWith('.gif'))
  .sort();
if (files.length !== 20)
  throw new Error(`Expected exactly 20 GIF corpus files; found ${files.length}.`);
const expectedHashes = new Map(
  readFileSync(join(corpus, 'SHA256SUMS'), 'utf8')
    .trim()
    .split(/\r?\n/u)
    .map((line) => {
      const [hash, file] = line.split(/\s+/u);
      return [file, hash];
    }),
);
for (const file of files) {
  const actual = createHash('sha256')
    .update(readFileSync(join(corpus, file)))
    .digest('hex');
  if (actual !== expectedHashes.get(file)) throw new Error(`Corpus hash mismatch: ${file}.`);
}

const scratch = mkdtempSync(join(tmpdir(), 'complianttools-gif-reference-'));
let ourTotal = 0;
let referenceTotal = 0;
let failed = false;
try {
  for (const file of files) {
    const input = readFileSync(join(corpus, file));
    const raster = decodeGif(input);
    const ours = Buffer.from(
      encodeGif(raster, 0, {
        optimizeLevel: 3,
        quantizer: 'wu',
        dither: 'none',
        disposal: 'auto',
      }),
    );
    const ourPath = join(scratch, `${basename(file, '.gif')}.ours.gif`);
    const referencePath = join(scratch, `${basename(file, '.gif')}.reference.gif`);
    writeFileSync(ourPath, ours);
    execFileSync(reference, ['--optimize=3', join(corpus, file), '--output', referencePath], {
      stdio: 'pipe',
    });
    const referenceBytes = readFileSync(referencePath).byteLength;
    const ratio = ours.byteLength / referenceBytes;
    ourTotal += ours.byteLength;
    referenceTotal += referenceBytes;
    if (ratio > 1.1) failed = true;
    console.log(
      `${file.padEnd(22)} ours=${String(ours.byteLength).padStart(8)} reference=${String(referenceBytes).padStart(8)} ratio=${ratio.toFixed(3)} ${ratio <= 1.1 ? 'PASS' : 'FAIL'}`,
    );
  }
  const aggregate = ourTotal / referenceTotal;
  if (aggregate > 1.1) failed = true;
  console.log(
    `aggregate               ours=${String(ourTotal).padStart(8)} reference=${String(referenceTotal).padStart(8)} ratio=${aggregate.toFixed(3)} ${aggregate <= 1.1 ? 'PASS' : 'FAIL'}`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
if (failed) process.exit(1);
