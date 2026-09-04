import type { RasterImage } from '../types.js';
import { registerFilter, clampByte, lerp } from './framework.js';

function parseColor(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  if (hex.length === 3) {
    const r = hex[0] ?? '0';
    const g = hex[1] ?? '0';
    const b = hex[2] ?? '0';
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return [0, 0, 0];
}

export function duotone(
  image: RasterImage,
  options: { shadowColor?: string; highlightColor?: string; midpoint?: number } = {},
): RasterImage {
  const shadowColor = parseColor(options.shadowColor ?? '#000000');
  const highlightColor = parseColor(options.highlightColor ?? '#ffffff');
  const midpoint = Math.max(0, Math.min(1, options.midpoint ?? 0.5));

  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      const a = input[offset + 3]!;

      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const t = luminance / 255;

      let outR: number, outG: number, outB: number;
      if (t < midpoint) {
        const localT = midpoint > 0 ? t / midpoint : 0;
        outR = clampByte(lerp(shadowColor[0], highlightColor[0], localT));
        outG = clampByte(lerp(shadowColor[1], highlightColor[1], localT));
        outB = clampByte(lerp(shadowColor[2], highlightColor[2], localT));
      } else {
        const localT = midpoint < 1 ? (t - midpoint) / (1 - midpoint) : 0;
        outR = clampByte(lerp(shadowColor[0], highlightColor[0], localT + midpoint));
        outG = clampByte(lerp(shadowColor[1], highlightColor[1], localT + midpoint));
        outB = clampByte(lerp(shadowColor[2], highlightColor[2], localT + midpoint));
      }

      output[offset] = outR;
      output[offset + 1] = outG;
      output[offset + 2] = outB;
      output[offset + 3] = a;
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

const duotoneFilter = {
  name: 'duotone',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return duotone(
      image,
      options as { shadowColor?: string; highlightColor?: string; midpoint?: number },
    );
  },
  defaultOptions: { shadowColor: '#000000', highlightColor: '#ffffff', midpoint: 0.5 },
};

registerFilter(duotoneFilter);

export { duotoneFilter };
