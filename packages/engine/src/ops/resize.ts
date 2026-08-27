import type { RasterImage } from '../types.js';
import type { ResizeOptions } from '../schemas/options.js';

export function resolveResizeDimensions(
  image: Pick<RasterImage, 'width' | 'height'>,
  options: ResizeOptions,
): { width: number; height: number } {
  let width = image.width;
  let height = image.height;
  if (options.mode === 'pixels') {
    width = options.width ?? Math.round(image.width * (options.height! / image.height));
    height = options.height ?? Math.round(image.height * (options.width! / image.width));
    if (!options.lockAspect && options.width !== undefined && options.height !== undefined)
      ({ width, height } = options);
  } else if (options.mode === 'percent') {
    width = Math.round((image.width * options.scale!) / 100);
    height = Math.round((image.height * options.scale!) / 100);
  } else if (options.mode === 'reduceBy') {
    width = Math.round(image.width * (1 - options.percent! / 100));
    height = Math.round(image.height * (1 - options.percent! / 100));
  } else if (options.mode === 'targetBytes') {
    const target = options.value! * (options.unit === 'MB' ? 1_000_000 : 1_000);
    const scale = Math.sqrt(target / Math.max(1, image.width * image.height * 4));
    width = Math.round(image.width * scale);
    height = Math.round(image.height * scale);
  } else {
    const scaleX = options.width! / image.width;
    const scaleY = options.height! / image.height;
    const scale =
      options.fitMode === 'cover' || options.fitMode === 'outside'
        ? Math.max(scaleX, scaleY)
        : Math.min(scaleX, scaleY);
    if (options.fitMode === 'fill' || options.fitMode === 'pad') {
      width = options.width!;
      height = options.height!;
    } else {
      width = Math.round(image.width * scale);
      height = Math.round(image.height * scale);
    }
  }
  if (!options.allowUpscale && (width > image.width || height > image.height))
    ({ width, height } = image);
  width = Math.max(options.roundTo, Math.round(width / options.roundTo) * options.roundTo);
  height = Math.max(options.roundTo, Math.round(height / options.roundTo) * options.roundTo);
  if (width * height > options.maxPixels)
    throw new RangeError(
      `Requested resize is ${width * height} pixels; maxPixels is ${options.maxPixels}.`,
    );
  return { width, height };
}

interface Contribution {
  readonly indexes: Int32Array;
  readonly weights: Float64Array;
}

function sinc(value: number): number {
  if (Math.abs(value) < 1e-12) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

function cubic(value: number, b: number, c: number): number {
  const distance = Math.abs(value);
  if (distance < 1)
    return (
      ((12 - 9 * b - 6 * c) * distance ** 3 +
        (-18 + 12 * b + 6 * c) * distance ** 2 +
        (6 - 2 * b)) /
      6
    );
  if (distance < 2)
    return (
      ((-b - 6 * c) * distance ** 3 +
        (6 * b + 30 * c) * distance ** 2 +
        (-12 * b - 48 * c) * distance +
        (8 * b + 24 * c)) /
      6
    );
  return 0;
}

function kernelFor(algorithm: ResizeOptions['algorithm']): {
  readonly support: number;
  readonly sample: (distance: number) => number;
} {
  switch (algorithm) {
    case 'box':
      return { support: 0.5, sample: (distance) => (Math.abs(distance) <= 0.5 ? 1 : 0) };
    case 'bilinear':
      return { support: 1, sample: (distance) => Math.max(0, 1 - Math.abs(distance)) };
    case 'lanczos2':
      return {
        support: 2,
        sample: (distance) => (Math.abs(distance) < 2 ? sinc(distance) * sinc(distance / 2) : 0),
      };
    case 'lanczos3':
      return {
        support: 3,
        sample: (distance) => (Math.abs(distance) < 3 ? sinc(distance) * sinc(distance / 3) : 0),
      };
    case 'mitchell':
      return { support: 2, sample: (distance) => cubic(distance, 1 / 3, 1 / 3) };
    case 'catmull-rom':
      return { support: 2, sample: (distance) => cubic(distance, 0, 1 / 2) };
    case 'bicubic':
      return { support: 2, sample: (distance) => cubic(distance, 0, 3 / 4) };
    case 'magic-kernel':
      return { support: 2, sample: (distance) => cubic(distance, 1, 0) };
    default:
      throw new Error(`No resampling kernel is defined for ${algorithm}.`);
  }
}

function contributions(
  sourceSize: number,
  targetSize: number,
  algorithm: ResizeOptions['algorithm'],
) {
  const kernel = kernelFor(algorithm);
  const scale = targetSize / sourceSize;
  const filterScale = Math.min(1, scale);
  const radius = kernel.support / filterScale;
  const result: Contribution[] = [];
  for (let target = 0; target < targetSize; target += 1) {
    const center = ((target + 0.5) * sourceSize) / targetSize - 0.5;
    const combined = new Map<number, number>();
    for (
      let source = Math.ceil(center - radius);
      source <= Math.floor(center + radius);
      source += 1
    ) {
      const index = Math.max(0, Math.min(sourceSize - 1, source));
      const weight = kernel.sample((center - source) * filterScale) * filterScale;
      if (weight !== 0) combined.set(index, (combined.get(index) ?? 0) + weight);
    }
    const sum = [...combined.values()].reduce((total, weight) => total + weight, 0);
    if (Math.abs(sum) < 1e-12) {
      const index = Math.max(0, Math.min(sourceSize - 1, Math.round(center)));
      result.push({ indexes: Int32Array.of(index), weights: Float64Array.of(1) });
      continue;
    }
    result.push({
      indexes: Int32Array.from(combined.keys()),
      weights: Float64Array.from(combined.values(), (weight) => weight / sum),
    });
  }
  return result;
}

function resizeNearest(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.max(
      0,
      Math.min(sourceHeight - 1, Math.round(((y + 0.5) * sourceHeight) / targetHeight - 0.5)),
    );
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.max(
        0,
        Math.min(sourceWidth - 1, Math.round(((x + 0.5) * sourceWidth) / targetWidth - 0.5)),
      );
      output.set(
        source.subarray(
          (sourceY * sourceWidth + sourceX) * 4,
          (sourceY * sourceWidth + sourceX) * 4 + 4,
        ),
        (y * targetWidth + x) * 4,
      );
    }
  }
  return output;
}

