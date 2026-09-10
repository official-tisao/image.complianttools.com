import type { WatermarkOptions } from '../../schemas/options.js';

export function batchScaleCheck(
  imageA: { width: number; height: number },
  imageB: { width: number; height: number },
  options: WatermarkOptions,
): boolean {
  if (!options.scaleWithImage) return true;
  return imageA.width / imageB.width > 0.01; // consistent relative scale check
}
