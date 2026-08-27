import { readFile } from 'node:fs/promises';
import { parentPort } from 'node:worker_threads';
import { init as initJpegEncode } from '@jsquash/jpeg/encode.js';
import { init as initJpegDecode } from '@jsquash/jpeg/decode.js';
import { init as initPngDecode } from '@jsquash/png/decode.js';
import { init as initPngEncode } from '@jsquash/png/encode.js';
import { init as initWebpDecode } from '@jsquash/webp/decode.js';
import { init as initWebpEncode } from '@jsquash/webp/encode.js';
import {
  createRaster,
  decodeJpegToRaster,
  decodePngToRaster,
  decodeWebpToRaster,
  decodeWithTypedErrors,
  encodeRaster,
  readContainerMetadata,
  restoreContainerMetadata,
} from '../dist/index.js';

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
const [jpegDecoder, jpegEncoder, pngCodec, webpDecoder, webpEncoder, webpEncoderFallback] =
  await Promise.all([
    wasmBytes('@jsquash/jpeg', './codec/dec/mozjpeg_dec.wasm'),
    wasmBytes('@jsquash/jpeg', './codec/enc/mozjpeg_enc.wasm'),
    wasmBytes('@jsquash/png', './codec/pkg/squoosh_png_bg.wasm'),
    wasmBytes('@jsquash/webp', './codec/dec/webp_dec.wasm'),
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
  initJpegDecode(await WebAssembly.compile(jpegDecoder)),
  initPngDecode(pngCodec),
  initPngEncode(pngCodec),
  initWebpDecode(await WebAssembly.compile(webpDecoder)),
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
    const [decodedJpeg, decodedPng, decodedWebp] = await Promise.all([
      decodeJpegToRaster(jpeg.slice(0)),
      decodePngToRaster(png.slice(0)),
      decodeWebpToRaster(webp.slice(0)),
    ]);
    const crc32 = (input) => {
      let crc = 0xffffffff;
      for (const byte of input) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
      return (crc ^ 0xffffffff) >>> 0;
    };
    const pngTextData = new TextEncoder().encode('Author\0Ada');
    const pngType = new TextEncoder().encode('tEXt');
    const pngBlock = new Uint8Array(12 + pngTextData.length);
    const pngView = new DataView(pngBlock.buffer);
    pngView.setUint32(0, pngTextData.length);
    pngBlock.set(pngType, 4);
    pngBlock.set(pngTextData, 8);
    pngView.setUint32(8 + pngTextData.length, crc32(new Uint8Array([...pngType, ...pngTextData])));
    const xmp = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>');
    const jpegBlock = new Uint8Array(4 + xmp.length);
    jpegBlock.set([0xff, 0xe1, (xmp.length + 2) >>> 8, (xmp.length + 2) & 255]);
    jpegBlock.set(xmp, 4);
    const webpData = new TextEncoder().encode('<x:xmpmeta/>');
    const webpBlock = new Uint8Array(8 + webpData.length + (webpData.length & 1));
    webpBlock.set(new TextEncoder().encode('XMP '));
    new DataView(webpBlock.buffer).setUint32(4, webpData.length, true);
    webpBlock.set(webpData, 8);
    const tagged = {
      jpeg: restoreContainerMetadata(jpeg, { format: 'jpeg', blocks: [jpegBlock] }),
      png: restoreContainerMetadata(png, { format: 'png', blocks: [pngBlock] }),
      webp: restoreContainerMetadata(webp, { format: 'webp', blocks: [webpBlock] }),
    };
    const taggedRasters = {
      jpeg: await decodeJpegToRaster(tagged.jpeg.buffer),
      png: await decodePngToRaster(tagged.png.buffer),
      webp: await decodeWebpToRaster(tagged.webp.buffer),
    };
    const preserved = {};
    for (const format of ['jpeg', 'png', 'webp']) {
      const reencoded = await encodeRaster(taggedRasters[format], format, {
        stripMetadata: 'none',
      });
      preserved[format] = {
        before: readContainerMetadata(tagged[format]).tags,
        after: readContainerMetadata(reencoded).tags,
      };
    }
    const typedErrors = [];
    for (const [format, decode] of [
      ['jpeg', decodeJpegToRaster],
      ['png', decodePngToRaster],
      ['webp', decodeWebpToRaster],
    ]) {
      try {
        await decodeWithTypedErrors(format, () => decode(new ArrayBuffer(0)));
      } catch (error) {
        typedErrors.push(error);
      }
    }
    parentPort.postMessage(
      {
        jpeg,
        png,
        webp,
        decoded: {
          jpeg: decodedJpeg,
          png: decodedPng,
          webp: decodedWebp,
        },
        typedErrors,
        preserved,
      },
      [jpeg, png, webp],
    );
  } catch (error) {
    parentPort.postMessage({ error: error instanceof Error ? error.stack : String(error) });
  }
});
