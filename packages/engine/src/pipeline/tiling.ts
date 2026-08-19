import type { RasterImage } from '../types.js';
import { createRaster } from '../ops/raster.js';

export function executeTiled(
  image: RasterImage,
  operation: (tile: RasterImage) => RasterImage,
  tileSize = 512,
  halo = 0,
): RasterImage {
  const output = new Uint8ClampedArray(image.frames[0].data.length);
  const source = image.frames[0].data;
  for (let tileY = 0; tileY < image.height; tileY += tileSize)
    for (let tileX = 0; tileX < image.width; tileX += tileSize) {
      const left = Math.max(0, tileX - halo);
      const top = Math.max(0, tileY - halo);
      const right = Math.min(image.width, tileX + tileSize + halo);
      const bottom = Math.min(image.height, tileY + tileSize + halo);
      const tileData = new Uint8ClampedArray((right - left) * (bottom - top) * 4);
      for (let y = top; y < bottom; y += 1)
        tileData.set(
          source.subarray((y * image.width + left) * 4, (y * image.width + right) * 4),
          (y - top) * (right - left) * 4,
        );
      const result = operation(createRaster(right - left, bottom - top, tileData));
      const copyWidth = Math.min(tileSize, image.width - tileX);
      const copyHeight = Math.min(tileSize, image.height - tileY);
      for (let y = 0; y < copyHeight; y += 1) {
        const sourceStart = ((y + tileY - top) * result.width + (tileX - left)) * 4;
        output.set(
          result.frames[0].data.subarray(sourceStart, sourceStart + copyWidth * 4),
          ((tileY + y) * image.width + tileX) * 4,
        );
      }
    }
  return createRaster(image.width, image.height, output);
}
