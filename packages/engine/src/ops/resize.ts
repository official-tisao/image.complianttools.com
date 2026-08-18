import type { RasterImage } from '../types.js';
import type { ResizeOptions } from '../schemas/options.js';
import { createRaster } from './raster.js';

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

export function resizeRaster(image: RasterImage, options: ResizeOptions): RasterImage {
  const dimensions = resolveResizeDimensions(image, options);
  if (dimensions.width === image.width && dimensions.height === image.height) return image;
  const output = new Uint8ClampedArray(dimensions.width * dimensions.height * 4);
  const source = image.frames[0].data;
  const nearest = options.algorithm === 'nearest' || options.algorithm === 'box';
  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      const sourceX = ((x + 0.5) * image.width) / dimensions.width - 0.5;
      const sourceY = ((y + 0.5) * image.height) / dimensions.height - 0.5;
      const target = (y * dimensions.width + x) * 4;
      if (nearest) {
        const sx = Math.max(0, Math.min(image.width - 1, Math.round(sourceX)));
        const sy = Math.max(0, Math.min(image.height - 1, Math.round(sourceY)));
        output.set(
          source.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4),
          target,
        );
      } else {
        const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(sourceX)));
        const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(sourceY)));
        const x1 = Math.min(image.width - 1, x0 + 1);
        const y1 = Math.min(image.height - 1, y0 + 1);
        const tx = Math.max(0, sourceX - x0);
        const ty = Math.max(0, sourceY - y0);
        for (let channel = 0; channel < 4; channel += 1) {
          const top =
            source[(y0 * image.width + x0) * 4 + channel]! * (1 - tx) +
            source[(y0 * image.width + x1) * 4 + channel]! * tx;
          const bottom =
            source[(y1 * image.width + x0) * 4 + channel]! * (1 - tx) +
            source[(y1 * image.width + x1) * 4 + channel]! * tx;
          output[target + channel] = Math.round(top * (1 - ty) + bottom * ty);
        }
      }
    }
  }
  return createRaster(dimensions.width, dimensions.height, output);
}
