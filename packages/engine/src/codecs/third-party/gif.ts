import { decompressFrames, parseGIF } from 'gifuct-js';

import type { RasterImage } from '../../types.js';

export interface GifEncodeOptions {
  /** 0 retains every frame; 1 merges duplicates; 2–3 also encode unchanged pixels as transparent. */
  readonly optimizeLevel?: 0 | 1 | 2 | 3;
  /** Deterministic colour reduction from 0 (off) through 200 (strongest). */
  readonly lossy?: number;
  /** Palette construction strategy. Median-cut uses a weighted histogram over all frames. */
  readonly quantizer?: 'fixed-332' | 'median-cut' | 'octree' | 'wu';
  /** Optional palette-error diffusion. */
  readonly dither?: 'none' | 'ordered' | 'floyd-steinberg';
  /** GIF89a disposal method. Automatic uses background disposal for transparent full frames. */
  readonly disposal?: 'auto' | 'keep' | 'background' | 'previous';
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

function reduceChannel(value: number, lossy = 0): number {
  const strength = Math.max(0, Math.min(200, Math.round(lossy)));
  const levels = Math.max(2, 8 - Math.floor(strength / 34));
  return strength === 0
    ? value
    : Math.round((Math.round((value * (levels - 1)) / 255) * 255) / (levels - 1));
}

function fixedPaletteIndex(red: number, green: number, blue: number, lossy = 0): number {
  red = reduceChannel(red, lossy);
  green = reduceChannel(green, lossy);
  blue = reduceChannel(blue, lossy);
  return 1 + (Math.min(6, red >> 5) << 5) + ((green >> 5) << 2) + (blue >> 6);
}

type HistogramColour = {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly count: number;
};

function colourRanges(box: readonly HistogramColour[]): readonly [number, number, number] {
  let minRed = 255,
    minGreen = 255,
    minBlue = 255,
    maxRed = 0,
    maxGreen = 0,
    maxBlue = 0;
  for (const colour of box) {
    minRed = Math.min(minRed, colour.red);
    minGreen = Math.min(minGreen, colour.green);
    minBlue = Math.min(minBlue, colour.blue);
    maxRed = Math.max(maxRed, colour.red);
    maxGreen = Math.max(maxGreen, colour.green);
    maxBlue = Math.max(maxBlue, colour.blue);
  }
  return [maxRed - minRed, maxGreen - minGreen, maxBlue - minBlue];
}

function medianCutPalette(image: RasterImage, lossy = 0): Uint8Array {
  const histogram = new Map<number, number>();
  for (const frame of image.frames)
    for (let offset = 0; offset < frame.data.length; offset += 4) {
      if (frame.data[offset + 3]! < 128) continue;
      const red = reduceChannel(frame.data[offset]!, lossy);
      const green = reduceChannel(frame.data[offset + 1]!, lossy);
      const blue = reduceChannel(frame.data[offset + 2]!, lossy);
      const key = (red << 16) | (green << 8) | blue;
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
    }
  const colours: HistogramColour[] = [...histogram].map(([key, count]) => ({
    red: key >> 16,
    green: (key >> 8) & 255,
    blue: key & 255,
    count,
  }));
  if (colours.length === 0) colours.push({ red: 0, green: 0, blue: 0, count: 1 });
  let boxes: HistogramColour[][] = [colours];
  while (boxes.length < 255) {
    let selected = -1;
    let selectedRange = -1;
    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index]!;
      if (box.length < 2) continue;
      const range = Math.max(...colourRanges(box));
      if (range > selectedRange) {
        selected = index;
        selectedRange = range;
      }
    }
    if (selected < 0) break;
    const box = boxes[selected]!;
    const ranges = colourRanges(box);
    const channel = ranges.indexOf(Math.max(...ranges));
    box.sort((left, right) =>
      channel === 0
        ? left.red - right.red
        : channel === 1
          ? left.green - right.green
          : left.blue - right.blue,
    );
    const total = box.reduce((sum, colour) => sum + colour.count, 0);
    let accumulated = 0;
    let split = 0;
    while (split < box.length - 1) {
      accumulated += box[split]!.count;
      split += 1;
      if (accumulated >= total / 2) break;
    }
    boxes = [
      ...boxes.slice(0, selected),
      box.slice(0, split),
      box.slice(split),
      ...boxes.slice(selected + 1),
    ];
  }
  const palette = new Uint8Array(256 * 3);
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index]!;
    const total = box.reduce((sum, colour) => sum + colour.count, 0);
    palette[(index + 1) * 3] = Math.round(
      box.reduce((sum, colour) => sum + colour.red * colour.count, 0) / total,
    );
    palette[(index + 1) * 3 + 1] = Math.round(
      box.reduce((sum, colour) => sum + colour.green * colour.count, 0) / total,
    );
    palette[(index + 1) * 3 + 2] = Math.round(
      box.reduce((sum, colour) => sum + colour.blue * colour.count, 0) / total,
    );
  }
  const last = Math.max(1, boxes.length) * 3;
  for (let index = boxes.length + 1; index < 256; index += 1)
    palette.set(palette.subarray(last, last + 3), index * 3);
  return palette;
}

