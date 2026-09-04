import type { RasterImage } from '../types.js';
import { clampByte, registerFilter } from './framework.js';

/**
 * Gradient map: remap each pixel's luminance through a colour gradient.
 * `stops` is an array of `{ stop: number, color: '#RRGGBB' }` entries with stops in 0..1.
 * The colour of any pixel is the linear interpolation between the two surrounding stops
 * weighted by the pixel's luminance.
 */
interface Stop {
  stop: number;
  color: string;
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length !== 6) return [0, 0, 0];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function gradientMap(
  image: RasterImage,
  options: { stops?: Stop[]; midpoint?: number } = {},
): RasterImage {
  const rawStops: Stop[] =
    Array.isArray(options.stops) && options.stops.length >= 2
      ? options.stops
      : [
          { stop: 0, color: '#000000' },
          { stop: 1, color: '#FFFFFF' },
        ];
  const midpoint = Math.max(0, Math.min(1, options.midpoint ?? 0.5));
  const sortedStops = [...rawStops].sort((a, b) => a.stop - b.stop);
  const stops = sortedStops.map((s) => ({ ...s, color: parseHex(s.color) })) as {
    stop: number;
    color: [number, number, number];
  }[];

  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      // Rec. 601 luminance; matches grayscale.lightness closely enough for mapping purposes.
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      // Apply a midpoint contrast bias so the gradient can be tuned.
      const biased =
        luminance < midpoint
          ? (luminance / midpoint) * 0.5
          : 0.5 + ((luminance - midpoint) / (1 - midpoint)) * 0.5;
      const t = Math.max(0, Math.min(1, biased));
      let color: [number, number, number] = stops[0]!.color;
      for (let i = 0; i < stops.length - 1; i += 1) {
        const a = stops[i]!;
        const b2 = stops[i + 1]!;
        if (t >= a.stop && t <= b2.stop) {
          const local = (t - a.stop) / Math.max(0.0001, b2.stop - a.stop);
          color = [
            a.color[0] + (b2.color[0] - a.color[0]) * local,
            a.color[1] + (b2.color[1] - a.color[1]) * local,
            a.color[2] + (b2.color[2] - a.color[2]) * local,
          ];
          break;
        }
      }
      output[offset] = clampByte(color[0]);
      output[offset + 1] = clampByte(color[1]);
      output[offset + 2] = clampByte(color[2]);
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

const gradientMapFilter = {
  name: 'gradient-map',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return gradientMap(image, options as { stops?: Stop[]; midpoint?: number });
  },
  defaultOptions: {
    stops: [
      { stop: 0, color: '#000000' },
      { stop: 1, color: '#FFFFFF' },
    ],
  },
};

registerFilter(gradientMapFilter);

export { gradientMapFilter };
