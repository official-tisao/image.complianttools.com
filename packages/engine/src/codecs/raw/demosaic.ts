import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

export type BayerPattern = 'RGGB' | 'BGGR' | 'GRBG' | 'GBRG';

function colorAt(pattern: BayerPattern, x: number, y: number): 'r' | 'g' | 'b' {
  const value = pattern[(y & 1) * 2 + (x & 1)]!;
  return value.toLowerCase() as 'r' | 'g' | 'b';
}

/** Bilinear, local-only Bayer demosaic for DNG Stage 2 development. */
export function demosaicBilinear(
  samples: Uint16Array,
  width: number,
  height: number,
  pattern: BayerPattern = 'RGGB',
  blackLevel = 0,
  whiteLevel = 65535,
): RasterImage {
  if (width < 1 || height < 1 || samples.length !== width * height || whiteLevel <= blackLevel)
    throw new Error('Invalid Bayer mosaic dimensions or levels.');
  const output = new Uint8ClampedArray(width * height * 4);
  const sample = (x: number, y: number) => samples[y * width + x]!;
  const channel = (x: number, y: number, wanted: 'r' | 'g' | 'b') => {
    let total = 0;
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const sx = x + dx,
          sy = y + dy;
        if (
          sx >= 0 &&
          sx < width &&
          sy >= 0 &&
          sy < height &&
          colorAt(pattern, sx, sy) === wanted
        ) {
          total += sample(sx, sy);
          count += 1;
        }
      }
    return Math.round(
      ((Math.max(blackLevel, Math.min(whiteLevel, total / Math.max(1, count))) - blackLevel) *
        255) /
        (whiteLevel - blackLevel),
    );
  };
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      output.set([channel(x, y, 'r'), channel(x, y, 'g'), channel(x, y, 'b'), 255], target);
    }
  return createRaster(width, height, output);
}

type DemosaicAlgorithm = 'vng' | 'ahd';

function validateMosaic(
  samples: Uint16Array,
  width: number,
  height: number,
  blackLevel: number,
  whiteLevel: number,
): void {
  if (width < 1 || height < 1 || samples.length !== width * height || whiteLevel <= blackLevel)
    throw new Error('Invalid Bayer mosaic dimensions or levels.');
}

