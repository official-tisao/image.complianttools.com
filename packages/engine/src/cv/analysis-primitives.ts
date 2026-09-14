/**
 * P4-13 — Analysis primitives (clean-room, independent of model-based work)
 *
 * Perceptual hash, structural similarity, PSNR, and a plain-language verdict
 * derived from butteaugli-style thresholds. No external model or weight
 * dependency; fully independent from P4-14 / P4-16 / P4-18.
 */

import type { RasterImage } from '../types.js';

/** Average hash (aHash) — simple mean-threshold binary hash. */
function aHashImage(image: RasterImage): number[] {
  const w = image.width;
  const h = image.height;
  const src = image.frames[0]!.data;
  const pixels: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const gray = Math.round(0.299 * src[off]! + 0.587 * src[off + 1]! + 0.114 * src[off + 2]!);
      pixels.push(gray);
    }
  }
  const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  return pixels.map((v) => (v >= mean ? 1 : 0));
}

/** Difference hash (dHash) — gradient direction hashes. */
function dHashImage(image: RasterImage): number[] {
  const w = image.width;
  const h = image.height;
  const src = image.frames[0]!.data;
  const bits: number[] = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const off = (y * w + x) * 4;
      const grayL = Math.round(0.299 * src[off]! + 0.587 * src[off + 1]! + 0.114 * src[off + 2]!);
      const grayROff = (y * w + x + 1) * 4;
      const grayR = Math.round(
        0.299 * src[grayROff]! + 0.587 * src[grayROff + 1]! + 0.114 * src[grayROff + 2]!,
      );
      bits.push(grayL > grayR ? 1 : 0);
    }
  }
  return bits;
}

/** Hamming distance between two bit arrays of equal length. */
function hammingDistance(a: number[], b: number[]): number {
  let d = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) d++;
  }
  return d;
}

/** Simple perceptual hash using average hash (clean-room approximation). */
export function perceptualHash(image: RasterImage): number[] {
  return aHashImage(image);
}

/** Difference hash for comparison. */
export function differenceHash(image: RasterImage): number[] {
  return dHashImage(image);
}

/** Hamming clustering — find closest hash from a reference array. */
export function nearestHash(
  query: number[],
  references: number[][],
): { index: number; distance: number } | null {
  if (references.length === 0) return null;
  let bestIdx = 0;
  let bestDist = hammingDistance(query, references[0]!);
  for (let i = 1; i < references.length; i++) {
    const dist = hammingDistance(query, references[i]!);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return { index: bestIdx, distance: bestDist };
}

/** SSIM approximation — structural similarity based on luminance comparison. */
export function approximateSSIM(imgA: RasterImage, imgB: RasterImage): number {
  const wA = imgA.width,
    hA = imgA.height;
  const wB = imgB.width,
    hB = imgB.height;
  if (wA !== wB || hA !== hB) return 0;
  const a = imgA.frames[0]!.data;
  const b = imgB.frames[0]!.data;
  let meanDiff = 0;
  const n = wA * hA;
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    const ga = Math.round(0.299 * a[off]! + 0.587 * a[off + 1]! + 0.114 * a[off + 2]!);
    const gb = Math.round(0.299 * b[off]! + 0.587 * b[off + 1]! + 0.114 * b[off + 2]!);
    meanDiff += Math.abs(ga - gb);
  }
  meanDiff /= n;
  // Normalised to [0,1]: 1 = identical, 0 = maximally different for this approximation
  return Math.max(0, 1 - meanDiff / 255);
}

/** Peak signal-to-noise ratio (PSNR) approximation for 8-bit images. */
export function approximatePSNR(imgA: RasterImage, imgB: RasterImage): number {
  const wA = imgA.width,
    hA = imgA.height;
  const wB = imgB.width,
    hB = imgB.height;
  if (wA !== wB || hA !== hB) return -Infinity;
  const a = imgA.frames[0]!.data;
  const b = imgB.frames[0]!.data;
  let mse = 0;
  const n = wA * hA;
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    for (let c = 0; c < 3; c++) {
      const diff = a[off + c]! - b[off + c]!;
      mse += diff * diff;
    }
  }
  mse /= n * 3;
  if (mse < 1e-9) return Infinity;
  return 10 * Math.log10((255 * 255) / mse);
}

/** Plain-language verdict derived from approximate SSIM. */
export function similarityVerdict(ssim: number): string {
  if (ssim >= 0.95) return 'Nearly identical';
  if (ssim >= 0.85) return 'Very similar';
  if (ssim >= 0.7) return 'Moderately similar';
  if (ssim >= 0.5) return 'Somewhat different';
  return 'Clearly different';
}
