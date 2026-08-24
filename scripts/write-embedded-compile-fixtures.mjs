import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createRaster, emitLvglV8CArray, emitLvglV9CArray } from '../packages/engine/dist/index.js';

const outputDirectory = process.argv[2];
if (!outputDirectory)
  throw new Error('Usage: node scripts/write-embedded-compile-fixtures.mjs DIR');

const image = createRaster(1, 1, new Uint8ClampedArray([255, 0, 0, 128]));
const fixtures = [
  {
    name: 'lvgl-v8.c',
    source: `${emitLvglV8CArray(image, {
      outputName: 'phase2_v8',
      format: 'argb8888',
    })}\nvoid phase2_bind_v8(lv_obj_t * image) { lv_img_set_src(image, &phase2_v8); }\n`,
  },
  {
    name: 'lvgl-v9.c',
    source: `${emitLvglV9CArray(image, {
      outputName: 'phase2_v9',
      format: 'rgb565a8',
    })}\nvoid phase2_bind_v9(lv_obj_t * image) { lv_image_set_src(image, &phase2_v9); }\n`,
  },
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  fixtures.map(({ name, source }) => writeFile(path.join(outputDirectory, name), source)),
);
console.log(`Wrote ${fixtures.length} generated LVGL compile fixtures.`);