function octreePalette(image: RasterImage, lossy = 0): Uint8Array {
  const histogram = new Map<number, HistogramColour>();
  for (const frame of image.frames)
    for (let offset = 0; offset < frame.data.length; offset += 4) {
      if (frame.data[offset + 3]! < 128) continue;
      const red = reduceChannel(frame.data[offset]!, lossy);
      const green = reduceChannel(frame.data[offset + 1]!, lossy);
      const blue = reduceChannel(frame.data[offset + 2]!, lossy);
      const key = (red << 16) | (green << 8) | blue;
      const previous = histogram.get(key);
      histogram.set(key, { red, green, blue, count: (previous?.count ?? 0) + 1 });
    }
  if (histogram.size === 0) histogram.set(0, { red: 0, green: 0, blue: 0, count: 1 });
  let leaves = new Map<number, HistogramColour[]>();
  for (let depth = 8; depth >= 1; depth -= 1) {
    const shift = 8 - depth;
    const next = new Map<number, HistogramColour[]>();
    for (const colour of histogram.values()) {
      const key =
        ((colour.red >> shift) << (depth * 2)) |
        ((colour.green >> shift) << depth) |
        (colour.blue >> shift);
      const leaf = next.get(key);
      if (leaf) leaf.push(colour);
      else next.set(key, [colour]);
    }
    leaves = next;
    if (leaves.size <= 255) break;
  }
  const palette = new Uint8Array(256 * 3);
  let index = 1;
  for (const leaf of leaves.values()) {
    const total = leaf.reduce((sum, colour) => sum + colour.count, 0);
    palette[index * 3] = Math.round(
      leaf.reduce((sum, colour) => sum + colour.red * colour.count, 0) / total,
    );
    palette[index * 3 + 1] = Math.round(
      leaf.reduce((sum, colour) => sum + colour.green * colour.count, 0) / total,
    );
    palette[index * 3 + 2] = Math.round(
      leaf.reduce((sum, colour) => sum + colour.blue * colour.count, 0) / total,
    );
    index += 1;
  }
  const last = Math.max(1, index - 1) * 3;
  while (index < 256) {
    palette.set(palette.subarray(last, last + 3), index * 3);
    index += 1;
  }
  return palette;
}

type WuCube = {
  red0: number;
  red1: number;
  green0: number;
  green1: number;
  blue0: number;
  blue1: number;
};

const wuSide = 33;
const wuIndex = (red: number, green: number, blue: number) =>
  (red * wuSide + green) * wuSide + blue;

