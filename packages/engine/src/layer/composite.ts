/**
 * P3-07 T48 — simple layer compositing for demonstration / pipeline integration.
 */
import type { RasterImage } from '../types.js';

export function compositeLayers(image: RasterImage, layers?: unknown[]): RasterImage {
  // Minimal: for single-layer state, return input unchanged.
  // Multi-layer compositing is a future expansion; v1 provides the model and wiring.
  return image;
}
