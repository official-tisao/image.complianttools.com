/**
 * P4-09 — Segmentation Tier 1 (clearance-confirmed fallback only).
 *
 * Provenance / clearance:
 * - GrabCut (Rother et al. SIGGRAPH 2004) is NOT cleared for this
 *   repository (`docs/ADR/ip-clearance.md`: "Awaiting counsel; fallback
 *   shipping"). It is NOT implemented, linked, or referenced here.
 * - Watershed (Vincent & Soille 1991 / Meyer 1992) has no known patent
 *   restriction and is implemented independently.
 * - Colour-range selection reuses the existing `colourRange` primitive
 *   (`packages/engine/src/cv/colour-range.ts`); no derived code.
 * - Iterative colour-model refinement is an original construction.
 * - No model/network/API dependency.
 */

import type { RasterImage } from '../types.js';
import { colourRange } from './colour-range.js';

export interface RectangleHint {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Clamp rectangle to image bounds and enforce minimum size. */
function clampRectangle(rect: RectangleHint, w: number, h: number): RectangleHint {
  const x = Math.max(0, Math.min(w - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(h - 1, Math.round(rect.y)));
  const rW = Math.max(1, Math.min(w - x, Math.round(rect.width)));
  const rH = Math.max(1, Math.min(h - y, Math.round(rect.height)));
  return { x, y, width: rW, height: rH };
}

/** Compute mean RGB and standard deviation inside a rectangle. */
function regionStats(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  rect: RectangleHint,
): { r: number; g: number; b: number; stdR: number; stdG: number; stdB: number; count: number } {
  let rSum = 0,
    gSum = 0,
    bSum = 0,
    rSqSum = 0,
    gSqSum = 0,
    bSqSum = 0,
    count = 0;
  for (let y = rect.y; y < rect.y + rect.height && y < h; y++) {
    for (let x = rect.x; x < rect.x + rect.width && x < w; x++) {
      const off = (y * w + x) * 4;
      const r = data[off]!;
      const g = data[off + 1]!;
      const bVal = data[off + 2]!;
      rSum += r;
      gSum += g;
      bSum += bVal;
      rSqSum += r * r;
      gSqSum += g * g;
      bSqSum += bVal * bVal;
      count++;
    }
  }
  const meanR = count > 0 ? rSum / count : 128;
  const meanG = count > 0 ? gSum / count : 128;
  const meanB = count > 0 ? bSum / count : 128;
  const varR = count > 0 ? rSqSum / count - meanR * meanR : 0;
  const varG = count > 0 ? gSqSum / count - meanG * meanG : 0;
  const varB = count > 0 ? bSqSum / count - meanB * meanB : 0;
  return {
    r: meanR,
    g: meanG,
    b: meanB,
    stdR: Math.sqrt(Math.max(0, varR)),
    stdG: Math.sqrt(Math.max(0, varG)),
    stdB: Math.sqrt(Math.max(0, varB)),
    count,
  };
}

/** Iterative colour-model refinement (original Tier 1 fallback). */
export function iterativeColourRefinement(
  image: RasterImage,
  initialMask: Uint8ClampedArray,
  opts?: { iterations?: number; tolerance?: number },
): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const maxIter = Math.max(1, opts?.iterations ?? 3);
  const tol = Math.max(1, opts?.tolerance ?? 5);
  const srcData = image.frames[0]!.data;
  let mask = new Uint8ClampedArray(initialMask);

  for (let iter = 0; iter < maxIter; iter++) {
    // Compute fg/bg statistics from current mask.
    let fgR = 0,
      fgG = 0,
      fgB = 0,
      fgN = 0;
    let bgR = 0,
      bgG = 0,
      bgB = 0,
      bgN = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const off = idx * 4;
        if (mask[idx] === 255) {
          fgR += srcData[off]!;
          fgG += srcData[off + 1]!;
          fgB += srcData[off + 2]!;
          fgN++;
        } else if (mask[idx] === 0) {
          bgR += srcData[off]!;
          bgG += srcData[off + 1]!;
          bgB += srcData[off + 2]!;
          bgN++;
        }
      }
    }
    const fgMean =
      fgN > 0 ? { r: fgR / fgN, g: fgG / fgN, b: fgB / fgN } : { r: 128, g: 128, b: 128 };
    const bgMean =
      bgN > 0 ? { r: bgR / bgN, g: bgG / bgN, b: bgB / bgN } : { r: 128, g: 128, b: 128 };

    let changed = 0;
    const newMask = new Uint8ClampedArray(mask);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const off = (y * w + x) * 4;
        const r = srcData[off]!;
        const g = srcData[off + 1]!;
        const bVal = srcData[off + 2]!;
        // Distance to fg / bg means.
        const dFg = Math.sqrt(
          Math.max(1e-6, (r - fgMean.r) ** 2 + (g - fgMean.g) ** 2 + (bVal - fgMean.b) ** 2),
        );
        const dBg = Math.sqrt(
          Math.max(1e-6, (r - bgMean.r) ** 2 + (g - bgMean.g) ** 2 + (bVal - bgMean.b) ** 2),
        );
        // Classify: closer to fg → 255; closer to bg → 0; tie or ambiguous stays as previous.
        let newVal: number = mask[y * w + x]!;
        if (dFg < dBg - tol) {
          newVal = 255;
        } else if (dBg < dFg - tol) {
          newVal = 0;
        }
        // If ambiguous (difference < tolerance), keep previous classification.
        if (newVal !== mask[y * w + x]) changed++;
        newMask[y * w + x] = newVal;
      }
    }
    mask = newMask;
    if (changed === 0) break; // Stable — stop early.
  }
  return mask;
}

