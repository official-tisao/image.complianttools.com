/**
 * P3-06 T36 Split / Tile.
 */
import type { RasterImage } from '../types.js';

export interface SplitOptions {
  readonly rows: number;
  readonly cols: number;
  readonly output?: 'array' | 'individual';
}

export function splitImage(image: RasterImage, options: SplitOptions): RasterImage[] {
  const srcW = image.width;
  const srcH = image.height;
  const cols = Math.max(1, Math.round(options.cols ?? 2));
  const rows = Math.max(1, Math.round(options.rows ?? 2));
  const tileW = Math.floor(srcW / cols);
  const tileH = Math.floor(srcH / rows);
  const results: RasterImage[] = [];
  const source = image.frames[0]!.data;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const outW = (c === cols - 1) ? srcW - c * tileW : tileW;
      const outH = (r === rows - 1) ? srcH - r * tileH : tileH;
      const output = new Uint8ClampedArray(outW * outH * 4);
      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          const srcX = c * tileW + x;
          const srcY = r * tileH + y;
          const srcOff = (srcY * srcW + srcX) * 4;
          const dstOff = (y * outW + x) * 4;
          output[dstOff] = source[srcOff]!;
          output[dstOff + 1] = source[srcOff + 1]!;
          output[dstOff + 2] = source[srcOff + 2]!;
          output[dstOff + 3] = source[srcOff + 3]!;
        }
      }
      results.push({
        ...image,
        width: outW,
        height: outH,
        frames: [{ ...image.frames[0]!, data: output, width: outW, height: outH }] as unknown as RasterImage['frames'],
      });
    }
  }
  return results;
}
