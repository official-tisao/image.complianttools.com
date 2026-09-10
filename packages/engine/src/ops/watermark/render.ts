import type { WatermarkOptions } from '../schemas/options.js';

export function renderWatermark(
  imageData: Uint8ClampedArray,
  options: WatermarkOptions,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(imageData.length);
  out.set(imageData);
  if (!options.enabled || options.kind === 'none') return out;
  // v1: deterministic overlay (no-op for text/image overlay; scaleWithImage handled by caller)
  return out;
}
