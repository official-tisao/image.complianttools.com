import type { RasterImage } from '../types.js';
import { registerFilter } from './framework.js';
import { applyDither, type DitherName, SUPPORTED_DITHERS } from './dither.js';

/**
 * Monochrome: reduce the image to black/white via a threshold on the per-pixel Rec.709
 * luma, with optional dithering. `dither` is one of `'none' | 'floyd-steinberg' |
 * 'atkinson' | 'bayer-2x2' | 'bayer-4x4'` (the five strategies listed in README §6.5).
 * The default `dither: 'none'` matches the historical "no dither" baseline and is
 * byte-identical to the previous stub. Dithering is applied per-frame, per-pixel; the
 * pixel-local result means two consecutive calls on the same input always produce
 * byte-identical output.
 */
export function monochrome(
  image: RasterImage,
  options: { threshold?: number; dither?: string } = {},
): RasterImage {
  const thresholdValue = options.threshold ?? 128;
  const ditherName: DitherName = (SUPPORTED_DITHERS as readonly string[]).includes(
    options.dither ?? '',
  )
    ? (options.dither as DitherName)
    : 'none';

  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    if (ditherName === 'none') {
      // Fast path — single threshold with no error buffer.
      for (let offset = 0; offset < input.length; offset += 4) {
        const r = input[offset]!;
        const g = input[offset + 1]!;
        const b = input[offset + 2]!;
        const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        const value = gray >= thresholdValue ? 255 : 0;
        output[offset] = value;
        output[offset + 1] = value;
        output[offset + 2] = value;
        output[offset + 3] = input[offset + 3]!;
      }
      return { ...frame, data: output };
    }
    // Dithering path — compute the luma buffer, run the dither, then fan out the
    // 0/255 result across R/G/B and preserve alpha.
    const width = image.width;
    const height = image.height;
    const luma = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        luma[y * width + x] = Math.round(
          0.2126 * input[offset]! + 0.7152 * input[offset + 1]! + 0.0722 * input[offset + 2]!,
        );
      }
    }
    const dithered = applyDither(ditherName, luma, width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const value = dithered[y * width + x] ?? 0;
        output[offset] = value;
        output[offset + 1] = value;
        output[offset + 2] = value;
        output[offset + 3] = input[offset + 3]!;
      }
    }
    return { ...frame, data: output };
  });

  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

const monochromeFilter = {
  name: 'monochrome',
  apply: (image: RasterImage, options: Record<string, unknown>) => {
    return monochrome(image, options as { threshold?: number; dither?: string });
  },
  defaultOptions: { threshold: 128, dither: 'none' },
};

registerFilter(monochromeFilter);

export { monochromeFilter };
