import { decompressFrames, parseGIF } from 'gifuct-js';

import type { RasterImage } from '../../types.js';

export interface GifEncodeOptions {
  /** 0 retains every frame; 1 merges duplicates; 2–3 also encode unchanged pixels as transparent. */
  readonly optimizeLevel?: 0 | 1 | 2 | 3;
  /** Deterministic colour reduction from 0 (off) through 200 (strongest). */
  readonly lossy?: number;
}

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

function paletteIndex(red: number, green: number, blue: number, lossy = 0): number {
  const strength = Math.max(0, Math.min(200, Math.round(lossy)));
  const levels = Math.max(2, 8 - Math.floor(strength / 34));
  const reduce = (value: number) =>
    strength === 0
      ? value
      : Math.round((Math.round((value * (levels - 1)) / 255) * 255) / (levels - 1));
  red = reduce(red);
  green = reduce(green);
  blue = reduce(blue);
  return 1 + (Math.min(6, red >> 5) << 5) + ((green >> 5) << 2) + (blue >> 6);
}

function frameRectangle(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
} {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (data[(y * width + x) * 4 + 3] !== 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  // GIF image blocks cannot be empty; a transparent one-pixel patch preserves the canvas.
  if (right < left) return { left: 0, top: 0, width: 1, height: 1, data: new Uint8ClampedArray(4) };
  const patchWidth = right - left + 1;
  const patchHeight = bottom - top + 1;
  const patch = new Uint8ClampedArray(patchWidth * patchHeight * 4);
  for (let y = 0; y < patchHeight; y += 1)
    patch.set(
      data.subarray(((top + y) * width + left) * 4, ((top + y) * width + left + patchWidth) * 4),
      y * patchWidth * 4,
    );
  return { left, top, width: patchWidth, height: patchHeight, data: patch };
}

/** Encodes local 8-bit frames as an animated GIF89a with a deterministic 3:3:2 global palette. */
export function encodeGif(
  image: RasterImage,
  loopCount = 0,
  options: GifEncodeOptions = {},
): ArrayBuffer {
  const source =
    options.optimizeLevel && options.optimizeLevel > 0
      ? optimiseGifFrames(image, options.optimizeLevel)
      : image;
  const bytes: number[] = [...new TextEncoder().encode('GIF89a')];
  push16(bytes, source.width);
  push16(bytes, source.height);
  bytes.push(0xf7, 0, 0); // 256-colour global palette
  const palette = new Uint8Array(256 * 3);
  for (let red = 0; red < 7; red += 1) {
    for (let green = 0; green < 8; green += 1) {
      for (let blue = 0; blue < 4; blue += 1) {
        const index = 1 + red * 32 + green * 4 + blue;
        palette[index * 3] = red * 36;
        palette[index * 3 + 1] = green * 36;
        palette[index * 3 + 2] = blue * 85;
      }
    }
  }
  bytes.push(...palette);
  bytes.push(0x21, 0xff, 11, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1);
  push16(bytes, loopCount);
  bytes.push(0);
  for (const frame of source.frames) {
    const rectangle =
      options.optimizeLevel && options.optimizeLevel >= 2
        ? frameRectangle(frame.data, source.width, source.height)
        : { left: 0, top: 0, width: source.width, height: source.height, data: frame.data };
    const hasTransparentPixels = frame.data.some(
      (_, index) => index % 4 === 3 && frame.data[index]! < 128,
    );
    bytes.push(0x21, 0xf9, 4, hasTransparentPixels ? 1 : 0);
    push16(bytes, Math.max(1, Math.round(frame.durationMs / 10)));
    bytes.push(0, 0);
    bytes.push(0x2c);
    push16(bytes, rectangle.left);
    push16(bytes, rectangle.top);
    push16(bytes, rectangle.width);
    push16(bytes, rectangle.height);
    bytes.push(0, 8);
    const indexes = new Uint8Array(rectangle.width * rectangle.height);
    for (let pixel = 0; pixel < indexes.length; pixel += 1) {
      const offset = pixel * 4;
      indexes[pixel] = paletteIndex(
        rectangle.data[offset]!,
        rectangle.data[offset + 1]!,
        rectangle.data[offset + 2]!,
        options.lossy,
      );
      if (rectangle.data[offset + 3]! < 128) indexes[pixel] = 0;
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

/**
 * Applies deterministic lossless GIF frame optimisation. Level 1 merges duplicate
 * frames; levels 2 and 3 additionally make pixels unchanged from the preceding
 * frame transparent, which GIF89a composites over the existing canvas.
 */
export function optimiseGifFrames(
  image: RasterImage,
  optimizeLevel: 0 | 1 | 2 | 3 = 1,
): RasterImage {
  if (optimizeLevel === 0) return image;
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
  if (optimizeLevel < 2) return { ...image, frames: frames as unknown as RasterImage['frames'] };
  return {
    ...image,
    frames: frames.map((frame, index) => {
      if (index === 0) return frame;
      const previous = frames[index - 1]!.data;
      const data = frame.data.slice();
      for (let offset = 0; offset < data.length; offset += 4) {
        if (
          data[offset] === previous[offset] &&
          data[offset + 1] === previous[offset + 1] &&
          data[offset + 2] === previous[offset + 2] &&
          data[offset + 3] === previous[offset + 3]
        )
          data[offset + 3] = 0;
      }
      return { ...frame, data };
    }) as unknown as RasterImage['frames'],
  };
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
      for (let x = 0; x < frame.dims.width; x += 1) {
        const sourceOffset = source + x * 4;
        // A transparent patch pixel leaves the GIF canvas unchanged when disposal is "none".
        if (frame.patch[sourceOffset + 3] === 0) continue;
        canvas.set(frame.patch.subarray(sourceOffset, sourceOffset + 4), target + x * 4);
      }
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
