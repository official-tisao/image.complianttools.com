import type { RasterImage } from '../../types.js';

/**
 * Denoise. Two algorithms:
 *   - `'median'` — a 3×3 median filter, strong against salt-and-pepper
 *     noise, halo = 1.
 *   - `'bilateral'` — a 5×5 bilateral filter, strong against
 *     Gaussian noise while preserving edges. The weight function is
 *     `exp(−Δluma² / 2σ_r²) · exp(−Δspatial² / 2σ_d²)` with
 *     `σ_r = 30` and `σ_d = 2`. Halo = 2.
 *
 * NLM is **deferred** per the spec (NLM is uncleared in
 * README §25.3.2). Calling `applyDenoise` with `method: 'nlm'`
 * throws the documented error.
 */
export type DenoiseMethod = 'median' | 'bilateral';

export const DENOISE_MEDIAN_HALO = 1;
export const DENOISE_BILATERAL_HALO = 2;

export function applyDenoise(
  image: RasterImage,
  method: DenoiseMethod = 'median',
  strength = 50,
): RasterImage {
  if (strength <= 0) return image;
  if (method === 'median') return medianFilter(image);
  if (method === 'bilateral') return bilateralFilter(image, strength);
  throw new Error(
    `Unknown denoise method: ${String(method)}. Only 'median' and 'bilateral' are implemented in v1; NLM is deferred per README §25.3.2.`,
  );
}

/** 3×3 median filter per channel. */
function medianFilter(image: RasterImage): RasterImage {
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
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
      const target = (y * width + x) * 4;
      output[target] = rs[4]!;
      output[target + 1] = gs[4]!;
      output[target + 2] = bs[4]!;
      output[target + 3] = source[target + 3]!;
    }
  }
  return { ...image, frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'] };
}

/** 5×5 bilateral filter with sigma_r = 30, sigma_d = 2. */
function bilateralFilter(image: RasterImage, strength: number): RasterImage {
  const sigmaR = 30 * (1 - strength / 100) + 5; // stronger → smaller sigma
  const sigmaD = 2;
  const inv2SigmaR2 = 1 / (2 * sigmaR * sigmaR);
  const inv2SigmaD2 = 1 / (2 * sigmaD * sigmaD);
  const width = image.width;
  const height = image.height;
  const source = image.frames[0]!.data;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      const cr = source[target]!;
      const cg = source[target + 1]!;
      const cb = source[target + 2]!;
      const ca = source[target + 3]!;
      const lumaCentre = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumW = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const sy = Math.max(0, Math.min(height - 1, y + dy));
          const off = (sy * width + sx) * 4;
          const r = source[off]!;
          const g = source[off + 1]!;
          const b = source[off + 2]!;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const dluma = luma - lumaCentre;
          const dspace = dx * dx + dy * dy;
          const wr = Math.exp(-dluma * dluma * inv2SigmaR2);
          const wd = Math.exp(-dspace * inv2SigmaD2);
          const w = wr * wd;
          sumR += r * w;
          sumG += g * w;
          sumB += b * w;
          sumW += w;
        }
      }
      output[target] = clampByte(sumR / sumW);
      output[target + 1] = clampByte(sumG / sumW);
      output[target + 2] = clampByte(sumB / sumW);
      output[target + 3] = ca;
    }
  }
  return { ...image, frames: [{ ...image.frames[0]!, data: output }] as unknown as RasterImage['frames'] };
}

function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