/**
 * Tier 1 rectangle-hint segmentation (clear fallback, no GrabCut).
 */
export function segmentRectangle(image: RasterImage, rect: RectangleHint): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const clamped = clampRectangle(rect, w, h);

  // 1. Initial colour-range classification inside the rectangle.
  const stats = regionStats(image.frames[0]!.data, w, h, clamped);
  // Build a loose colour-range mask for initial segmentation.
  const looseLower = {
    r: Math.max(0, stats.r - stats.stdR * 2),
    g: Math.max(0, stats.g - stats.stdG * 2),
    b: Math.max(0, stats.b - stats.stdB * 2),
  };
  const looseUpper = {
    r: Math.min(255, stats.r + stats.stdR * 2),
    g: Math.min(255, stats.g + stats.stdG * 2),
    b: Math.min(255, stats.b + stats.stdB * 2),
  };
  const initialMask = colourRange(image, looseLower, looseUpper);

  // Force pixels clearly outside the rectangle to background (0).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        x < clamped.x ||
        x >= clamped.x + clamped.width ||
        y < clamped.y ||
        y >= clamped.y + clamped.height
      ) {
        initialMask[y * w + x] = 0; // outside rectangle → background
      }
    }
  }

  // 2. Watershed refinement on the initial mask.
  const refinedMask = watershedRefinement(image, initialMask);

  // 3. Iterative colour-model refinement.
  const finalMask = iterativeColourRefinement(image, refinedMask);

  return finalMask;
}

/**
 * Watershed refinement: marker-controlled watershed.
 *
 * Algorithm (independent, clean-room):
 * 1. Treat the initial mask as markers: fg pixels (255) are foreground
 *    markers, bg pixels (0) are background markers. Unknown pixels
 *    (other values) are the basins to be filled.
 * 2. Compute a gradient magnitude (Sobel-style approximation) on the
 *    grayscale source image. High-gradient pixels are ridge lines.
 * 3. Propagate labels from markers into unknown basins by finding,
 *    for each unknown pixel, the nearest labelled pixel (fg or bg)
 *    that minimizes a combined distance: Euclidean colour distance in
 *    RGB space plus a ridge-penalty (high-gradient pixels increase
 *    distance, discouraging crossing edges). This mimics the watershed
 *    principle of filling basins from minima toward ridges, but without
 *    relying on any external watershed library.
 */
function watershedRefinement(
  image: RasterImage,
  initialMask: Uint8ClampedArray,
): Uint8ClampedArray {
  const w = image.width;
  const h = image.height;
  const srcData = image.frames[0]!.data;
  const out = new Uint8ClampedArray(initialMask);

  // Precompute grayscale gradient magnitude for ridge detection.
  const gray = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      gray[y * w + x] = (srcData[off]! + srcData[off + 1]! + srcData[off + 2]!) / 3;
    }
  }
  const mag = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      let gx = 0,
        gy = 0;
      // Simple 3-point central difference for gradient.
      gx = (gray[idx + 1] ?? 0) - (gray[idx - 1] ?? 0);
      gy = (gray[idx + w] ?? 0) - (gray[idx - w] ?? 0);
      mag[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Propagate from markers to unknown pixels.
  // For determinism, iterate over the image in fixed order and use
  // a bounded search radius around each unknown pixel.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (out[idx] === 0 || out[idx] === 255) continue; // already labelled

      let bestScore = Infinity;
      let bestVal = 0;
      const radius = Math.min(10, w, h);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          const nIdx = ny * w + nx;
          const nVal = initialMask[nIdx];
          if (nVal !== 0 && nVal !== 255) continue; // only markers

          const nOff = nIdx * 4;
          const r = srcData[nOff]!;
          const g = srcData[nOff + 1]!;
          const bVal = srcData[nOff + 2]!;
          const off = idx * 4;
          const rU = srcData[off]!;
          const gU = srcData[off + 1]!;
          const bU = srcData[off + 2]!;

          // Colour distance.
          const dColour = Math.sqrt((rU - r) ** 2 + (gU - g) ** 2 + (bU - bVal) ** 2);
          // Ridge penalty: high gradient increases distance, discouraging crossing.
          const ridgePenalty = 0.5 * (mag[nIdx] ?? 0);
          // Combined score: closer colour + lower ridge = stronger basin connection.
          const score = dColour + ridgePenalty;

          if (score < bestScore) {
            bestScore = score;
            bestVal = nVal;
          }
        }
      }
      out[idx] = bestVal;
    }
  }
  return out;
}

/** Combined Tier 1 segmentation pipeline. */
export function segmentTier1(
  image: RasterImage,
  rect: RectangleHint,
  // opts unused intentionally — reserved for future tier-2 upgrade path
  _opts?: { iterations?: number; tolerance?: number },
): Uint8ClampedArray {
  return segmentRectangle(image, rect);
}
