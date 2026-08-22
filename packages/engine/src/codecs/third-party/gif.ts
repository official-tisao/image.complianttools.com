import { decompressFrames, parseGIF } from 'gifuct-js';

import type { RasterImage } from '../../types.js';

export interface GifEncodeOptions {
  /** 0 retains every frame; 1 merges duplicates; 2–3 also encode unchanged pixels as transparent. */
  readonly optimizeLevel?: 0 | 1 | 2 | 3;
  /** Deterministic colour reduction from 0 (off) through 200 (strongest). */
  readonly lossy?: number;
  /** Palette construction strategy. Median-cut uses a weighted histogram over all frames. */
  readonly quantizer?: 'fixed-332' | 'median-cut' | 'octree' | 'wu' | 'neural';
  /** Requested total colour-table entries, including a transparency slot when needed. */
  readonly paletteSize?: number;
  /** One shared palette, one palette per frame, or automatic selection based on combined colours. */
  readonly paletteMode?: 'global' | 'per-frame' | 'adaptive';
  /** Palette index used for pixels below the alpha threshold. */
  readonly transparencyIndex?: number;
  /** Optional palette-error diffusion. */
  readonly dither?: 'none' | 'ordered' | 'floyd-steinberg' | 'atkinson' | 'sierra';
  /** Dither strength from 0 (disabled) through 100 (full error/threshold amplitude). */
  readonly ditherAmount?: number;
  /** GIF89a disposal method. Automatic uses background disposal for transparent full frames. */
  readonly disposal?: 'auto' | 'unspecified' | 'none' | 'background' | 'previous';
  /** Store image rows in GIF's four-pass interlaced order. */
  readonly interlace?: boolean;
}

export type GifFrameGenerator = 'forward' | 'reverse' | 'bounce' | 'crossfade';

/** Generates deterministic animation frame sequences without mutating the input raster. */
export function generateGifFrames(
  image: RasterImage,
  mode: GifFrameGenerator = 'forward',
  crossfadeFrames = 2,
): RasterImage {
  if (mode === 'forward') return image;
  if (mode === 'reverse')
    return {
      ...image,
      frames: image.frames.slice().reverse() as unknown as RasterImage['frames'],
    };
  if (mode === 'bounce')
    return {
      ...image,
      frames: [
        ...image.frames,
        ...image.frames.slice(1, -1).reverse(),
      ] as unknown as RasterImage['frames'],
    };
  const count = Math.max(1, Math.min(30, Math.round(crossfadeFrames)));
  const frames: RasterImage['frames'][number][] = [];
  for (let index = 0; index < image.frames.length; index += 1) {
    const current = image.frames[index]!;
    frames.push(current);
    const next = image.frames[index + 1];
    if (!next) continue;
    for (let intermediate = 1; intermediate <= count; intermediate += 1) {
      const amount = intermediate / (count + 1);
      const data = new Uint8ClampedArray(current.data.length);
      for (let offset = 0; offset < data.length; offset += 1)
        data[offset] = Math.round(
          current.data[offset]! * (1 - amount) + next.data[offset]! * amount,
        );
      frames.push({
        data,
        durationMs: Math.max(10, Math.round((current.durationMs + next.durationMs) / 2 / count)),
      });
    }
  }
  return { ...image, frames: frames as unknown as RasterImage['frames'] };
}

function push16(bytes: number[], value: number): void {
  bytes.push(value & 255, value >> 8);
}

