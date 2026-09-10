/**
 * P3-06 T31 Enlarge.
 * Classic upscale using the existing resize pipeline with allowUpscale=true.
 */
import type { RasterImage } from '../types.js';
import { resizeRaster } from '../ops/resize.js';
import { ResizeOptionsSchema } from '../schemas/options.js';

export interface EnlargeOptions {
  readonly scale?: number; // e.g., 2 = 200%
  readonly allowUpscale?: boolean;
}

export function enlarge(image: RasterImage, options: EnlargeOptions = {}): RasterImage {
  const scale = options.scale ?? 2;
  const newW = Math.round(image.width * scale);
  const newH = Math.round(image.height * scale);
  return resizeRaster(image, ResizeOptionsSchema.parse({
    mode: 'pixels',
    width: newW,
    height: newH,
    lockAspect: true,
    algorithm: 'lanczos3',
    allowUpscale: true,
  }));
}
