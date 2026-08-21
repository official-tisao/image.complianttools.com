import { readFile } from 'node:fs/promises';
import { parentPort } from 'node:worker_threads';
import { init as initJpegEncode } from '@jsquash/jpeg/encode.js';
import { init as initPngEncode } from '@jsquash/png/encode.js';
import { init as initWebpEncode } from '@jsquash/webp/encode.js';
import { createRaster, encodeRaster } from '../dist/index.js';

globalThis.ImageData = class ImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.colorSpace = 'srgb';
  }
};
const wasmBytes = (specifier, relativePath) =>
  readFile(new URL(relativePath, import.meta.resolve(specifier)));
const [jpegEncoder, pngEncoder, webpEncoder, webpEncoderFallback] = await Promise.all([
  wasmBytes('@jsquash/jpeg', './codec/enc/mozjpeg_enc.wasm'),
  wasmBytes('@jsquash/png', './codec/pkg/squoosh_png_bg.wasm'),
  wasmBytes('@jsquash/webp', './codec/enc/webp_enc_simd.wasm'),
  wasmBytes('@jsquash/webp', './codec/enc/webp_enc.wasm'),
]);
let compiledWebp;
try {
  compiledWebp = await WebAssembly.compile(webpEncoder);
} catch {
  compiledWebp = await WebAssembly.compile(webpEncoderFallback);
}
await Promise.all([
  initJpegEncode(await WebAssembly.compile(jpegEncoder)),
  initPngEncode(pngEncoder),
  initWebpEncode(compiledWebp),
]);

parentPort.on('message', async () => {
  try {
    const image = createRaster(
      2,
      2,
      new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
    );
    const [jpeg, png, webp] = await Promise.all([
      encodeRaster(image, 'jpeg', { quality: 82 }),
      encodeRaster(image, 'png'),
      encodeRaster(image, 'webp', { quality: 82 }),
    ]);
    parentPort.postMessage({ jpeg, png, webp }, [jpeg, png, webp]);
  } catch (error) {
    parentPort.postMessage({ error: error instanceof Error ? error.stack : String(error) });
  }
});