function resizeSeparable(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  algorithm: ResizeOptions['algorithm'],
): Uint8ClampedArray {
  const horizontalWeights = contributions(sourceWidth, targetWidth, algorithm);
  const verticalWeights = contributions(sourceHeight, targetHeight, algorithm);
  const horizontal = new Float32Array(targetWidth * sourceHeight * 4);
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const contribution = horizontalWeights[x]!;
      const target = (y * targetWidth + x) * 4;
      for (let sample = 0; sample < contribution.indexes.length; sample += 1) {
        const sourceOffset = (y * sourceWidth + contribution.indexes[sample]!) * 4;
        const weight = contribution.weights[sample]!;
        const alpha = source[sourceOffset + 3]! / 255;
        horizontal[target] = horizontal[target]! + source[sourceOffset]! * alpha * weight;
        horizontal[target + 1] =
          horizontal[target + 1]! + source[sourceOffset + 1]! * alpha * weight;
        horizontal[target + 2] =
          horizontal[target + 2]! + source[sourceOffset + 2]! * alpha * weight;
        horizontal[target + 3] = horizontal[target + 3]! + source[sourceOffset + 3]! * weight;
      }
    }
  }
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const contribution = verticalWeights[y]!;
    for (let x = 0; x < targetWidth; x += 1) {
      const target = (y * targetWidth + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let sample = 0; sample < contribution.indexes.length; sample += 1) {
        const sourceOffset = (contribution.indexes[sample]! * targetWidth + x) * 4;
        const weight = contribution.weights[sample]!;
        red += horizontal[sourceOffset]! * weight;
        green += horizontal[sourceOffset + 1]! * weight;
        blue += horizontal[sourceOffset + 2]! * weight;
        alpha += horizontal[sourceOffset + 3]! * weight;
      }
      const unpremultiply = alpha > 1e-6 ? 255 / alpha : 0;
      output[target] = Math.round(red * unpremultiply);
      output[target + 1] = Math.round(green * unpremultiply);
      output[target + 2] = Math.round(blue * unpremultiply);
      output[target + 3] = Math.round(alpha);
    }
  }
  return output;
}

export function resizeRaster(image: RasterImage, options: ResizeOptions): RasterImage {
  const dimensions = resolveResizeDimensions(image, options);
  if (dimensions.width === image.width && dimensions.height === image.height) return image;
  return {
    ...image,
    width: dimensions.width,
    height: dimensions.height,
    bitDepth: 8,
    frames: image.frames.map((frame) => ({
      ...frame,
      data:
        options.algorithm === 'nearest'
          ? resizeNearest(
              frame.data,
              image.width,
              image.height,
              dimensions.width,
              dimensions.height,
            )
          : resizeSeparable(
              frame.data,
              image.width,
              image.height,
              dimensions.width,
              dimensions.height,
              options.algorithm,
            ),
    })) as unknown as RasterImage['frames'],
  };
}