function lzwStream(indexes: Uint8Array, minimumCodeSize = 8): Uint8Array {
  if (indexes.length === 0) return Uint8Array.of(0);
  const bytes: number[] = [];
  let bits = 0;
  let count = 0;
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
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
    codeSize = minimumCodeSize + 1;
    nextCode = endCode + 1;
    write(clearCode);
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
  write(endCode);
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

function medianCutPalette(image: RasterImage, lossy = 0, colourLimit = 255): Uint8Array {
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
  while (boxes.length < colourLimit) {
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
  const palette = new Uint8Array((colourLimit + 1) * 3);
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
  for (let index = boxes.length + 1; index <= colourLimit; index += 1)
    palette.set(palette.subarray(last, last + 3), index * 3);
  return palette;
}

function octreePalette(image: RasterImage, lossy = 0, colourLimit = 255): Uint8Array {
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
    if (leaves.size <= colourLimit) break;
  }
  const palette = new Uint8Array((colourLimit + 1) * 3);
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
  while (index <= colourLimit) {
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

function wuPalette(image: RasterImage, lossy = 0, colourLimit = 255): Uint8Array {
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
  while (cubes.length < colourLimit) {
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
  const palette = new Uint8Array((colourLimit + 1) * 3);
  for (let index = 0; index < cubes.length; index += 1) {
    const weight = wuVolume(cubes[index]!, moments[0]!);
    if (weight === 0) continue;
    palette[(index + 1) * 3] = Math.round(wuVolume(cubes[index]!, moments[1]!) / weight);
    palette[(index + 1) * 3 + 1] = Math.round(wuVolume(cubes[index]!, moments[2]!) / weight);
    palette[(index + 1) * 3 + 2] = Math.round(wuVolume(cubes[index]!, moments[3]!) / weight);
  }
  const last = Math.max(1, cubes.length) * 3;
  for (let index = cubes.length + 1; index <= colourLimit; index += 1)
    palette.set(palette.subarray(last, last + 3), index * 3);
  return palette;
}

/** Independent deterministic self-organizing-map quantizer; no NeuQuant code is used. */
function neuralPalette(image: RasterImage, lossy = 0, colourLimit = 255): Uint8Array {
  const samples: number[] = [];
  const opaquePixels = image.frames.reduce(
    (total, frame) =>
      total +
      frame.data.reduce(
        (count, alpha, index) => count + (index % 4 === 3 && alpha >= 128 ? 1 : 0),
        0,
      ),
    0,
  );
  const stride = Math.max(1, Math.floor(opaquePixels / 4096));
  let seen = 0;
  for (const frame of image.frames)
    for (let offset = 0; offset < frame.data.length; offset += 4) {
      if (frame.data[offset + 3]! < 128) continue;
      if (seen % stride === 0 && samples.length < 4096 * 3)
        samples.push(
          reduceChannel(frame.data[offset]!, lossy),
          reduceChannel(frame.data[offset + 1]!, lossy),
          reduceChannel(frame.data[offset + 2]!, lossy),
        );
      seen += 1;
    }
  if (samples.length === 0) samples.push(0, 0, 0);
  const neurons = new Float64Array(colourLimit * 3);
  const sampleCount = samples.length / 3;
  for (let neuron = 0; neuron < colourLimit; neuron += 1) {
    const sample = Math.min(sampleCount - 1, Math.floor((neuron * sampleCount) / colourLimit));
    neurons.set(samples.slice(sample * 3, sample * 3 + 3), neuron * 3);
  }
  for (let epoch = 0; epoch < 10; epoch += 1) {
    const progress = epoch / 9;
    const learningRate = 0.45 * (1 - progress) + 0.04 * progress;
    const radius = Math.max(1, Math.round(24 * (1 - progress)));
    const step = 1 + ((epoch * 499) % sampleCount);
    for (let iteration = 0, sample = epoch % sampleCount; iteration < sampleCount; iteration += 1) {
      const source = sample * 3;
      let winner = 0;
      let distance = Number.POSITIVE_INFINITY;
      for (let neuron = 0; neuron < colourLimit; neuron += 1) {
        const target = neuron * 3;
        const next =
          (samples[source]! - neurons[target]!) ** 2 +
          (samples[source + 1]! - neurons[target + 1]!) ** 2 +
          (samples[source + 2]! - neurons[target + 2]!) ** 2;
        if (next < distance) {
          distance = next;
          winner = neuron;
        }
      }
      const first = Math.max(0, winner - radius);
      const last = Math.min(colourLimit - 1, winner + radius);
      for (let neuron = first; neuron <= last; neuron += 1) {
        const influence = learningRate * (1 - Math.abs(neuron - winner) / (radius + 1));
        const target = neuron * 3;
        neurons[target] = neurons[target]! + (samples[source]! - neurons[target]!) * influence;
        neurons[target + 1] =
          neurons[target + 1]! + (samples[source + 1]! - neurons[target + 1]!) * influence;
        neurons[target + 2] =
          neurons[target + 2]! + (samples[source + 2]! - neurons[target + 2]!) * influence;
      }
      sample = (sample + step) % sampleCount;
    }
  }
  const palette = new Uint8Array((colourLimit + 1) * 3);
  for (let neuron = 0; neuron < colourLimit; neuron += 1)
    for (let channel = 0; channel < 3; channel += 1)
      palette[(neuron + 1) * 3 + channel] = Math.round(neurons[neuron * 3 + channel]!);
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
  for (let index = 1; index < palette.length / 3; index += 1) {
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
  const nearestCache = new Map<number, number>();
  const cacheable = !options.dither || options.dither === 'none';
  let currentErrors = new Float64Array((width + 4) * 3);
  let nextErrors = new Float64Array((width + 4) * 3);
  let laterErrors = new Float64Array((width + 4) * 3);
  const ditherAmount = Math.max(0, Math.min(100, options.ditherAmount ?? 100)) / 100;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      if (data[offset + 3]! < 128) {
        indexes[pixel] = 0;
        continue;
      }
      const errorOffset = (x + 2) * 3;
      const orderedError =
        options.dither === 'ordered'
          ? (bayer4[(y % 4) * 4 + (x % 4)]! - 7.5) * 4 * ditherAmount
          : 0;
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
      const cacheKey = (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue);
      let index = cacheable ? nearestCache.get(cacheKey) : undefined;
      if (index === undefined) {
        index = nearestPaletteIndex(palette, red, green, blue);
        if (cacheable) nearestCache.set(cacheKey, index);
      }
      indexes[pixel] = index;
      if (!['floyd-steinberg', 'atkinson', 'sierra'].includes(options.dither ?? '')) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const error = ([red, green, blue][channel]! - palette[index * 3 + channel]!) * ditherAmount;
        const add = (row: Float64Array, delta: number, weight: number) => {
          const target = errorOffset + delta * 3 + channel;
          row[target] = row[target]! + error * weight;
        };
        if (options.dither === 'floyd-steinberg') {
          add(currentErrors, 1, 7 / 16);
          add(nextErrors, -1, 3 / 16);
          add(nextErrors, 0, 5 / 16);
          add(nextErrors, 1, 1 / 16);
        } else if (options.dither === 'atkinson') {
          add(currentErrors, 1, 1 / 8);
          add(currentErrors, 2, 1 / 8);
          add(nextErrors, -1, 1 / 8);
          add(nextErrors, 0, 1 / 8);
          add(nextErrors, 1, 1 / 8);
          add(laterErrors, 0, 1 / 8);
        } else {
          add(currentErrors, 1, 5 / 32);
          add(currentErrors, 2, 3 / 32);
          for (const [delta, weight] of [
            [-2, 2 / 32],
            [-1, 4 / 32],
            [0, 5 / 32],
            [1, 4 / 32],
            [2, 2 / 32],
          ] as const)
            add(nextErrors, delta, weight);
          add(laterErrors, -1, 2 / 32);
          add(laterErrors, 0, 3 / 32);
          add(laterErrors, 1, 2 / 32);
        }
      }
    }
    currentErrors = nextErrors;
    nextErrors = laterErrors;
    laterErrors = new Float64Array((width + 4) * 3);
  }
  return indexes;
}

function fixedPalette(colourLimit: number): Uint8Array {
  const canonical: number[][] = [];
  for (let red = 0; red < 7; red += 1)
    for (let green = 0; green < 8; green += 1)
      for (let blue = 0; blue < 4; blue += 1) canonical.push([red * 36, green * 36, blue * 85]);
  const palette = new Uint8Array((colourLimit + 1) * 3);
  for (let index = 0; index < colourLimit; index += 1) {
    const colour = canonical[Math.floor((index * canonical.length) / colourLimit)]!;
    palette.set(colour, (index + 1) * 3);
  }
  return palette;
}

function buildPalette(
  image: RasterImage,
  options: GifEncodeOptions,
  colourLimit: number,
): Uint8Array {
  if (options.quantizer === 'median-cut')
    return medianCutPalette(image, options.lossy, colourLimit);
  if (options.quantizer === 'octree') return octreePalette(image, options.lossy, colourLimit);
  if (options.quantizer === 'wu') return wuPalette(image, options.lossy, colourLimit);
  if (options.quantizer === 'neural') return neuralPalette(image, options.lossy, colourLimit);
  return fixedPalette(colourLimit);
}

function padPalette(palette: Uint8Array, entries: number): Uint8Array {
  if (palette.length === entries * 3) return palette;
  const output = new Uint8Array(entries * 3);
  output.set(palette);
  const last = Math.max(0, palette.length - 3);
  for (let index = palette.length / 3; index < entries; index += 1)
    output.set(palette.subarray(last, last + 3), index * 3);
  return output;
}

function remapTransparency(
  palette: Uint8Array,
  indexes: Uint8Array,
  transparencyIndex: number,
): { readonly palette: Uint8Array; readonly indexes: Uint8Array } {
  if (transparencyIndex === 0) return { palette, indexes };
  const mappedPalette = palette.slice();
  const transparentColour = mappedPalette.slice(0, 3);
  mappedPalette.copyWithin(0, transparencyIndex * 3, transparencyIndex * 3 + 3);
  mappedPalette.set(transparentColour, transparencyIndex * 3);
  const mappedIndexes = indexes.slice();
  for (let index = 0; index < mappedIndexes.length; index += 1) {
    if (mappedIndexes[index] === 0) mappedIndexes[index] = transparencyIndex;
    else if (mappedIndexes[index] === transparencyIndex) mappedIndexes[index] = 0;
  }
  return { palette: mappedPalette, indexes: mappedIndexes };
}

function distinctOpaqueColours(image: RasterImage, stopAfter: number): number {
  const colours = new Set<number>();
  for (const frame of image.frames)
    for (let offset = 0; offset < frame.data.length; offset += 4) {
      if (frame.data[offset + 3]! < 128) continue;
      colours.add(
        (frame.data[offset]! << 16) | (frame.data[offset + 1]! << 8) | frame.data[offset + 2]!,
      );
      if (colours.size > stopAfter) return colours.size;
    }
  return colours.size;
}

function disposalCode(options: GifEncodeOptions, hasTransparency: boolean): number {
  if (options.disposal === 'unspecified') return 0;
  if (options.disposal === 'background') return 2;
  if (options.disposal === 'previous') return 3;
  if (options.disposal === 'none') return 1;
  return hasTransparency && (!options.optimizeLevel || options.optimizeLevel < 2) ? 2 : 1;
}

function interlaceIndexes(indexes: Uint8Array, width: number, height: number): Uint8Array {
  const output = new Uint8Array(indexes.length);
  let target = 0;
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ] as const)
    for (let y = start; y < height; y += step) {
      output.set(indexes.subarray(y * width, (y + 1) * width), target);
      target += width;
    }
  return output;
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

/** Encodes local 8-bit frames as an animated GIF89a with configurable palette generation. */
export function encodeGif(
  image: RasterImage,
  loopCount: number | null = 0,
  options: GifEncodeOptions = {},
): ArrayBuffer {
  if (loopCount !== null && (!Number.isInteger(loopCount) || loopCount < 0 || loopCount > 65_535))
    throw new Error('GIF loop count must be an integer from 0 through 65535.');
  const source =
    options.optimizeLevel && options.optimizeLevel > 0
      ? optimiseGifFrames(image, options.optimizeLevel)
      : image;
  if (source.width < 1 || source.height < 1 || source.width * source.height > 100_000_000)
    throw new Error('GIF dimensions exceed the safe encode limit.');
  if (source.frames.length > 10_000) throw new Error('GIF exceeds the safe frame-count limit.');
  if (
    source.frames.some(
      (frame) =>
        !Number.isFinite(frame.durationMs) || frame.durationMs < 0 || frame.durationMs > 655_350,
    )
  )
    throw new Error('GIF frame delays must be between 0 and 655350 milliseconds.');
  const requestedEntries = Math.max(2, Math.min(256, Math.round(options.paletteSize ?? 256)));
  const tableEntries = 2 ** Math.ceil(Math.log2(requestedEntries));
  const tableSizeCode = Math.log2(tableEntries) - 1;
  const minimumCodeSize = Math.max(2, Math.log2(tableEntries));
  const colourLimit = requestedEntries - 1;
  const requestedMode = options.paletteMode ?? 'global';
  const paletteMode =
    requestedMode === 'adaptive'
      ? distinctOpaqueColours(source, colourLimit) <= colourLimit
        ? 'global'
        : 'per-frame'
      : requestedMode;
  const transparencyIndex = Math.max(
    0,
    Math.min(tableEntries - 1, Math.round(options.transparencyIndex ?? 0)),
  );
  const globalPalette =
    paletteMode === 'global'
      ? padPalette(buildPalette(source, options, colourLimit), tableEntries)
      : undefined;
  const prepared = source.frames.map((frame) => {
    const rectangle =
      options.optimizeLevel && options.optimizeLevel >= 2
        ? frameRectangle(frame.data, source.width, source.height)
        : { left: 0, top: 0, width: source.width, height: source.height, data: frame.data };
    const frameImage = {
      ...source,
      width: rectangle.width,
      height: rectangle.height,
      frames: [{ data: rectangle.data, durationMs: frame.durationMs }],
    } as RasterImage;
    const palette =
      globalPalette ?? padPalette(buildPalette(frameImage, options, colourLimit), tableEntries);
    let indexes = paletteIndexes(
      rectangle.data,
      rectangle.width,
      rectangle.height,
      palette,
      options,
    );
    const remapped = remapTransparency(palette, indexes, transparencyIndex);
    indexes = remapped.indexes;
    if (options.interlace) indexes = interlaceIndexes(indexes, rectangle.width, rectangle.height);
    return { frame, rectangle, palette: remapped.palette, indexes };
  });
  const bytes: number[] = [...new TextEncoder().encode('GIF89a')];
  push16(bytes, source.width);
  push16(bytes, source.height);
  bytes.push(globalPalette ? 0xf0 | tableSizeCode : 0x70, 0, 0);
  if (globalPalette)
    bytes.push(...remapTransparency(globalPalette, new Uint8Array(), transparencyIndex).palette);
  if (loopCount !== null) {
    bytes.push(0x21, 0xff, 11, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1);
    push16(bytes, loopCount);
    bytes.push(0);
  }
  for (const { frame, rectangle, palette, indexes } of prepared) {
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
    bytes.push(transparencyIndex, 0);
    bytes.push(0x2c);
    push16(bytes, rectangle.left);
    push16(bytes, rectangle.top);
    push16(bytes, rectangle.width);
    push16(bytes, rectangle.height);
    bytes.push((globalPalette ? 0 : 0x80 | tableSizeCode) | (options.interlace ? 0x40 : 0));
    if (!globalPalette) bytes.push(...palette);
    bytes.push(minimumCodeSize);
    const data = lzwStream(indexes, minimumCodeSize);
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
 * frame transparent. Level 3 also canonicalizes invisible RGB beneath zero alpha
 * so visually identical transparent frames can merge.
 */
export function optimiseGifFrames(
  image: RasterImage,
  optimizeLevel: 0 | 1 | 2 | 3 = 1,
): RasterImage {
  if (optimizeLevel === 0) return image;
  const frames: { data: Uint8ClampedArray; durationMs: number }[] = [];
  for (const frame of image.frames) {
    const sourceData = frame.data.slice();
    if (optimizeLevel >= 3)
      for (let offset = 0; offset < sourceData.length; offset += 4)
        if (sourceData[offset + 3] === 0) sourceData.fill(0, offset, offset + 3);
    const previous = frames.at(-1);
    if (
      previous &&
      previous.data.length === sourceData.length &&
      previous.data.every((value, index) => value === sourceData[index])
    ) {
      previous.durationMs += frame.durationMs;
    } else {
      frames.push({ data: sourceData, durationMs: frame.durationMs });
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
    // gifuct-js exposes the GIF centisecond delay converted to milliseconds.
    const result = {
      data: canvas.slice(),
      durationMs: Number.isFinite(frame.delay) ? Math.max(10, frame.delay) : 10,
    };
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

/** Returns the Netscape animation loop count, or `null` when no loop extension is present. */
export function readGifLoopCount(input: ArrayBuffer | Uint8Array): number | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const signature = new TextEncoder().encode('NETSCAPE2.0');
  for (let offset = 0; offset <= bytes.length - signature.length; offset += 1) {
    let matches = true;
    for (let index = 0; index < signature.length; index += 1)
      if (bytes[offset + index] !== signature[index]) {
        matches = false;
        break;
      }
    if (!matches) continue;
    const subBlock = offset + signature.length;
    if (bytes[subBlock] === 3 && bytes[subBlock + 1] === 1 && bytes[subBlock + 4] === 0)
      return bytes[subBlock + 2]! | (bytes[subBlock + 3]! << 8);
  }
  return null;
}

function gifRasterSequenceEquals(left: RasterImage, right: RasterImage): boolean {
  if (
    left.width !== right.width ||
    left.height !== right.height ||
    left.frames.length !== right.frames.length
  )
    return false;
  return left.frames.every((frame, frameIndex) => {
    const other = right.frames[frameIndex]!;
    return (
      frame.durationMs === other.durationMs &&
      frame.data.length === other.data.length &&
      frame.data.every((value, index) => value === other.data[index])
    );
  });
}

export interface LosslessGifOptimizationResult {
  readonly bytes: ArrayBuffer;
  readonly changed: boolean;
  readonly originalBytes: number;
  readonly optimizedBytes: number;
}

/**
 * Conservatively optimizes a GIF and independently verifies rendered frames,
 * timing, dimensions, and loop semantics before returning changed bytes.
 */
export function optimizeGifLossless(
  input: ArrayBuffer | Uint8Array,
): LosslessGifOptimizationResult {
  const source = input instanceof Uint8Array ? input.slice() : new Uint8Array(input.slice(0));
  const original = decodeGif(source);
  const loopCount = readGifLoopCount(source);
  let best = source;
  for (const optimizeLevel of [3, 2, 1, 0] as const) {
    const candidate = new Uint8Array(
      encodeGif(original, loopCount, {
        optimizeLevel,
        paletteMode: 'per-frame',
        paletteSize: 256,
        quantizer: 'wu',
        dither: 'none',
        disposal: 'none',
      }),
    );
    if (candidate.byteLength >= best.byteLength) continue;
    try {
      const decoded = decodeGif(candidate);
      if (readGifLoopCount(candidate) === loopCount && gifRasterSequenceEquals(original, decoded))
        best = candidate;
    } catch {
      // A failed verification candidate is ignored; the original remains authoritative.
    }
  }
  return {
    bytes: best.buffer.slice(best.byteOffset, best.byteOffset + best.byteLength),
    changed: best.byteLength < source.byteLength,
    originalBytes: source.byteLength,
    optimizedBytes: best.byteLength,
  };
}
