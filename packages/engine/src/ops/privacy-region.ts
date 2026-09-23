import type { RasterImage } from '../types.js';
import { applyBlur } from './enhance/blur.js';
import { createRaster } from './raster.js';

export type PrivacyRegion = Readonly<{
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}>;

export type PrivacyRegionEffect =
  | Readonly<{ readonly kind: 'blur'; readonly radius: number }>
  | Readonly<{ readonly kind: 'pixelate'; readonly blockSize: number }>
  | Readonly<{ readonly kind: 'solid'; readonly colour?: readonly [number, number, number] }>
  | Readonly<{ readonly kind: 'noise'; readonly amount: number; readonly seed?: number }>;

/**
 * Apply an irreversible privacy effect to rectangular regions.
 *
 * The function copies the source before writing any region, so the caller can
 * keep an untouched preview. Solid redaction replaces every RGB sample in the
 * region; it is not a translucent overlay and does not preserve source pixels.
 */
export function applyPrivacyRegions(
  image: RasterImage,
  regions: readonly PrivacyRegion[],
  effect: PrivacyRegionEffect,
): RasterImage {
  const source = image.frames[0]!.data;
  const output = source.slice();
  for (const region of regions) {
    const bounds = clampRegion(region, image.width, image.height);
    if (bounds.width < 1 || bounds.height < 1) continue;
    if (effect.kind === 'blur') {
      applyBlurredRegion(image, output, bounds, effect.radius);
    } else if (effect.kind === 'pixelate') {
      applyPixelatedRegion(source, output, image.width, bounds, effect.blockSize);
    } else if (effect.kind === 'solid') {
      const colour = effect.colour ?? [0, 0, 0];
      forEachPixel(bounds, image.width, (offset) => {
        output[offset] = colour[0]!;
        output[offset + 1] = colour[1]!;
        output[offset + 2] = colour[2]!;
      });
    } else {
      applyNoiseRegion(source, output, image.width, bounds, effect.amount, effect.seed ?? 0);
    }
  }
  return createRaster(image.width, image.height, output);
}

function clampRegion(region: PrivacyRegion, width: number, height: number): PrivacyRegion {
  const x = Math.max(0, Math.min(width, Math.round(region.x)));
  const y = Math.max(0, Math.min(height, Math.round(region.y)));
  return {
    x,
    y,
    width: Math.max(0, Math.min(width - x, Math.round(region.width))),
    height: Math.max(0, Math.min(height - y, Math.round(region.height))),
  };
}

function forEachPixel(
  region: PrivacyRegion,
  imageWidth: number,
  callback: (offset: number) => void,
): void {
  for (let y = region.y; y < region.y + region.height; y += 1)
    for (let x = region.x; x < region.x + region.width; x += 1) callback((y * imageWidth + x) * 4);
}

function applyBlurredRegion(
  image: RasterImage,
  output: Uint8ClampedArray,
  region: PrivacyRegion,
  radius: number,
): void {
  const source = image.frames[0]!.data;
  const crop = new Uint8ClampedArray(region.width * region.height * 4);
  forEachPixel(region, image.width, (offset) => {
    const cropX = ((offset / 4) % image.width) - region.x;
    const cropY = Math.floor(offset / 4 / image.width) - region.y;
    crop[(cropY * region.width + cropX) * 4] = source[offset]!;
    crop[(cropY * region.width + cropX) * 4 + 1] = source[offset + 1]!;
    crop[(cropY * region.width + cropX) * 4 + 2] = source[offset + 2]!;
    crop[(cropY * region.width + cropX) * 4 + 3] = source[offset + 3]!;
  });
  const blurred = applyBlur(createRaster(region.width, region.height, crop), 'gaussian', radius);
  const blurredData = blurred.frames[0]!.data;
  forEachPixel(region, image.width, (offset) => {
    const cropX = ((offset / 4) % image.width) - region.x;
    const cropY = Math.floor(offset / 4 / image.width) - region.y;
    const sourceOffset = (cropY * region.width + cropX) * 4;
    output[offset] = blurredData[sourceOffset]!;
    output[offset + 1] = blurredData[sourceOffset + 1]!;
    output[offset + 2] = blurredData[sourceOffset + 2]!;
    output[offset + 3] = blurredData[sourceOffset + 3]!;
  });
}

function applyPixelatedRegion(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  imageWidth: number,
  region: PrivacyRegion,
  blockSize: number,
): void {
  const block = Math.max(1, Math.round(blockSize));
  for (let top = region.y; top < region.y + region.height; top += block) {
    for (let left = region.x; left < region.x + region.width; left += block) {
      const right = Math.min(region.x + region.width, left + block);
      const bottom = Math.min(region.y + region.height, top + block);
      const sums = [0, 0, 0, 0];
      let count = 0;
      for (let y = top; y < bottom; y += 1)
        for (let x = left; x < right; x += 1) {
          const offset = (y * imageWidth + x) * 4;
          for (let channel = 0; channel < 4; channel += 1)
            sums[channel]! += source[offset + channel]!;
          count += 1;
        }
      for (let y = top; y < bottom; y += 1)
        for (let x = left; x < right; x += 1) {
          const offset = (y * imageWidth + x) * 4;
          for (let channel = 0; channel < 4; channel += 1)
            output[offset + channel] = Math.round(sums[channel]! / count);
        }
    }
  }
}

function applyNoiseRegion(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  imageWidth: number,
  region: PrivacyRegion,
  amount: number,
  seed: number,
): void {
  let state = seed >>> 0 || 1;
  const range = Math.max(0, Math.min(255, Math.round(amount)));
  forEachPixel(region, imageWidth, (offset) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const delta = Math.round(((state / 0x1_0000_0000) * 2 - 1) * range);
    for (let channel = 0; channel < 3; channel += 1)
      output[offset + channel] = Math.max(0, Math.min(255, source[offset + channel]! + delta));
  });
}
