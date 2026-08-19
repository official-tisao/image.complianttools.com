import { readFile } from 'node:fs/promises';
import { parentPort } from 'node:worker_threads';

import { init as initJpegDecode } from '@jsquash/jpeg/decode.js';
import { init as initJpegEncode } from '@jsquash/jpeg/encode.js';
import { init as initOxipng } from '@jsquash/oxipng/optimise.js';
import { init as initPngEncode } from '@jsquash/png/encode.js';
import { init as initWebpEncode } from '@jsquash/webp/encode.js';

import {
  encodeRasterAsPng,
  encodeRasterAsJpeg,
  encodeRasterAsOptimisedPng,
  transcodeJpegToWebp,
} from '../dist/index.js';

class NodeImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.colorSpace = 'srgb';
  }
}

globalThis.ImageData = NodeImageData;

async function wasmBytes(specifier, relativePath) {
  return readFile(new URL(relativePath, import.meta.resolve(specifier)));
}

async function initialiseCodecs() {
  const [jpegDecoder, jpegEncoder, pngEncoder, oxipng, webpEncoder, webpEncoderFallback] =
    await Promise.all([
      wasmBytes('@jsquash/jpeg', './codec/dec/mozjpeg_dec.wasm'),
      wasmBytes('@jsquash/jpeg', './codec/enc/mozjpeg_enc.wasm'),
      wasmBytes('@jsquash/png', './codec/pkg/squoosh_png_bg.wasm'),
      wasmBytes('@jsquash/oxipng', './codec/pkg/squoosh_oxipng_bg.wasm'),
      wasmBytes('@jsquash/webp', './codec/enc/webp_enc_simd.wasm'),
      wasmBytes('@jsquash/webp', './codec/enc/webp_enc.wasm'),
    ]);
  let compiledWebpEncoder;
  try {
    compiledWebpEncoder = await WebAssembly.compile(webpEncoder);
  } catch {
    compiledWebpEncoder = await WebAssembly.compile(webpEncoderFallback);
  }
  await Promise.all([
    initJpegDecode(await WebAssembly.compile(jpegDecoder)),
    initJpegEncode(await WebAssembly.compile(jpegEncoder)),
    initPngEncode(pngEncoder),
    initOxipng(oxipng),
    initWebpEncode(compiledWebpEncoder),
  ]);
}

await initialiseCodecs();

parentPort.on('message', async ({ id }) => {
  try {
    const source = {
      width: 3,
      height: 2,
      colorSpace: 'srgb',
      bitDepth: 8,
      premultipliedAlpha: false,
      frames: [
        {
          durationMs: 0,
          data: new Uint8ClampedArray([
            255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255,
            0, 255, 255,
          ]),
        },
      ],
    };
    const jpeg = await encodeRasterAsJpeg(source, { quality: 90, progressive: true });
    const [webp, plainPng, png] = await Promise.all([
      transcodeJpegToWebp(jpeg, { quality: 82 }),
      encodeRasterAsPng(source),
      encodeRasterAsOptimisedPng(source),
    ]);
    parentPort.postMessage({ id, jpeg, webp, plainPng, png }, [jpeg, webp, plainPng, png]);
  } catch (error) {
    parentPort.postMessage({ id, error: error instanceof Error ? error.stack : String(error) });
  }
});
