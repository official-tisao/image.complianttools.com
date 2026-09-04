import type { RasterImage } from '../types.js';
import { registerFilter, clampByte } from './framework.js';

export function retro(image: RasterImage, options: { intensity?: number } = {}): RasterImage {
  const intensity = Math.max(0, Math.min(1, options.intensity ?? 0.5));

  const w = image.width;
  const h = image.height;
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      let r = input[offset]!;
      let g = input[offset + 1]!;
      let b = input[offset + 2]!;
      const a = input[offset + 3]!;

      // Sepia tone base
      const sr = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
      const sg = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
      const sb = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);

      // Add vignette-like darkening at edges
      const x = (offset / 4) % w;
      const y = Math.floor(offset / 4 / w);
      const dx = (x - w / 2) / (w / 2);
      const dy = (y - h / 2) / (h / 2);
      const vignette = 1 - 0.3 * intensity * (dx * dx + dy * dy);

      r = clampByte(r + (sr - r) * intensity);
      g = clampByte(g + (sg - g) * intensity);
      b = clampByte(b + (sb - b) * intensity);

      r = clampByte(r * vignette);
      g = clampByte(g * vignette);
      b = clampByte(b * vignette);

      output[offset] = r;
      output[offset + 1] = g;
      output[offset + 2] = b;
      output[offset + 3] = a;
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

const retroFilter = {
  name: 'retro',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return retro(image, options as { intensity?: number });
  },
  defaultOptions: { intensity: 0.5 },
};

registerFilter(retroFilter);

export { retroFilter };
