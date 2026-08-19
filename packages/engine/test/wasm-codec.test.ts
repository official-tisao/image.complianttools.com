import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { init as initAvif } from '@jsquash/avif/decode.js';
import { init as initAvifEncoder } from '@jsquash/avif/encode.js';
import { init as initJxl } from '@jsquash/jxl/decode.js';
import { init as initJxlEncoder } from '@jsquash/jxl/encode.js';

import { createRaster, decodeAvifToRaster, decodeJxlToRaster } from '../src/index.js';
import { encodeRasterAsAvif } from '../src/codecs/third-party/avif.js';
import { encodeRasterAsJxl } from '../src/codecs/third-party/jxl.js';

const fixture = createRaster(1, 1, new Uint8ClampedArray([32, 96, 160, 255]));

async function initialiseTestWasm(): Promise<void> {
  const load = async (relativePath: string) =>
    WebAssembly.compile(await readFile(new URL(relativePath, import.meta.url)));
  await Promise.all([
    initAvif(await load('../node_modules/@jsquash/avif/codec/dec/avif_dec.wasm')),
    initAvifEncoder(await load('../node_modules/@jsquash/avif/codec/enc/avif_enc.wasm')),
    initJxl(await load('../node_modules/@jsquash/jxl/codec/dec/jxl_dec.wasm')),
    initJxlEncoder(await load('../node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm')),
  ]);
}

describe('cleared WASM codecs', () => {
  it('initialises the exact local WASM assets used by the browser codecs', async () => {
    await expect(initialiseTestWasm()).resolves.toBeUndefined();
  }, 30_000);

  it('round-trips a local AVIF fixture', async () => {
    const encoded = await encodeRasterAsAvif(fixture, { quality: 100 });
    const decoded = await decodeAvifToRaster(encoded);
    expect(decoded).toMatchObject({ width: 1, height: 1, bitDepth: 8 });
    expect(decoded.frames[0]?.data[3]).toBe(255);
  }, 30_000);

  it('round-trips a local JPEG XL fixture', async () => {
    const encoded = await encodeRasterAsJxl(fixture, { quality: 100 });
    const decoded = await decodeJxlToRaster(encoded);
    expect(decoded).toMatchObject({ width: 1, height: 1, bitDepth: 8 });
    expect(decoded.frames[0]?.data[3]).toBe(255);
  }, 30_000);
});
