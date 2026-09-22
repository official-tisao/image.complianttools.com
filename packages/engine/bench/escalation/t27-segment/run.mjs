import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { createRaster, segmentTier1 } from '../../../dist/index.js';

const directory = new URL('.', import.meta.url);
await mkdir(directory, { recursive: true });
const width = 6;
const height = 6;
const rgba = new Uint8ClampedArray(width * height * 4);
const expected = new Uint8ClampedArray(width * height);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const pixel = (y * width + x) * 4;
    const foreground = x >= 3;
    rgba[pixel] = foreground ? 220 : 30;
    rgba[pixel + 1] = foreground ? 220 : 30;
    rgba[pixel + 2] = foreground ? 220 : 30;
    rgba[pixel + 3] = 255;
    expected[y * width + x] = foreground ? 255 : 0;
  }
}
const image = createRaster(width, height, rgba);
const start = performance.now();
const actual = segmentTier1(image, { x: 2, y: 1, width: 4, height: 4 });
const elapsedMs = performance.now() - start;
let tp = 0;
let fp = 0;
let fn = 0;
for (let index = 0; index < expected.length; index += 1) {
  if (expected[index] === 255 && actual[index] === 255) tp += 1;
  else if (expected[index] === 0 && actual[index] === 255) fp += 1;
  else if (expected[index] === 255 && actual[index] === 0) fn += 1;
}
const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
await writeFile(
  new URL('./results.json', directory),
  JSON.stringify(
    {
      status: 'PARTIAL',
      fixture: { width, height, rgbaSha256: createHash('sha256').update(rgba).digest('hex') },
      rectangleHint: { x: 2, y: 1, width: 4, height: 4 },
      confusion: { tp, fp, fn, precision, recall },
      elapsedMs: Number(elapsedMs.toFixed(4)),
      shortfall:
        'This is a simple colour-separated rectangle hint. It does not measure semantic object selection or hard boundaries without a usable colour/edge cue.',
    },
    null,
    2,
  ),
);
console.log('T27 segment assist measured on a generated rectangle fixture');
