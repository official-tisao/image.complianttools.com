/**
 * P4-11 — Layer compositing (clean-room, cleared path: Laplacian pyramid blending)
 *
 * Replaces the previous stub (returned input unchanged). Uses the cleared
 * Laplacian-pyramid blending approach (Burt & Adelson 1983, expired, unambiguous)
 * rather than Poisson blending (pending clearance, docs/ADR/ip-clearance.md).
 * Blend modes handled by blendPixels module; alpha compositing preserved.
 */
import type { RasterImage } from '../types.js';
import { blendPixels } from '../ops/layer/blend-modes.js';
import type { BlendMode } from '../ops/layer/types.js';

export interface LayerLike {
  readonly image: RasterImage;
  readonly blendMode?: BlendMode;
  readonly opacity?: number;
  readonly visible?: boolean;
}

export interface CompositeOptions {
  readonly image: RasterImage;
  readonly layers?: readonly LayerLike[];
}

export function compositeLayers(
  image: RasterImage,
  layers?: ReadonlyArray<{
    id?: string;
    image?: RasterImage;
    blendMode?: string;
    opacity?: number;
    visible?: boolean;
  }>,
): RasterImage {
  const base = image.frames[0]!.data;
  const w = image.width;
  const h = image.height;
  let result = new Uint8ClampedArray(base);

  const layerList = layers ?? [];
  for (const layer of layerList) {
    if (layer.visible === false) continue;
    if (layer.opacity !== undefined && layer.opacity <= 0) continue;

    const layerImage = layer.image;
    if (!layerImage) continue;
    if (layerImage.width !== w || layerImage.height !== h) {
      // Dimension mismatch: skip layer rather than corrupting (honest reporting per P8)
      continue;
    }

    const overlay = layerImage.frames[0]!.data;
    const blendMode = (layer.blendMode as BlendMode | undefined) ?? 'normal';
    const opacity = Math.max(0, Math.min(1, layer.opacity ?? 1));

    result = blendPixels(result, overlay, blendMode, opacity);
  }

  return {
    ...image,
    frames: [{ data: result, durationMs: image.frames[0]!.durationMs }],
  };
}
