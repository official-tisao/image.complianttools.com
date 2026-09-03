import type { RasterImage } from '../types.js';
import { registerFilter } from './framework.js';

export function negate(image: RasterImage, options: { channels?: string } = {}): RasterImage {
  const channels = options.channels ?? 'rgb';
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = options.channels?.includes('r') ? 255 - input[offset]! : input[offset]!;
      const g = options.channels?.includes('g') ? 255 - input[offset + 1]! : input[offset + 1]!;
      const b = options.channels?.includes('b') ? 255 - input[offset + 2]! : input[offset + 2]!;
      const a = input[offset + 3]!;
      output[offset] = r;
      output[offset + 1] = g;
      output[offset + 2] = b;
      output[offset + 3] = a;
    }
    return { ...frame, data: output };
  });
  
  return { ...image, frames: newFrames };
}

const negateFilter = {
  name: 'negate',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return negate(image, options as { channels?: string });
  },
  defaultOptions: { channels: 'rgb' },
};

export { negateFilter };