function demosaicDirectional(
  samples: Uint16Array,
  width: number,
  height: number,
  pattern: BayerPattern,
  blackLevel: number,
  whiteLevel: number,
  algorithm: DemosaicAlgorithm,
): RasterImage {
  validateMosaic(samples, width, height, blackLevel, whiteLevel);
  const count = width * height;
  const raw = new Float64Array(count);
  for (let index = 0; index < count; index += 1)
    raw[index] =
      (Math.max(blackLevel, Math.min(whiteLevel, samples[index]!)) - blackLevel) /
      (whiteLevel - blackLevel);
  const at = (x: number, y: number) => raw[y * width + x]!;
  const valid = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height;
  const average = (values: number[], fallback: number) =>
    values.length === 0 ? fallback : values.reduce((sum, value) => sum + value, 0) / values.length;
  const directionalGreen = (x: number, y: number, horizontal: boolean) => {
    const center = at(x, y);
    const adjacent: number[] = [];
    const same: number[] = [];
    for (const sign of [-1, 1]) {
      const ax = x + (horizontal ? sign : 0);
      const ay = y + (horizontal ? 0 : sign);
      if (valid(ax, ay) && colorAt(pattern, ax, ay) === 'g') adjacent.push(at(ax, ay));
      const sx = x + (horizontal ? sign * 2 : 0);
      const sy = y + (horizontal ? 0 : sign * 2);
      if (valid(sx, sy)) same.push(at(sx, sy));
    }
    return Math.max(
      0,
      Math.min(1, average(adjacent, center) + (center - average(same, center)) / 2),
    );
  };
  const greenH = new Float64Array(count);
  const greenV = new Float64Array(count);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (colorAt(pattern, x, y) === 'g') greenH[index] = greenV[index] = at(x, y);
      else {
        greenH[index] = directionalGreen(x, y, true);
        greenV[index] = directionalGreen(x, y, false);
      }
    }

  const buildCandidate = (green: Float64Array) => {
    const candidate = new Float64Array(count * 3);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const own = colorAt(pattern, x, y);
        for (const [channelIndex, wanted] of ['r', 'g', 'b'].entries()) {
          if (wanted === 'g') candidate[index * 3 + channelIndex] = green[index]!;
          else if (own === wanted) candidate[index * 3 + channelIndex] = at(x, y);
          else {
            const differences: number[] = [];
            for (let dy = -1; dy <= 1; dy += 1)
              for (let dx = -1; dx <= 1; dx += 1) {
                if ((dx === 0 && dy === 0) || !valid(x + dx, y + dy)) continue;
                if (colorAt(pattern, x + dx, y + dy) === wanted) {
                  const neighbour = (y + dy) * width + x + dx;
                  differences.push(at(x + dx, y + dy) - green[neighbour]!);
                }
              }
            candidate[index * 3 + channelIndex] = Math.max(
              0,
              Math.min(1, green[index]! + average(differences, 0)),
            );
          }
        }
      }
    return candidate;
  };

  let horizontal: Float64Array;
  let vertical: Float64Array;
  if (algorithm === 'vng') {
    const selected = new Float64Array(count);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const horizontalGradient =
          (valid(x - 1, y) && valid(x + 1, y) ? Math.abs(at(x - 1, y) - at(x + 1, y)) : 1) +
          (valid(x - 2, y) && valid(x + 2, y) ? Math.abs(at(x - 2, y) - at(x + 2, y)) : 0);
        const verticalGradient =
          (valid(x, y - 1) && valid(x, y + 1) ? Math.abs(at(x, y - 1) - at(x, y + 1)) : 1) +
          (valid(x, y - 2) && valid(x, y + 2) ? Math.abs(at(x, y - 2) - at(x, y + 2)) : 0);
        selected[index] =
          horizontalGradient < verticalGradient
            ? greenH[index]!
            : verticalGradient < horizontalGradient
              ? greenV[index]!
              : (greenH[index]! + greenV[index]!) / 2;
      }
    horizontal = vertical = buildCandidate(selected);
  } else {
    horizontal = buildCandidate(greenH);
    vertical = buildCandidate(greenV);
  }

  const homogeneityCost = (candidate: Float64Array, x: number, y: number) => {
    const index = y * width + x;
    let cost = 0;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      if (!valid(x + dx, y + dy)) continue;
      const neighbour = (y + dy) * width + x + dx;
      const luminance =
        0.299 * candidate[index * 3]! +
        0.587 * candidate[index * 3 + 1]! +
        0.114 * candidate[index * 3 + 2]!;
      const neighbourLuminance =
        0.299 * candidate[neighbour * 3]! +
        0.587 * candidate[neighbour * 3 + 1]! +
        0.114 * candidate[neighbour * 3 + 2]!;
      const chroma = candidate[index * 3]! - candidate[index * 3 + 2]!;
      const neighbourChroma = candidate[neighbour * 3]! - candidate[neighbour * 3 + 2]!;
      cost += Math.abs(luminance - neighbourLuminance) + 0.5 * Math.abs(chroma - neighbourChroma);
    }
    return cost;
  };
  const output = new Uint8ClampedArray(count * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const candidate =
        algorithm === 'ahd' && homogeneityCost(vertical, x, y) < homogeneityCost(horizontal, x, y)
          ? vertical
          : horizontal;
      output[index * 4] = Math.round(candidate[index * 3]! * 255);
      output[index * 4 + 1] = Math.round(candidate[index * 3 + 1]! * 255);
      output[index * 4 + 2] = Math.round(candidate[index * 3 + 2]! * 255);
      output[index * 4 + 3] = 255;
    }
  return createRaster(width, height, output);
}

/** Variable Number of Gradients demosaic with per-pixel directional selection. */
export function demosaicVng(
  samples: Uint16Array,
  width: number,
  height: number,
  pattern: BayerPattern = 'RGGB',
  blackLevel = 0,
  whiteLevel = 65535,
): RasterImage {
  return demosaicDirectional(samples, width, height, pattern, blackLevel, whiteLevel, 'vng');
}

