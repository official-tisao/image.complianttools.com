import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createRaster,
  emitAdafruitGfxBitmap,
  emitEspIdfCArray,
  emitLvglV8CArray,
  emitLvglV9CArray,
} from '../packages/engine/dist/index.js';

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
  {
    name: 'adafruit/phase2_adafruit.h',
    source: emitAdafruitGfxBitmap(image, 'phase2_adafruit'),
  },
  {
    name: 'adafruit/adafruit.ino',
    source: `#include <Adafruit_GFX.h>
#include "phase2_adafruit.h"

class Phase2Display final : public Adafruit_GFX {
public:
  Phase2Display() : Adafruit_GFX(1, 1) {}
  void drawPixel(int16_t, int16_t, uint16_t) override {}
};

Phase2Display display;
void setup() { display.drawBitmap(0, 0, phase2_adafruit, 1, 1, 1); }
void loop() {}
`,
  },
  {
    name: 'tft-espi/phase2_tft.h',
    source: emitEspIdfCArray(image, {
      outputName: 'phase2_tft',
      format: 'rgb565',
    }),
  },
  {
    name: 'tft-espi/tft-espi.ino',
    source: `#include <TFT_eSPI.h>
#include "phase2_tft.h"

TFT_eSPI display;
void setup() {
  display.init();
  display.pushImage(0, 0, 1, 1, phase2_tft);
}
void loop() {}
`,
  },
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  fixtures.map(async ({ name, source }) => {
    const destination = path.join(outputDirectory, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source);
  }),
);
console.log(`Wrote ${fixtures.length} generated embedded compile fixtures.`);
