import type { RasterImage } from '../../types.js';

/**
 * Despeckle: median filter over a `(2r+1)²` window. The kernel radius
 * is the documented `radius` field from the schema; `executeTiled`
 * should be called with halo = `radius` to keep tile edges correct.
 * The exported constant `DESPECKLE_HALO_FN` makes the halo dependency
 * explicit and testable.
 */
export const DESPECKLE_HALO_FN = (radius: number): number => Math.ceil(radius);

export function applyDespeckle(image: RasterImage, radius = 1): RasterImage {
  if (radius <= 0) return image;
  const r = Math.ceil(radius);
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const sy = Math.max(0, Math.min(height - 1, y + dy));
          const off = (sy * width + sx) * 4;
          rs.push(source[off]!);
          gs.push(source[off + 1]!);
          bs.push(source[off + 2]!);
        }
      }
      rs.sort((a, b) => a - b);
      gs.sort((a, b) => a - b);
      bs.sort((a, b) => a - b);
      const mid = rs.length >> 1;
      const target = (y * width + x) * 4;
      output[target] = rs[mid]!;
      output[target + 1] = gs[mid]!;
      output[target + 2] = bs[mid]!;
      output[target + 3] = source[target + 3]!;
    }
  }
  return { ...image, frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'] };
}