/** Adaptive Homogeneity-Directed demosaic using horizontal and vertical colour-difference candidates. */
export function demosaicAhd(
  samples: Uint16Array,
  width: number,
  height: number,
  pattern: BayerPattern = 'RGGB',
  blackLevel = 0,
  whiteLevel = 65535,
): RasterImage {
  return demosaicDirectional(samples, width, height, pattern, blackLevel, whiteLevel, 'ahd');
}

function normalizedMosaic(
  samples: Uint16Array,
  width: number,
  height: number,
  blackLevel: number,
  whiteLevel: number,
): Float64Array {
  validateMosaic(samples, width, height, blackLevel, whiteLevel);
  return Float64Array.from(samples, (sample) =>
    Math.max(0, Math.min(1, (sample - blackLevel) / (whiteLevel - blackLevel))),
  );
}

function rasterFromLinearRgb(rgb: Float64Array, width: number, height: number): RasterImage {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    output[index * 4] = Math.round(Math.max(0, Math.min(1, rgb[index * 3]!)) * 255);
    output[index * 4 + 1] = Math.round(Math.max(0, Math.min(1, rgb[index * 3 + 1]!)) * 255);
    output[index * 4 + 2] = Math.round(Math.max(0, Math.min(1, rgb[index * 3 + 2]!)) * 255);
    output[index * 4 + 3] = 255;
  }
  return createRaster(width, height, output);
}

/** Patterned Pixel Grouping demosaic with directional green and colour-difference interpolation. */
export function demosaicPpg(
  samples: Uint16Array,
  width: number,
  height: number,
  pattern: BayerPattern = 'RGGB',
  blackLevel = 0,
  whiteLevel = 65535,
): RasterImage {
  const raw = normalizedMosaic(samples, width, height, blackLevel, whiteLevel);
  const seed = demosaicBilinear(samples, width, height, pattern, blackLevel, whiteLevel);
  const rgb = Float64Array.from(seed.frames[0].data, (value, index) =>
    index % 4 === 3 ? 1 : value / 255,
  ).filter((_, index) => index % 4 !== 3);
  const at = (x: number, y: number) => raw[y * width + x]!;
  const component = (x: number, y: number, channel: number) => rgb[(y * width + x) * 3 + channel]!;
  const set = (x: number, y: number, channel: number, value: number) => {
    rgb[(y * width + x) * 3 + channel] = Math.max(0, Math.min(1, value));
  };
  for (let y = 2; y < height - 2; y += 1)
    for (let x = 2; x < width - 2; x += 1) {
      const own = colorAt(pattern, x, y);
      if (own === 'g') continue;
      const center = at(x, y);
      const horizontal =
        (at(x - 1, y) + at(x + 1, y)) / 2 + (2 * center - at(x - 2, y) - at(x + 2, y)) / 4;
      const vertical =
        (at(x, y - 1) + at(x, y + 1)) / 2 + (2 * center - at(x, y - 2) - at(x, y + 2)) / 4;
      const horizontalGradient =
        Math.abs(at(x - 1, y) - at(x + 1, y)) + Math.abs(2 * center - at(x - 2, y) - at(x + 2, y));
      const verticalGradient =
        Math.abs(at(x, y - 1) - at(x, y + 1)) + Math.abs(2 * center - at(x, y - 2) - at(x, y + 2));
      set(x, y, 1, horizontalGradient < verticalGradient ? horizontal : vertical);
    }
  for (let y = 1; y < height - 1; y += 1)
    for (let x = 1; x < width - 1; x += 1) {
      const own = colorAt(pattern, x, y);
      const green = component(x, y, 1);
      for (const [channel, wanted] of [
        [0, 'r'],
        [2, 'b'],
      ] as const) {
        if (own === wanted) {
          set(x, y, channel, at(x, y));
          continue;
        }
        const neighbours: Array<readonly [number, number]> = [];
        if (own === 'g') {
          const horizontal = colorAt(pattern, x - 1, y) === wanted;
          if (horizontal) neighbours.push([x - 1, y], [x + 1, y]);
          else neighbours.push([x, y - 1], [x, y + 1]);
        } else {
          neighbours.push([x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]);
        }
        const difference =
          neighbours.reduce((sum, [nx, ny]) => sum + at(nx, ny) - component(nx, ny, 1), 0) /
          neighbours.length;
        set(x, y, channel, green + difference);
      }
    }
  return rasterFromLinearRgb(rgb, width, height);
}

