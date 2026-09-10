/**
 * P3-06 T34 Round Corners.
 * Produces alpha-transparent rounded corners on the image.
 */
import type { RasterImage } from '../types.js';

export interface RoundCornersOptions {
  readonly radius: number;
  readonly background?: string; // If set, fills outside with colour; else transparent
}

function isInsideRoundedRect(x: number, y: number, w: number, h: number, r: number): boolean {
  // Distance from nearest corner to point; if within radius, it's outside
  const dx = Math.max(0, Math.abs(x - w / 2) - (w / 2 - r));
  const dy = Math.max(0, Math.abs(y - h / 2) - (h / 2 - r));
  return (dx * dx + dy * dy) <= (r * r);
}

export function roundCorners(image: RasterImage, options: RoundCornersOptions): RasterImage {
  const r = Math.max(0, Math.round(options.radius));
  const source = image.frames[0]!.data;
  const w = image.width;
  const h = image.height;
  const output = new Uint8ClampedArray(w * h * 4);

  const hasBg = options.background !== undefined && options.background !== 'transparent';
  const [br, bg, bb, ba] = hasBg ? parseHexColor(options.background!) : [0, 0, 0, 0];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inCorner = !isInsideRoundedRect(x, y, w, h, r);
      const srcOffset = (y * w + x) * 4;
      const dstOffset = srcOffset;
      if (inCorner) {
        if (hasBg) {
          output[dstOffset] = br;
          output[dstOffset + 1] = bg;
          output[dstOffset + 2] = bb;
          output[dstOffset + 3] = ba;
        } else {
          output[dstOffset + 3] = 0;
          output[dstOffset] = source[srcOffset]!;
          output[dstOffset + 1] = source[srcOffset + 1]!;
          output[dstOffset + 2] = source[srcOffset + 2]!;
        }
      } else {
        output[dstOffset] = source[srcOffset]!;
        output[dstOffset + 1] = source[srcOffset + 1]!;
        output[dstOffset + 2] = source[srcOffset + 2]!;
        output[dstOffset + 3] = source[srcOffset + 3]!;
      }
    }
  }
  return {
    ...image,
    frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'],
  };
}

function parseHexColor(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 255];
  if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  if (h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)];
  return [255, 255, 255, 255];
}