function wuVolume(cube: WuCube, moment: Float64Array): number {
  const { red0, red1, green0, green1, blue0, blue1 } = cube;
  return (
    moment[wuIndex(red1, green1, blue1)]! -
    moment[wuIndex(red1, green1, blue0)]! -
    moment[wuIndex(red1, green0, blue1)]! +
    moment[wuIndex(red1, green0, blue0)]! -
    moment[wuIndex(red0, green1, blue1)]! +
    moment[wuIndex(red0, green1, blue0)]! +
    moment[wuIndex(red0, green0, blue1)]! -
    moment[wuIndex(red0, green0, blue0)]!
  );
}

function wuVariance(cube: WuCube, moments: readonly Float64Array[]): number {
  const weight = wuVolume(cube, moments[0]!);
  if (weight === 0) return 0;
  const red = wuVolume(cube, moments[1]!);
  const green = wuVolume(cube, moments[2]!);
  const blue = wuVolume(cube, moments[3]!);
  return wuVolume(cube, moments[4]!) - (red * red + green * green + blue * blue) / weight;
}

function wuCut(
  cube: WuCube,
  moments: readonly Float64Array[],
): readonly [WuCube, WuCube] | undefined {
  let bestScore = Number.NEGATIVE_INFINITY;
  let best: readonly [keyof WuCube, number] | undefined;
  for (const [low, high] of [
    ['red0', 'red1'],
    ['green0', 'green1'],
    ['blue0', 'blue1'],
  ] as const)
    for (let position = cube[low] + 1; position < cube[high]; position += 1) {
      const first = { ...cube, [high]: position };
      const second = { ...cube, [low]: position };
      const firstWeight = wuVolume(first, moments[0]!);
      const secondWeight = wuVolume(second, moments[0]!);
      if (firstWeight === 0 || secondWeight === 0) continue;
      let score = 0;
      for (let channel = 1; channel <= 3; channel += 1) {
        const firstMoment = wuVolume(first, moments[channel]!);
        const secondMoment = wuVolume(second, moments[channel]!);
        score +=
          (firstMoment * firstMoment) / firstWeight + (secondMoment * secondMoment) / secondWeight;
      }
      if (score > bestScore) {
        bestScore = score;
        best = [high, position];
      }
    }
  if (!best) return undefined;
  const [high, position] = best;
  const low = high.replace('1', '0') as keyof WuCube;
  return [
    { ...cube, [high]: position },
    { ...cube, [low]: position },
  ];
}

