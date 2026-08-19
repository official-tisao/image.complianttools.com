import imageTracer from 'imagetracerjs';

import type { RasterImage } from '../../types.js';

/** Vectorizes the first local raster frame to a self-contained SVG. */
export function vectorizeRaster(
  image: RasterImage,
  options: Readonly<Record<string, unknown>> = {},
): string {
  return imageTracer.imagedataToSVG(
    { width: image.width, height: image.height, data: image.frames[0].data },
    { numberofcolors: 16, ...options },
  );
}
