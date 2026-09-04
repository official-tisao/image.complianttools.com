import type { RasterImage } from '../types.js';
import { clampByte, registerFilter } from './framework.js';

/**
 * Posterize: reduce the number of distinct color values per channel.
 * `levels` is the count of distinct values per channel (2..32).
 */
function posterize(image: RasterImage, options: { levels?: number } = {}): RasterImage {
  const rawLevels = options.levels ?? 4;
  const levels = Math.max(2, Math.min(32, Math.floor(rawLevels)));
  const step = 255 / (levels - 1);

  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      output[offset] = clampByte(Math.round((input[offset]! / 255) * (levels - 1)) * step);
      output[offset + 1] = clampByte(Math.round((input[offset + 1]! / 255) * (levels - 1)) * step);
      output[offset + 2] = clampByte(Math.round((input[offset + 2]! / 255) * (levels - 1)) * step);
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

const posterizeFilter = {
  name: 'posterize',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return posterize(image, options as { levels?: number });
  },
  defaultOptions: { levels: 4 },
};

registerFilter(posterizeFilter);

export { posterizeFilter };
