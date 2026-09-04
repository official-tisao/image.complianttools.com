import type { RasterImage } from '../types.js';
import { registerFilter, clampByte } from './framework.js';

export function sepia(image: RasterImage, options: { intensity?: number } = {}): RasterImage {
  const intensity = Math.max(0, Math.min(1, options.intensity ?? 1));

  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      const a = input[offset + 3]!;

      const sr = clampByte(0.393 * r + 0.769 * g + 0.189 * b);
      const sg = clampByte(0.349 * r + 0.686 * g + 0.168 * b);
      const sb = clampByte(0.272 * r + 0.534 * g + 0.131 * b);

      output[offset] = clampByte(r + (sr - r) * intensity);
      output[offset + 1] = clampByte(g + (sg - g) * intensity);
      output[offset + 2] = clampByte(b + (sb - b) * intensity);
      output[offset + 3] = a;
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

const sepiaFilter = {
  name: 'sepia',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return sepia(image, options as { intensity?: number });
  },
  defaultOptions: { intensity: 1 },
};

registerFilter(sepiaFilter);

export { sepiaFilter };
