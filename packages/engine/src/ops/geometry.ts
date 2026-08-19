import type { CropOptions, RotateOptions } from '../schemas/options.js';
import type { RasterImage } from '../types.js';
import { createRaster } from './raster.js';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveCropRect(image: RasterImage, options: CropOptions): CropRect {
  const factorX = options.unit === 'percent' ? image.width / 100 : 1;
  const factorY = options.unit === 'percent' ? image.height / 100 : 1;
  const rect =
    options.mode === 'edges'
      ? {
          x: options.cropLeft * factorX,
          y: options.cropTop * factorY,
          width: image.width - (options.cropLeft + options.cropRight) * factorX,
          height: image.height - (options.cropTop + options.cropBottom) * factorY,
        }
      : {
          x: options.x * factorX,
          y: options.y * factorY,
          width: (options.width ?? image.width) * factorX,
          height: (options.height ?? image.height) * factorY,
        };
  const rounding = options.outputRounding;
  return {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(
      rounding,
      Math.floor(Math.min(rect.width, image.width - rect.x) / rounding) * rounding,
    ),
    height: Math.max(
      rounding,
      Math.floor(Math.min(rect.height, image.height - rect.y) / rounding) * rounding,
    ),
  };
}

export function cropRaster(image: RasterImage, options: CropOptions): RasterImage {
  const rect = resolveCropRect(image, options);
  if (rect.x === 0 && rect.y === 0 && rect.width === image.width && rect.height === image.height)
    return image;
  const output = new Uint8ClampedArray(rect.width * rect.height * 4);
  const source = image.frames[0].data;
  for (let y = 0; y < rect.height; y += 1) {
    const start = ((rect.y + y) * image.width + rect.x) * 4;
    output.set(source.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return createRaster(rect.width, rect.height, output);
}

export function flipRaster(
  image: RasterImage,
  horizontal: boolean,
  vertical: boolean,
): RasterImage {
  if (!horizontal && !vertical) return image;
  const output = new Uint8ClampedArray(image.frames[0].data.length);
  const source = image.frames[0].data;
  for (let y = 0; y < image.height; y += 1)
    for (let x = 0; x < image.width; x += 1) {
      const sx = horizontal ? image.width - x - 1 : x;
      const sy = vertical ? image.height - y - 1 : y;
      output.set(
        source.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4),
        (y * image.width + x) * 4,
      );
    }
  return createRaster(image.width, image.height, output);
}

export function rotateRaster(image: RasterImage, options: RotateOptions): RasterImage {
  let angle = options.snap90 ? Math.round(options.angle / 90) * 90 : options.angle;
  angle = ((angle % 360) + 360) % 360;
  let rotated = image;
  if (angle !== 0) {
    const radians = (angle * Math.PI) / 180;
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));
    const width = options.expandCanvas
      ? Math.max(1, Math.round(image.width * cos + image.height * sin))
      : image.width;
    const height = options.expandCanvas
      ? Math.max(1, Math.round(image.width * sin + image.height * cos))
      : image.height;
    const output = new Uint8ClampedArray(width * height * 4);
    const source = image.frames[0].data;
    const cx = (image.width - 1) / 2;
    const cy = (image.height - 1) / 2;
    const ox = (width - 1) / 2;
    const oy = (height - 1) / 2;
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const dx = x - ox;
        const dy = y - oy;
        const sx = Math.round(cos * dx + Math.sin(radians) * dy + cx);
        const sy = Math.round(-Math.sin(radians) * dx + Math.cos(radians) * dy + cy);
        if (sx >= 0 && sx < image.width && sy >= 0 && sy < image.height)
          output.set(
            source.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4),
            (y * width + x) * 4,
          );
      }
    rotated = createRaster(width, height, output);
  }
  return flipRaster(rotated, options.flipH, options.flipV);
}

export function composeCropRects(outer: CropRect, inner: CropRect): CropRect {
  return { x: outer.x + inner.x, y: outer.y + inner.y, width: inner.width, height: inner.height };
}