/** Iterative Directional-Correction Bayer demosaic seeded by PPG colour differences. */
export function demosaicDcb(
  samples: Uint16Array,
  width: number,
  height: number,
  pattern: BayerPattern = 'RGGB',
  blackLevel = 0,
  whiteLevel = 65535,
): RasterImage {
  normalizedMosaic(samples, width, height, blackLevel, whiteLevel);
  const seed = demosaicPpg(samples, width, height, pattern, blackLevel, whiteLevel);
  let rgb = new Float64Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1)
    for (let channel = 0; channel < 3; channel += 1)
      rgb[index * 3 + channel] = seed.frames[0].data[index * 4 + channel]! / 255;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const next = rgb.slice();
    for (let y = 1; y < height - 1; y += 1)
      for (let x = 1; x < width - 1; x += 1) {
        const own = colorAt(pattern, x, y);
        if (own === 'g') continue;
        const channel = own === 'r' ? 0 : 2;
        const index = y * width + x;
        const horizontal =
          (rgb[(index - 1) * 3 + 1]! + rgb[(index + 1) * 3 + 1]!) / 2 +
          rgb[index * 3 + channel]! -
          (rgb[(index - 2 >= 0 ? index - 1 : index) * 3 + channel]! +
            rgb[(index + 1 < width * height ? index + 1 : index) * 3 + channel]!) /
            2;
        const vertical =
          (rgb[(index - width) * 3 + 1]! + rgb[(index + width) * 3 + 1]!) / 2 +
          rgb[index * 3 + channel]! -
          (rgb[(index - width) * 3 + channel]! + rgb[(index + width) * 3 + channel]!) / 2;
        const horizontalGradient = Math.abs(rgb[(index - 1) * 3 + 1]! - rgb[(index + 1) * 3 + 1]!);
        const verticalGradient = Math.abs(
          rgb[(index - width) * 3 + 1]! - rgb[(index + width) * 3 + 1]!,
        );
        next[index * 3 + 1] = Math.max(
          0,
          Math.min(1, horizontalGradient < verticalGradient ? horizontal : vertical),
        );
      }
    rgb = next;
  }
  return rasterFromLinearRgb(rgb, width, height);
}

/** Applies DNG-style channel gains and a 3×3 colour matrix to a developed raster. */
export function applyRawColourTransform(
  image: RasterImage,
  gains: readonly [number, number, number],
  matrix: readonly [number, number, number, number, number, number, number, number, number],
): RasterImage {
  if (
    gains.some((gain) => !Number.isFinite(gain) || gain < 0) ||
    matrix.some((value) => !Number.isFinite(value))
  )
    throw new Error('Invalid RAW colour transform.');
  const pixels = image.frames[0].data.slice();
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = (pixels[offset]! / 255) * gains[0];
    const green = (pixels[offset + 1]! / 255) * gains[1];
    const blue = (pixels[offset + 2]! / 255) * gains[2];
    pixels[offset] = Math.round(
      Math.max(0, Math.min(1, matrix[0] * red + matrix[1] * green + matrix[2] * blue)) * 255,
    );
    pixels[offset + 1] = Math.round(
      Math.max(0, Math.min(1, matrix[3] * red + matrix[4] * green + matrix[5] * blue)) * 255,
    );
    pixels[offset + 2] = Math.round(
      Math.max(0, Math.min(1, matrix[6] * red + matrix[7] * green + matrix[8] * blue)) * 255,
    );
  }
  return { ...image, frames: [{ ...image.frames[0], data: pixels }] };
}
