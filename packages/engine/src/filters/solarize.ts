import type { RasterImage } from '../types.js';
import { clampByte, registerFilter } from './framework.js';

/**
 * Solarize: invert all channel values above a threshold.
 * `threshold` is the cutoff value (0..255) above which channels are inverted.
 */
function solarize(image: RasterImage, options: { threshold?: number } = {}): RasterImage {
  const threshold = clampByte(options.threshold ?? 128);

  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      output[offset] = r > threshold ? 255 - r : r;
      output[offset + 1] = g > threshold ? 255 - g : g;
      output[offset + 2] = b > threshold ? 255 - b : b;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

const solarizeFilter = {
  name: 'solarize',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return solarize(image, options as { threshold?: number });
  },
  defaultOptions: { threshold: 128 },
};

registerFilter(solarizeFilter);

export { solarizeFilter };
