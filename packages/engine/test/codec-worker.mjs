import { readFile } from 'node:fs/promises';
import { parentPort } from 'node:worker_threads';

import { init as initJpegDecode } from '@jsquash/jpeg/decode.js';
import { init as initJpegEncode } from '@jsquash/jpeg/encode.js';
import { init as initOxipng } from '@jsquash/oxipng/optimise.js';
import { init as initPngDecode } from '@jsquash/png/decode.js';
import { init as initPngEncode } from '@jsquash/png/encode.js';
import { init as initWebpEncode } from '@jsquash/webp/encode.js';

import {
  encodeRasterAsPng,
  encodeRasterAsJpeg,
  encodeRasterAsOptimisedPng,
  encodeGif,
  optimizeGifLossless,
  optimizeJpegLossless,
  optimizePngLossless,
  restoreContainerMetadata,
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
    initPngDecode(pngEncoder),
    initPngEncode(pngEncoder),
    initOxipng(oxipng),
    initWebpEncode(compiledWebpEncoder),
  ]);
}

await initialiseCodecs();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  new DataView(chunk.buffer).setUint32(0, data.length);
  chunk.set(name, 4);
  chunk.set(data, 8);
  new DataView(chunk.buffer).setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

function fragmentPngIdat(input) {
  const bytes = new Uint8Array(input);
  const parts = [bytes.slice(0, 8)];
  for (let offset = 8; offset < bytes.length;) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const end = offset + length + 12;
    if (type === 'IDAT') {
      for (const byte of bytes.subarray(offset + 8, offset + 8 + length))
        parts.push(pngChunk('IDAT', new Uint8Array([byte])));
    } else parts.push(bytes.slice(offset, end));
    offset = end;
  }
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

function addJpegMetadata(input, seed) {
  const bytes = new Uint8Array(input);
  const payload = new Uint8Array(128 + seed).fill(65 + (seed % 26));
  const segment = new Uint8Array(payload.length + 4);
  segment.set([0xff, 0xe1, (payload.length + 2) >>> 8, (payload.length + 2) & 255]);
  segment.set(payload, 4);
  return Uint8Array.from([...bytes.subarray(0, 2), ...segment, ...bytes.subarray(2)]);
}

function corpusRaster(seed) {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let index = 0; index < 64; index += 1)
    data.set(
      [(index * 17 + seed * 11) & 255, (index * seed * 7) & 255, (255 - index * 3) & 255, 255],
      index * 4,
    );
  return {
    width: 8,
    height: 8,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ durationMs: 0, data }],
  };
}

async function verifyLosslessCorpus() {
  const counts = { png: 0, jpeg: 0, gif: 0 };
  for (let seed = 1; seed <= 17; seed += 1) {
    const image = corpusRaster(seed);
    const png = await optimizePngLossless(fragmentPngIdat(await encodeRasterAsPng(image)));
    if (!png.changed) throw new Error(`PNG corpus item ${seed} was not reduced.`);
    counts.png += 1;
    const jpeg = await optimizeJpegLossless(addJpegMetadata(await encodeRasterAsJpeg(image), seed));
    if (!jpeg.changed) throw new Error(`JPEG corpus item ${seed} was not reduced.`);
    counts.jpeg += 1;
    if (seed <= 16) {
      const comment = new Uint8Array([0x21, 0xfe, 4, 65, 66, 67, 68, 0]);
      const gifInput = restoreContainerMetadata(encodeGif(image), {
        format: 'gif',
        blocks: Array.from({ length: seed + 2 }, () => comment),
      });
      const gif = optimizeGifLossless(gifInput);
      if (!gif.changed) throw new Error(`GIF corpus item ${seed} was not reduced.`);
      counts.gif += 1;
    }
  }
  return counts;
}

parentPort.on('message', async ({ id, corpus }) => {
  try {
    if (corpus) {
      parentPort.postMessage({ id, corpus: await verifyLosslessCorpus() });
      return;
    }
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
    const losslessPng = await optimizePngLossless(plainPng);
    parentPort.postMessage({ id, jpeg, webp, plainPng, png, losslessPng }, [
      jpeg,
      webp,
      plainPng,
      png,
      losslessPng.bytes,
    ]);
  } catch (error) {
    parentPort.postMessage({ id, error: error instanceof Error ? error.stack : String(error) });
  }
});
