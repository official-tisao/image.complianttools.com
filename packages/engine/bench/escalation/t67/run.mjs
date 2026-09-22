import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { createRaster, expandImage } from '../../../dist/index.js';

const directory = new URL('.', import.meta.url);
const outputPath = new URL('./results.json', directory);
await mkdir(directory, { recursive: true });

const width = 8;
const height = 8;
const input = new Uint8ClampedArray(width * height * 4);
for (let index = 0; index < input.length; index += 4) {
  input[index] = 40 + ((index / 4) % width);
  input[index + 1] = 80;
  input[index + 2] = 120;
  input[index + 3] = 255;
}
const image = createRaster(width, height, input);
const mask = new Uint8ClampedArray(width * height);
for (let y = 2; y < 6; y += 1) for (let x = 2; x < 6; x += 1) mask[y * width + x] = 255;

const start = performance.now();
const noMask = expandImage(image);
const masked = expandImage(image, { mask, fillColor: [0, 0, 0] });
const elapsedMs = performance.now() - start;
const hash = (data) => createHash('sha256').update(data).digest('hex');
const noMaskData = noMask.frames[0].data;
const maskedData = masked.frames[0].data;
const changedPixels = maskedData.reduce(
  (count, value, index) => count + (value !== input[index] ? 1 : 0),
  0,
);

await writeFile(
  outputPath,
  JSON.stringify(
    {
      status: 'BLOCKED',
      fixture: { width, height, maskPixels: 16, rgbaSha256: hash(input) },
      noMask: {
        width: noMask.width,
        height: noMask.height,
        byteIdentical: hash(noMaskData) === hash(input),
      },
      masked: {
        width: masked.width,
        height: masked.height,
        changedChannelCount: changedPixels,
        rgbaSha256: hash(maskedData),
      },
      elapsedMs: Number(elapsedMs.toFixed(4)),
      shortfall:
        'expandImage does not enlarge the canvas or synthesize a new-area scene; it only inpaints a same-size mask.',
    },
    null,
    2,
  ),
);
console.log('T67 measured same-size expansion stub');
