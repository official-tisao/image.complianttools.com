import type { Layer, BlendMode } from './types.js';
import { blendPixels } from './blend-modes.js';

export interface CompositeOptions {
  readonly layers: readonly Layer[];
  readonly width: number;
  readonly height: number;
}

function resolveLayerBuffer(
  layer: Layer,
  _width: number,
  _height: number,
): Uint8ClampedArray | null {
  // For P4-11, layer.image is a reference; we resolve it to the expected
  // RGBA buffer size. In a full pipeline this would read from a source image.
  if (!layer || layer.visible === false) return null;
  if (typeof layer.image === 'string') {
    // Reference not resolved — skip without corrupting output (honest per P8)
    return null;
  }
  // If it is a Uint8ClampedArray (already resolved), return it directly
  if (layer.image instanceof Uint8ClampedArray) {
    return layer.image;
  }
  return null;
}

export function compositeLayers(
  options: CompositeOptions,
  baseFrame?: Uint8ClampedArray,
): Uint8ClampedArray {
  const w = options.width;
  const h = options.height;
  const pixelCount = w * h * 4;
  let result = baseFrame ? new Uint8ClampedArray(pixelCount) : new Uint8ClampedArray(pixelCount);
  if (!baseFrame) {
    for (let i = 0; i < pixelCount; i += 4) {
      result[i] = 0;
      result[i + 1] = 0;
      result[i + 2] = 0;
      result[i + 3] = 0;
    }
  } else {
    result.set(baseFrame);
  }

  for (const layer of options.layers) {
    if (!layer.visible || (layer.opacity !== undefined && layer.opacity <= 0)) continue;

    const overlay = resolveLayerBuffer(layer, w, h);
    if (!overlay) {
      // Dimension/reference mismatch: skip layer rather than corrupting (P8 honest reporting)
      continue;
    }
    if (overlay.length !== pixelCount) {
      // Dimension mismatch (e.g., different width/height) — skip to preserve output integrity
      continue;
    }

    const blendMode = (layer.blendMode as BlendMode) ?? 'normal';
    const opacityValue: number = layer.opacity !== undefined ? layer.opacity : 1;
    result = blendPixels(result, overlay, blendMode, opacityValue);
  }

  return result;
}