function wuPalette(image: RasterImage, lossy = 0): Uint8Array {
  const size = wuSide ** 3;
  const moments = Array.from({ length: 5 }, () => new Float64Array(size));
  for (const frame of image.frames)
    for (let offset = 0; offset < frame.data.length; offset += 4) {
      if (frame.data[offset + 3]! < 128) continue;
      const red = reduceChannel(frame.data[offset]!, lossy);
      const green = reduceChannel(frame.data[offset + 1]!, lossy);
      const blue = reduceChannel(frame.data[offset + 2]!, lossy);
      const index = wuIndex((red >> 3) + 1, (green >> 3) + 1, (blue >> 3) + 1);
      moments[0]![index] = moments[0]![index]! + 1;
      moments[1]![index] = moments[1]![index]! + red;
      moments[2]![index] = moments[2]![index]! + green;
      moments[3]![index] = moments[3]![index]! + blue;
      moments[4]![index] = moments[4]![index]! + red * red + green * green + blue * blue;
    }
  for (const moment of moments)
    for (let red = 1; red < wuSide; red += 1)
      for (let green = 1; green < wuSide; green += 1)
        for (let blue = 1; blue < wuSide; blue += 1) {
          const index = wuIndex(red, green, blue);
          moment[index] =
            moment[index]! +
            moment[wuIndex(red - 1, green, blue)]! +
            moment[wuIndex(red, green - 1, blue)]! +
            moment[wuIndex(red, green, blue - 1)]! -
            moment[wuIndex(red - 1, green - 1, blue)]! -
            moment[wuIndex(red - 1, green, blue - 1)]! -
            moment[wuIndex(red, green - 1, blue - 1)]! +
            moment[wuIndex(red - 1, green - 1, blue - 1)]!;
        }
  let cubes: WuCube[] = [{ red0: 0, red1: 32, green0: 0, green1: 32, blue0: 0, blue1: 32 }];
  while (cubes.length < 255) {
    let selected = -1;
    let variance = 0;
    for (let index = 0; index < cubes.length; index += 1) {
      const next = wuVariance(cubes[index]!, moments);
      if (next > variance) {
        selected = index;
        variance = next;
      }
    }
    if (selected < 0) break;
    const cut = wuCut(cubes[selected]!, moments);
    if (!cut) break;
    cubes = [...cubes.slice(0, selected), ...cut, ...cubes.slice(selected + 1)];
  }
  const palette = new Uint8Array(256 * 3);
  for (let index = 0; index < cubes.length; index += 1) {
    const weight = wuVolume(cubes[index]!, moments[0]!);
    if (weight === 0) continue;
    palette[(index + 1) * 3] = Math.round(wuVolume(cubes[index]!, moments[1]!) / weight);
    palette[(index + 1) * 3 + 1] = Math.round(wuVolume(cubes[index]!, moments[2]!) / weight);
    palette[(index + 1) * 3 + 2] = Math.round(wuVolume(cubes[index]!, moments[3]!) / weight);
  }
  const last = Math.max(1, cubes.length) * 3;
  for (let index = cubes.length + 1; index < 256; index += 1)
    palette.set(palette.subarray(last, last + 3), index * 3);
  return palette;
}

function nearestPaletteIndex(
  palette: Uint8Array,
  red: number,
  green: number,
  blue: number,
): number {
  let selected = 1;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < 256; index += 1) {
    const offset = index * 3;
    const next =
      (red - palette[offset]!) ** 2 +
      (green - palette[offset + 1]!) ** 2 +
      (blue - palette[offset + 2]!) ** 2;
    if (next < distance) {
      distance = next;
      selected = index;
    }
  }
  return selected;
}

function paletteIndexes(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  palette: Uint8Array,
  options: GifEncodeOptions,
): Uint8Array {
  const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
  const indexes = new Uint8Array(width * height);
  let currentErrors = new Float64Array((width + 2) * 3);
  let nextErrors = new Float64Array((width + 2) * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      if (data[offset + 3]! < 128) {
        indexes[pixel] = 0;
        continue;
      }
      const errorOffset = (x + 1) * 3;
      const orderedError =
        options.dither === 'ordered' ? (bayer4[(y % 4) * 4 + (x % 4)]! - 7.5) * 4 : 0;
      const red = Math.max(
        0,
        Math.min(
          255,
          reduceChannel(data[offset]!, options.lossy) + currentErrors[errorOffset]! + orderedError,
        ),
      );
      const green = Math.max(
        0,
        Math.min(
          255,
          reduceChannel(data[offset + 1]!, options.lossy) +
            currentErrors[errorOffset + 1]! +
            orderedError,
        ),
      );
      const blue = Math.max(
        0,
        Math.min(
          255,
          reduceChannel(data[offset + 2]!, options.lossy) +
            currentErrors[errorOffset + 2]! +
            orderedError,
        ),
      );
      const index =
        options.quantizer === 'median-cut' ||
        options.quantizer === 'octree' ||
        options.quantizer === 'wu'
          ? nearestPaletteIndex(palette, red, green, blue)
          : fixedPaletteIndex(red, green, blue);
      indexes[pixel] = index;
      if (options.dither !== 'floyd-steinberg') continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const error = [red, green, blue][channel]! - palette[index * 3 + channel]!;
        currentErrors[errorOffset + 3 + channel]! += (error * 7) / 16;
        nextErrors[errorOffset - 3 + channel]! += (error * 3) / 16;
        nextErrors[errorOffset + channel]! += (error * 5) / 16;
        nextErrors[errorOffset + 3 + channel]! += error / 16;
      }
    }
    currentErrors = nextErrors;
    nextErrors = new Float64Array((width + 2) * 3);
  }
  return indexes;
}

