import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

export type BayerPattern = 'RGGB' | 'BGGR' | 'GRBG' | 'GBRG';

function colorAt(pattern: BayerPattern, x: number, y: number): 'r' | 'g' | 'b' {
  const value = pattern[(y & 1) * 2 + (x & 1)]!;
  return value.toLowerCase() as 'r' | 'g' | 'b';
}

/** Bilinear, local-only Bayer demosaic for DNG Stage 2 development. */
export function demosaicBilinear(
  samples: Uint16Array,
  width: number,
  height: number,
  pattern: BayerPattern = 'RGGB',
  blackLevel = 0,
  whiteLevel = 65535,
): RasterImage {
  if (width < 1 || height < 1 || samples.length !== width * height || whiteLevel <= blackLevel)
    throw new Error('Invalid Bayer mosaic dimensions or levels.');
  const output = new Uint8ClampedArray(width * height * 4);
  const sample = (x: number, y: number) => samples[y * width + x]!;
  const channel = (x: number, y: number, wanted: 'r' | 'g' | 'b') => {
    let total = 0;
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const sx = x + dx,
          sy = y + dy;
        if (
          sx >= 0 &&
          sx < width &&
          sy >= 0 &&
          sy < height &&
          colorAt(pattern, sx, sy) === wanted
        ) {
          total += sample(sx, sy);
          count += 1;
        }
      }
    return Math.round(
      ((Math.max(blackLevel, Math.min(whiteLevel, total / Math.max(1, count))) - blackLevel) *
        255) /
        (whiteLevel - blackLevel),
    );
  };
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      output.set([channel(x, y, 'r'), channel(x, y, 'g'), channel(x, y, 'b'), 255], target);
    }
  return createRaster(width, height, output);
}
