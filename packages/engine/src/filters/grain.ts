import type { RasterImage } from '../types.js';
import { clampByte, registerFilter } from './framework.js';

/**
 * Grain: add deterministic per-pixel noise.
 * `amount` is the noise amplitude in 0..255 units. `monochromatic` keeps the noise on a
 * single channel so it does not introduce a colour cast.
 *
 * Noise is generated via a hash of (x, y, frame index) so the same input always produces
 * the same grain. This is important for sharing recipes (P3-13) — the recipient must see
 * the same image the sender saw.
 */
function hash32(x: number, y: number, seed: number): number {
  let h = (x | 0) * 0x27d4eb2d;
  h ^= (y | 0) * 0x165667b1;
  h ^= (seed | 0) * 0x9e3779b9;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function grain(
  image: RasterImage,
  options: { amount?: number; monochromatic?: boolean } = {},
): RasterImage {
  const amount = Math.max(0, Math.min(255, options.amount ?? 25));
  const monochromatic = Boolean(options.monochromatic);

  const newFrames = image.frames.map((frame, frameIndex) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    const { width, height } = image;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const noise = hash32(x, y, frameIndex) / 0xffffffff - 0.5;
        const adjustment = noise * amount;
        if (monochromatic) {
          const r = clampByte(input[offset]! + adjustment);
          output[offset] = r;
          output[offset + 1] = r;
          output[offset + 2] = r;
        } else {
          output[offset] = clampByte(input[offset]! + adjustment);
          output[offset + 1] = clampByte(input[offset + 1]! + adjustment);
          output[offset + 2] = clampByte(input[offset + 2]! + adjustment);
        }
        output[offset + 3] = input[offset + 3]!;
      }
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

const grainFilter = {
  name: 'grain',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return grain(image, options as { amount?: number; monochromatic?: boolean });
  },
  defaultOptions: { amount: 25, monochromatic: true },
};

registerFilter(grainFilter);

export { grainFilter };
