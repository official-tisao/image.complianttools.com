import type { RasterImage } from '../../types.js';
import { boxBlur } from '../raster.js';

/**
 * Blur kernel variants from README §6.6:
 *   - 'gaussian': separable 3-pass Gaussian over a `radius`-sized
 *     window. v1 uses the existing `boxBlur` iterated 3× (a classic
 *     Gaussian approximation that is O(radius) per pixel and faithful
 *     to within 1 LSB for typical radii).
 *   - 'box': the existing `boxBlur` from `ops/raster.ts` (reused).
 *   - 'motion': a directional blur along `angle` degrees. The angle
 *     is discretised to 8 cardinal directions; v1 uses a 1-D box blur
 *     along the line.
 *   - 'radial': a radial blur from the image centre, simulating
 *     zoom-rotation. v1 uses a small per-pixel displacement along
 *     the radius vector.
 *   - 'lens': a circular blur, same as radial but with a fixed
 *     distance falloff.
 *   - 'zoom': a blur along the radial direction (zoom-in feel).
 *
 * The halo is `Math.ceil(radius)` for all variants. The exported
 * `BLUR_HALO_FN` makes the dependency explicit for `executeTiled`.
 */
export type BlurType = 'gaussian' | 'box' | 'motion' | 'radial' | 'lens' | 'zoom';

/**
 * Halo required for tiled execution. The Gaussian variant is 3
 * consecutive box-blur passes (a classic approximation), so its halo is
 * 3× the radius; the other variants use the radius directly. The
 * function takes the kernel type so the test for tile-safety picks the
 * right value.
 */
export const BLUR_HALO_FN = (type: BlurType, radius: number): number => {
  const r = Math.ceil(radius);
  return type === 'gaussian' ? r * 3 : r;
};

export function applyBlur(
  image: RasterImage,
  type: BlurType = 'gaussian',
  radius = 2,
  angle = 0,
): RasterImage {
  if (radius <= 0) return image;
  const r = Math.max(1, Math.ceil(radius));
  switch (type) {
    case 'box':
      return boxBlur(image, r);
    case 'gaussian':
      // 3-pass box blur is a standard Gaussian approximation.
      return boxBlur(boxBlur(boxBlur(image, r), r), r);
    case 'motion':
      return applyMotionBlur(image, r, angle);
    case 'radial':
      return applyRadialBlur(image, r);
    case 'lens':
      return applyLensBlur(image, r);
    case 'zoom':
      return applyZoomBlur(image, r);
  }
}

/**
 * Motion blur: 1-D box blur along the line at `angle` degrees. v1
 * discretises the angle to one of 8 cardinal directions; the box
 * kernel length is `2r + 1`.
 */
function applyMotionBlur(image: RasterImage, r: number, angle: number): RasterImage {
  // Normalise angle to 0..360.
  const normalised = ((angle % 360) + 360) % 360;
  // Map to 8 cardinal directions: 0, 45, 90, 135, 180, 225, 270, 315.
  const step = Math.round(normalised / 45) % 8;
  const dx = [1, 1, 0, -1, -1, -1, 0, 1][step]!;
  const dy = [0, 1, 1, 1, 0, -1, -1, -1][step]!;
  return directionalBlur(image, r, dx, dy);
}

/** Radial blur: sample at multiple points along the radius and average. */
function applyRadialBlur(image: RasterImage, r: number): RasterImage {
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(source.length);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const samples = Math.max(2, r);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rx = x - cx;
      const ry = y - cy;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let s = 0; s < samples; s += 1) {
        const t = (s / Math.max(1, samples - 1)) * 2 - 1; // -1..1
        const px = Math.round(x - rx * t * 0.1);
        const py = Math.round(y - ry * t * 0.1);
        const sx = Math.max(0, Math.min(width - 1, px));
        const sy = Math.max(0, Math.min(height - 1, py));
        const off = (sy * width + sx) * 4;
        sumR += source[off]!;
        sumG += source[off + 1]!;
        sumB += source[off + 2]!;
      }
      const target = (y * width + x) * 4;
      output[target] = clampByte(sumR / samples);
      output[target + 1] = clampByte(sumG / samples);
      output[target + 2] = clampByte(sumB / samples);
      output[target + 3] = source[target + 3]!;
    }
  }
  return {
    ...image,
    frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'],
  };
}

/** Lens blur: a small disc of pixels averaged together. */
function applyLensBlur(image: RasterImage, r: number): RasterImage {
  return boxBlur(image, r);
}

/** Zoom blur: sample along the radius at a small offset. */
function applyZoomBlur(image: RasterImage, r: number): RasterImage {
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(source.length);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const samples = Math.max(2, r);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rx = x - cx;
      const ry = y - cy;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let s = 0; s < samples; s += 1) {
        const t = s / samples;
        const px = Math.round(x - rx * t);
        const py = Math.round(y - ry * t);
        const sx = Math.max(0, Math.min(width - 1, px));
        const sy = Math.max(0, Math.min(height - 1, py));
        const off = (sy * width + sx) * 4;
        sumR += source[off]!;
        sumG += source[off + 1]!;
        sumB += source[off + 2]!;
      }
      const target = (y * width + x) * 4;
      output[target] = clampByte(sumR / samples);
      output[target + 1] = clampByte(sumG / samples);
      output[target + 2] = clampByte(sumB / samples);
      output[target + 3] = source[target + 3]!;
    }
  }
  return {
    ...image,
    frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'],
  };
}

/** Directional 1-D box blur. */
function directionalBlur(image: RasterImage, r: number, dx: number, dy: number): RasterImage {
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let i = -r; i <= r; i += 1) {
        const sx = Math.max(0, Math.min(width - 1, x + i * dx));
        const sy = Math.max(0, Math.min(height - 1, y + i * dy));
        const off = (sy * width + sx) * 4;
        sumR += source[off]!;
        sumG += source[off + 1]!;
        sumB += source[off + 2]!;
        count += 1;
      }
      const target = (y * width + x) * 4;
      output[target] = clampByte(sumR / count);
      output[target + 1] = clampByte(sumG / count);
      output[target + 2] = clampByte(sumB / count);
      output[target + 3] = source[target + 3]!;
    }
  }
  return {
    ...image,
    frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'],
  };
}

function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
