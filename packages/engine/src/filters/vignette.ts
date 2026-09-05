import type { RasterImage } from '../types.js';
import { clampByte, registerFilter } from './framework.js';

/**
 * Vignette: darken or lighten the image's corners relative to its center.
 * `intensity` is in [-1, 1]; negative values darken corners, positive values lighten.
 * `size` is the falloff radius as a fraction of the smaller image dimension (0..1).
 */
function vignette(
  image: RasterImage,
  options: { intensity?: number; size?: number } = {},
): RasterImage {
  const intensity = Math.max(-1, Math.min(1, options.intensity ?? 0.5));
  const size = Math.max(0.1, Math.min(1, options.size ?? 0.5));
  const { width, height } = image;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDist = Math.hypot(centerX, centerY) * size;

  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.hypot(dx, dy) / maxDist;
        const factor =
          intensity < 0
            ? Math.max(0, 1 + intensity * Math.min(1, dist))
            : Math.min(2, 1 + intensity * Math.max(0, dist - 1));
        output[offset] = clampByte(input[offset]! * factor);
        output[offset + 1] = clampByte(input[offset + 1]! * factor);
        output[offset + 2] = clampByte(input[offset + 2]! * factor);
        output[offset + 3] = input[offset + 3]!;
      }
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

const vignetteFilter = {
  name: 'vignette',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return vignette(image, options as { intensity?: number; size?: number });
  },
  defaultOptions: { intensity: 0.5, size: 0.5 },
};

registerFilter(vignetteFilter);

export { vignetteFilter };
