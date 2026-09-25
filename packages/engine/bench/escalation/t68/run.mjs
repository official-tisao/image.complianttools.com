import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { createRaster, removeBackground } from '../../../dist/index.js';

const directory = new URL('.', import.meta.url);
await mkdir(directory, { recursive: true });
const width = 4;
const height = 4;
const rgba = new Uint8ClampedArray(width * height * 4);
for (let index = 0; index < rgba.length; index += 4) {
  rgba[index] = 220;
  rgba[index + 1] = 80;
  rgba[index + 2] = 40;
  rgba[index + 3] = 255;
}
const trimap = new Uint8ClampedArray([0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0]);
const input = createRaster(width, height, rgba);
const start = performance.now();
const output = removeBackground(input, { image: input, trimap, refine: false });
const elapsedMs = performance.now() - start;
const data = output.frames[0].data;
const alpha = Array.from({ length: width * height }, (_, index) => data[index * 4 + 3]);
const hash = createHash('sha256').update(data).digest('hex');
await writeFile(
  new URL('./results.json', directory),
  JSON.stringify(
    {
      status: 'PARTIAL',
      fixture: {
        width,
        height,
        trimap: Array.from(trimap),
        rgbaSha256: createHash('sha256').update(rgba).digest('hex'),
      },
      output: {
        alpha,
        rgbaSha256: hash,
        hardForegroundAlpha: alpha[5] === 255 && alpha[6] === 255,
        hardBackgroundAlpha: alpha[0] === 0 && alpha[15] === 0,
      },
      elapsedMs: Number(elapsedMs.toFixed(4)),
      shortfall:
        'The local path requires a user trimap; hair, fur, veil, and zero-hint segmentation are not measured.',
    },
    null,
    2,
  ),
);
console.log('T68 measured trimap matte path');
