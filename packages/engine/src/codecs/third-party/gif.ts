import { decompressFrames, parseGIF } from 'gifuct-js';

import type { RasterImage } from '../../types.js';

function push16(bytes: number[], value: number): void {
  bytes.push(value & 255, value >> 8);
}

function lzwStream(indexes: Uint8Array): Uint8Array {
  if (indexes.length === 0) return Uint8Array.of(0);
  const bytes: number[] = [];
  let bits = 0;
  let count = 0;
  let codeSize = 9;
  let nextCode = 258;
  let dictionary = new Map<string, number>();
  const write = (code: number) => {
    bits |= code << count;
    count += codeSize;
    while (count >= 8) {
      bytes.push(bits & 255);
      bits >>>= 8;
      count -= 8;
    }
  };
  const reset = () => {
    dictionary = new Map<string, number>();
    codeSize = 9;
    nextCode = 258;
    write(256);
  };
  reset();
  let prefix = String(indexes[0]!);
  for (let offset = 1; offset < indexes.length; offset += 1) {
    const value = indexes[offset]!;
    const phrase = `${prefix},${value}`;
    const existing = dictionary.get(phrase);
    if (existing !== undefined) {
      prefix = phrase;
      continue;
    }
    write(dictionary.get(prefix) ?? Number(prefix));
    if (nextCode < 4096) {
      dictionary.set(phrase, nextCode++);
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize += 1;
    } else {
      reset();
    }
    prefix = String(value);
  }
  write(dictionary.get(prefix) ?? Number(prefix));
  write(257);
  if (count) bytes.push(bits & 255);
  return Uint8Array.from(bytes);
}

function paletteIndex(red: number, green: number, blue: number): number {
  return 1 + (Math.min(6, red >> 5) << 5) + ((green >> 5) << 2) + (blue >> 6);
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
    const hasTransparentPixels = frame.data.some(
      (_, index) => index % 4 === 3 && frame.data[index]! < 128,
    );
    bytes.push(0x21, 0xf9, 4, hasTransparentPixels ? 1 : 0);
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
      if (frame.data[offset + 3]! < 128) indexes[pixel] = 0;
    }
    const data = lzwStream(indexes);
    for (let offset = 0; offset < data.length; offset += 255) {
      const block = data.subarray(offset, offset + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes).buffer;
}

/** Losslessly merges consecutive identical GIF frames before encoding. */
export function optimiseGifFrames(image: RasterImage): RasterImage {
  const frames: { data: Uint8ClampedArray; durationMs: number }[] = [];
  for (const frame of image.frames) {
    const previous = frames.at(-1);
    if (
      previous &&
      previous.data.length === frame.data.length &&
      previous.data.every((value, index) => value === frame.data[index])
    ) {
      previous.durationMs += frame.durationMs;
    } else {
      frames.push({ data: frame.data.slice(), durationMs: frame.durationMs });
    }
  }
  return { ...image, frames: frames as unknown as RasterImage['frames'] };
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
