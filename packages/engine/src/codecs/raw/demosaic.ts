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

/** Applies DNG-style channel gains and a 3×3 colour matrix to a developed raster. */
export function applyRawColourTransform(
  image: RasterImage,
  gains: readonly [number, number, number],
  matrix: readonly [number, number, number, number, number, number, number, number, number],
): RasterImage {
  if (
    gains.some((gain) => !Number.isFinite(gain) || gain < 0) ||
    matrix.some((value) => !Number.isFinite(value))
  )
    throw new Error('Invalid RAW colour transform.');
  const pixels = image.frames[0].data.slice();
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = (pixels[offset]! / 255) * gains[0];
    const green = (pixels[offset + 1]! / 255) * gains[1];
    const blue = (pixels[offset + 2]! / 255) * gains[2];
    pixels[offset] = Math.round(
      Math.max(0, Math.min(1, matrix[0] * red + matrix[1] * green + matrix[2] * blue)) * 255,
    );
    pixels[offset + 1] = Math.round(
      Math.max(0, Math.min(1, matrix[3] * red + matrix[4] * green + matrix[5] * blue)) * 255,
    );
    pixels[offset + 2] = Math.round(
      Math.max(0, Math.min(1, matrix[6] * red + matrix[7] * green + matrix[8] * blue)) * 255,
    );
  }
  return { ...image, frames: [{ ...image.frames[0], data: pixels }] };
}
