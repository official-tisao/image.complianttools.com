import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { laplacianPyramidBlend } from '../../../dist/index.js';

const directory = new URL('.', import.meta.url);
await mkdir(directory, { recursive: true });
const width = 4;
const height = 4;
const base = new Uint8ClampedArray(width * height * 4);
const overlay = new Uint8ClampedArray(width * height * 4);
for (let index = 0; index < base.length; index += 4) {
  base.set([20, 80, 140, 255], index);
  overlay.set([220, 40, 60, 128], index);
}
const start = performance.now();
const output = laplacianPyramidBlend({ base, overlay, width, height, levels: 3 });
const elapsedMs = performance.now() - start;
const expected = [120, 60, 100, 192];
const maxAbsError = expected.reduce(
  (max, value, index) => Math.max(max, Math.abs(output[index] - value)),
  0,
);
await writeFile(
  new URL('./results.json', directory),
  JSON.stringify(
    {
      status: 'PARTIAL',
      fixture: {
        width,
        height,
        baseSha256: createHash('sha256').update(base).digest('hex'),
        overlaySha256: createHash('sha256').update(overlay).digest('hex'),
      },
      output: {
        firstPixel: Array.from(output.slice(0, 4)),
        alphaBlendReference: expected,
        maxAbsError,
        rgbaSha256: createHash('sha256').update(output).digest('hex'),
      },
      elapsedMs: Number(elapsedMs.toFixed(4)),
      shortfall:
        'The shipped function is a per-pixel alpha blend approximation; a full multiscale pyramid and plausible relighting corpus are not implemented.',
    },
    null,
    2,
  ),
);
console.log('T69 measured local composition approximation');
