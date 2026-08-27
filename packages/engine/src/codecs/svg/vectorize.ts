import imageTracer from 'imagetracerjs';

import type { RasterImage } from '../../types.js';

export interface VectorizeOptions {
  readonly colors?: number;
  readonly curveTolerance?: number;
}

/** Vectorizes the first local raster frame to a self-contained SVG. */
export function vectorizeRaster(image: RasterImage, options: VectorizeOptions = {}): string {
  const colors = options.colors ?? 16;
  const curveTolerance = options.curveTolerance ?? 1;
  if (!Number.isInteger(colors) || colors < 2 || colors > 64)
    throw new Error('Vector colour count must be a whole number from 2 to 64.');
  if (!Number.isFinite(curveTolerance) || curveTolerance < 0.01 || curveTolerance > 10)
    throw new Error('Vector curve tolerance must be between 0.01 and 10.');
  return imageTracer.imagedataToSVG(
    { width: image.width, height: image.height, data: image.frames[0].data },
    { numberofcolors: colors, ltres: curveTolerance, qtres: curveTolerance },
  );
}
