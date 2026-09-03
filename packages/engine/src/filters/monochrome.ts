import type { RasterImage } from '../types.js';
import { registerFilter, clampByte } from './framework.js';

export function monochrome(image: RasterImage, options: { threshold?: number; dither?: string } = {}): RasterImage {
  const threshold = options.threshold ?? 128;
  const dither = options.dither ?? 'none';
  
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const value = gray >= threshold ? 255 : 0;
      output[offset] = value;
      output[offset + 1] = value;
      output[offset + 2] = value;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });
  
  return { ...image, frames: newFrames };
}

const monochromeFilter = {
  name: 'monochrome',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return monochrome(image, options as { threshold?: number; dither?: string });
  },
  defaultOptions: { threshold: 128, dither: 'none' },
};

export { monochromeFilter };