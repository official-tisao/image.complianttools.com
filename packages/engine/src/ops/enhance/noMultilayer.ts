import type { RasterImage } from '../../types.js';

/**
 * noMultilayer: flatten a multi-frame image to a single frame. The
 * engine's `RasterImage` model is per-frame: there is no "layer" concept
 * in the canvas, so the operation is the existing per-frame collapse
 * (`frames[0]`), with the rest discarded. Returns the source instance
 * when there is only one frame (the no-op case).
 *
 * The `enabled` flag from the schema is not consulted here — it is
 * only a recipe-level gate. The function is the engine primitive.
 */
export function applyNoMultilayer(image: RasterImage): RasterImage {
  if (image.frames.length <= 1) return image;
  return { ...image, frames: [image.frames[0]!] as unknown as RasterImage['frames'] };
}
