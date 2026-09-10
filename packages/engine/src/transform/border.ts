/**
 * P3-06 T33 Border / Frame.
 */
import type { RasterImage } from '../types.js';

export interface BorderOptions {
  readonly width: number;
  readonly color?: string;
  readonly inner?: boolean; // inner (inside image) vs outer (expands canvas)
}

function parseHexColor(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 255];
  if (h.length === 4) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), parseInt(h[3] + h[3], 16)];
  if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  if (h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)];
  return [0, 0, 0, 255];
}

export function applyBorder(image: RasterImage, options: BorderOptions): RasterImage {
  const w = Math.max(1, Math.round(options.width));
  const [br, bg, bb, ba] = parseHexColor(options.color ?? '#000000');
  const inner = options.inner ?? false;

  const srcW = image.width;
  const srcH = image.height;
  const newW = inner ? Math.max(1, srcW - 2 * w) : srcW + 2 * w;
  const newH = inner ? Math.max(1, srcH - 2 * w) : srcH + 2 * w;

  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(newW * newH * 4);
  // Fill background
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const idx = (y * newW + x) * 4;
      output[idx] = br;
      output[idx + 1] = bg;
      output[idx + 2] = bb;
      output[idx + 3] = ba;
    }
  }

  const offsetX = inner ? w : 0;
  const offsetY = inner ? w : 0;
  const drawW = inner ? Math.max(1, srcW - 2 * w) : srcW;
  const drawH = inner ? Math.max(1, srcH - 2 * w) : srcH;

  for (let y = 0; y < drawH; y++) {
    for (let x = 0; x < drawW; x++) {
      const srcOffset = (y * srcW + x) * 4;
      const dstX = offsetX + x;
      const dstY = offsetY + y;
      const dstOffset = (dstY * newW + dstX) * 4;
      output[dstOffset] = source[srcOffset]!;
      output[dstOffset + 1] = source[srcOffset + 1]!;
      output[dstOffset + 2] = source[srcOffset + 2]!;
      output[dstOffset + 3] = source[srcOffset + 3]!;
    }
  }

  const frameCopy = { ...image.frames[0]! };
  return {
    ...image,
    width: newW,
    height: newH,
    frames: [{ ...frameCopy, data: output, width: newW, height: newH }] as unknown as RasterImage['frames'],
  };
}
