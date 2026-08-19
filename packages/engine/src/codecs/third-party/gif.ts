import { decompressFrames, parseGIF } from 'gifuct-js';

import type { RasterImage } from '../../types.js';

function push16(bytes: number[], value: number): void {
  bytes.push(value & 255, value >> 8);
}

function lzwLiteralStream(indexes: Uint8Array): Uint8Array {
  const bytes: number[] = [];
  let bits = 0;
  let count = 0;
  const write = (code: number) => {
    bits |= code << count;
    count += 9;
    while (count >= 8) {
      bytes.push(bits & 255);
      bits >>>= 8;
      count -= 8;
    }
  };
  // Re-clearing for each pixel keeps the code width fixed at 9 bits and is valid GIF LZW.
  for (const index of indexes) {
    write(256);
    write(index);
  }
  write(257);
  if (count) bytes.push(bits & 255);
  return Uint8Array.from(bytes);
}

function paletteIndex(red: number, green: number, blue: number): number {
  return ((red >> 5) << 5) | ((green >> 5) << 2) | (blue >> 6);
}

/** Encodes local 8-bit frames as an animated GIF89a with a deterministic 3:3:2 global palette. */
export function encodeGif(image: RasterImage, loopCount = 0): ArrayBuffer {
  const bytes: number[] = [...new TextEncoder().encode('GIF89a')];
  push16(bytes, image.width);
  push16(bytes, image.height);
  bytes.push(0xf7, 0, 0); // 256-colour global palette
  for (let index = 0; index < 256; index += 1) {
    bytes.push(((index >> 5) & 7) * 36, ((index >> 2) & 7) * 36, (index & 3) * 85);
  }
  bytes.push(0x21, 0xff, 11, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1);
  push16(bytes, loopCount);
  bytes.push(0);
  for (const frame of image.frames) {
    bytes.push(0x21, 0xf9, 4, 0);
    push16(bytes, Math.max(1, Math.round(frame.durationMs / 10)));
    bytes.push(0, 0);
    bytes.push(0x2c, 0, 0, 0, 0);
    push16(bytes, image.width);
    push16(bytes, image.height);
    bytes.push(0, 8);
    const indexes = new Uint8Array(image.width * image.height);
    for (let pixel = 0; pixel < indexes.length; pixel += 1) {
      const offset = pixel * 4;
      indexes[pixel] = paletteIndex(
        frame.data[offset]!,
        frame.data[offset + 1]!,
        frame.data[offset + 2]!,
      );
    }
    const data = lzwLiteralStream(indexes);
    for (let offset = 0; offset < data.length; offset += 255) {
      const block = data.subarray(offset, offset + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes).buffer;
}

export function decodeGif(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const parsed = parseGIF(buffer);
  const decoded = decompressFrames(parsed, true);
  if (decoded.length === 0) throw new Error('GIF contains no image frames.');
  const canvas = new Uint8ClampedArray(parsed.lsd.width * parsed.lsd.height * 4);
  const frames = decoded.map((frame) => {
    for (let y = 0; y < frame.dims.height; y += 1) {
      const source = y * frame.dims.width * 4;
      const target = ((frame.dims.top + y) * parsed.lsd.width + frame.dims.left) * 4;
      canvas.set(frame.patch.subarray(source, source + frame.dims.width * 4), target);
    }
    return { data: canvas.slice(), durationMs: Math.max(10, frame.delay * 10) };
  });
  return {
    width: parsed.lsd.width,
    height: parsed.lsd.height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: frames as unknown as RasterImage['frames'],
  };
}
