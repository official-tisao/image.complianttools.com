import type { RasterImage } from '../types.js';
import { registerFilter } from './framework.js';

const GRAYSCALE_METHODS = {
  luminance: (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b,
  average: (r: number, g: number, b: number) => (r + g + b) / 3,
  lightness: (r: number, g: number, b: number) => (Math.max(r, g, b) + Math.min(r, g, b)) / 2,
  rec601: (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b,
  'single-channel:R': (r: number, _g: number, _b: number) => r,
  'single-channel:G': (_r: number, g: number, _b: number) => g,
  'single-channel:B': (_r: number, _g: number, b: number) => b,
} as const;

function grayscale(image: RasterImage, options: { method?: string } = {}): RasterImage {
  const method = options.method ?? 'luminance';
  const methodFn =
    GRAYSCALE_METHODS[method as keyof typeof GRAYSCALE_METHODS] ?? GRAYSCALE_METHODS.luminance;

  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      const gray = methodFn(r, g, b);
      const clamped = Math.max(0, Math.min(255, Math.round(gray)));
      output[offset] = clamped;
      output[offset + 1] = clamped;
      output[offset + 2] = clamped;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

const grayscaleFilter = {
  name: 'grayscale',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return grayscale(image, options as { method?: string });
  },
  defaultOptions: { method: 'luminance' },
};

registerFilter(grayscaleFilter);

export { grayscaleFilter };