function disposalCode(options: GifEncodeOptions, hasTransparency: boolean): number {
  if (options.disposal === 'background') return 2;
  if (options.disposal === 'previous') return 3;
  if (options.disposal === 'keep') return 1;
  return hasTransparency && (!options.optimizeLevel || options.optimizeLevel < 2) ? 2 : 1;
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
  if (source.width < 1 || source.height < 1 || source.width * source.height > 100_000_000)
    throw new Error('GIF dimensions exceed the safe encode limit.');
  if (source.frames.length > 10_000) throw new Error('GIF exceeds the safe frame-count limit.');
  const bytes: number[] = [...new TextEncoder().encode('GIF89a')];
  push16(bytes, source.width);
  push16(bytes, source.height);
  bytes.push(0xf7, 0, 0); // 256-colour global palette
  const palette =
    options.quantizer === 'median-cut'
      ? medianCutPalette(source, options.lossy)
      : options.quantizer === 'octree'
        ? octreePalette(source, options.lossy)
        : options.quantizer === 'wu'
          ? wuPalette(source, options.lossy)
          : new Uint8Array(256 * 3);
  if (
    options.quantizer !== 'median-cut' &&
    options.quantizer !== 'octree' &&
    options.quantizer !== 'wu'
  ) {
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
    bytes.push(
      0x21,
      0xf9,
      4,
      (disposalCode(options, hasTransparentPixels) << 2) | (hasTransparentPixels ? 1 : 0),
    );
    push16(bytes, Math.max(1, Math.round(frame.durationMs / 10)));
    bytes.push(0, 0);
    bytes.push(0x2c);
    push16(bytes, rectangle.left);
    push16(bytes, rectangle.top);
    push16(bytes, rectangle.width);
    push16(bytes, rectangle.height);
    bytes.push(0, 8);
    const indexes = paletteIndexes(
      rectangle.data,
      rectangle.width,
      rectangle.height,
      palette,
      options,
    );
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
  if (
    parsed.lsd.width < 1 ||
    parsed.lsd.height < 1 ||
    parsed.lsd.width * parsed.lsd.height > 100_000_000
  )
    throw new Error('GIF dimensions exceed the safe decode limit.');
  if (parsed.frames.length > 10_000) throw new Error('GIF exceeds the safe frame-count limit.');
  const decoded = decompressFrames(parsed, true);
  if (decoded.length === 0) throw new Error('GIF contains no image frames.');
  const canvas = new Uint8ClampedArray(parsed.lsd.width * parsed.lsd.height * 4);
  let previousFrame:
    | {
        readonly left: number;
        readonly top: number;
        readonly width: number;
        readonly height: number;
      }
    | undefined;
  let previousDisposal = 0;
  let previousCanvas: Uint8ClampedArray | undefined;
  const frames = decoded.map((frame) => {
    if (previousDisposal === 2 && previousFrame) {
      for (let y = 0; y < previousFrame.height; y += 1) {
        const offset = ((previousFrame.top + y) * parsed.lsd.width + previousFrame.left) * 4;
        canvas.fill(0, offset, offset + previousFrame.width * 4);
      }
    } else if (previousDisposal === 3 && previousCanvas) canvas.set(previousCanvas);
    const restoreCanvas = frame.disposalType === 3 ? canvas.slice() : undefined;
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
    const result = { data: canvas.slice(), durationMs: Math.max(10, frame.delay * 10) };
    previousFrame = frame.dims;
    previousDisposal = frame.disposalType;
    previousCanvas = restoreCanvas;
    return result;
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
