/**
 * P3-08 T49 Typography — minimal text rendering module.
 */
import type { RasterImage } from '../types.js';

export interface TypographyOptions {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  stroke?: boolean;
  opacity?: number;
  x?: number;
  y?: number;
}

export function renderText(image: RasterImage, opts: TypographyOptions): RasterImage {
  // Minimal: draws text as simple pixel overlay using a basic canvas-like approach.
  // For v1 we simulate text by drawing a label region; full glyph rendering is a future extension.
  const text = opts.text || 'Text';
  const out = new Uint8ClampedArray(image.frames[0]!.data.length);
  const source = image.frames[0]!.data;
  out.set(source);
  const w = image.width;
  const h = image.height;
  // Very minimal simulation: mark first 8xN pixels with a text-like grey region
  for (let y = 0; y < Math.min(16, h); y++) {
    for (let x = 0; x < Math.min(8 + text.length * 6, w); x++) {
      const idx = (y * w + x) * 4;
      if (x % 2 === 0) {
        out[idx] = 50;
        out[idx + 1] = 50;
        out[idx + 2] = 50;
        out[idx + 3] = 200;
      }
    }
  }
  return {
    ...image,
    frames: [{ ...image.frames[0]!, data: out }] as unknown as RasterImage['frames'],
  };
}
