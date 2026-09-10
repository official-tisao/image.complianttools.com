/**
 * P4-07 — Alpha matting (cleared fallback only).
 *
 * Provenance / clearance:
 * - Closed-form matting (Levin et al. CVPR 2006) is NOT cleared
 *   (§25.3.2, §28.6, docs/PLAN.md) and is NOT implemented here.
 * - KNN matting (2012) could be a fallback, but this file ships the
 *   cleared band-limited colour-unmixing solve rather than relying
 *   on an external KNN reference of unverified provenance.
 * - No code is derived from any excluded algorithm (seam carving,
 *   guided filter, closed-form matting, PatchMatch, etc.).
 *
 * Mechanism:
 * - Trimap defines hard foreground (mask=255), hard background
 *   (mask=0), and unknown (any other value, conventionally 128).
 * - For unknown pixels, a local colour-distance solve estimates
 *   alpha from the ratio of similarity to the foreground and
 *   background colour distributions (mean RGB of the nearest
 *   known pixels in a 3×3 band). This is a band-limited colour-
 *   unmixing approach (classical unmixing, no patent concern).
 * - Hard assignments are preserved exactly; unknown pixels receive
 *   continuous alpha in [0, 255].
 *
 * No hair/fur reference corpus exists in this repository, so no
 * "production-quality on hair/fur corpus" claim is made here.
 * The algorithm is deterministic, self-contained, and produces
 * continuous alpha transitions on synthetic edges.
 */

import type { RasterImage } from '../types.js';

export interface TrimapOptions {
  readonly trimap: Uint8ClampedArray; // same dimensions as image (w*h); 255=fg, 0=bg, other=unknown
}

/**
 * Compute mean RGB of pixels with a given mask value in a local region,
 * restricted to the 3×3 neighbourhood (band-limited).
 */
function localMeanRgb(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8ClampedArray,
  maskValue: number,
  cx: number,
  cy: number,
): { r: number; g: number; b: number; count: number } {
  let r = 0,
    g = 0,
    b = 0,
    count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const mIdx = ny * width + nx;
      if (mask[mIdx] === maskValue) {
        const off = mIdx * 4;
        r += src[off]!;
        g += src[off + 1]!;
        b += src[off + 2]!;
        count++;
      }
    }
  }
  return {
    r: count > 0 ? r / count : 0,
    g: count > 0 ? g / count : 0,
    b: count > 0 ? b / count : 0,
    count,
  };
}

function colourDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Band-limited colour-unmixing solve for alpha matting.
 *
 * Hard foreground (trimap === 255) → alpha 255.
 * Hard background (trimap === 0)  → alpha 0.
 * Unknown (any other value)        → alpha estimated from local
 * colour similarity to fg/bg means in a 3×3 band.
 */
export function alphaMatting(image: RasterImage, opts: TrimapOptions): RasterImage {
  const w = image.width;
  const h = image.height;
  if (opts.trimap.length !== w * h) {
    throw new RangeError(
      `Trimap size mismatch: image ${w}×${h} (${w * h}), trimap ${opts.trimap.length}`,
    );
  }
  const frame = image.frames[0]!;
  const src = frame.data;
  const out = new Uint8ClampedArray(w * h * 4);

  // Compute global mean RGB for hard fg and hard bg to use as
  // stable reference distributions when local neighbourhoods
  // contain no pixels of the target class.
  let fgR = 0,
    fgG = 0,
    fgB = 0,
    fgCount = 0;
  let bgR = 0,
    bgG = 0,
    bgB = 0,
    bgCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const off = idx * 4;
      if (opts.trimap[idx] === 255) {
        fgR += src[off]!;
        fgG += src[off + 1]!;
        fgB += src[off + 2]!;
        fgCount++;
      } else if (opts.trimap[idx] === 0) {
        bgR += src[off]!;
        bgG += src[off + 1]!;
        bgB += src[off + 2]!;
        bgCount++;
      }
    }
  }
  const fgMean = {
    r: fgCount > 0 ? fgR / fgCount : 128,
    g: fgCount > 0 ? fgG / fgCount : 128,
    b: fgCount > 0 ? fgB / fgCount : 128,
  };
  const bgMean = {
    r: bgCount > 0 ? bgR / bgCount : 128,
    g: bgCount > 0 ? bgG / bgCount : 128,
    b: bgCount > 0 ? bgB / bgCount : 128,
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const off = idx * 4;
      const trimapVal = opts.trimap[idx];
      const r = src[off]!;
      const g = src[off + 1]!;
      const bVal = src[off + 2]!;

      // Hard foreground preserved exactly.
      if (trimapVal === 255) {
        out[off] = r;
        out[off + 1] = g;
        out[off + 2] = bVal;
        out[off + 3] = 255;
        continue;
      }

      // Hard background preserved exactly (alpha 0, colour from source
      // kept for compositing reference, but alpha set to 0).
      if (trimapVal === 0) {
        out[off] = r;
        out[off + 1] = g;
        out[off + 2] = bVal;
        out[off + 3] = 0;
        continue;
      }

      // Unknown region: band-limited colour-unmixing solve.
      // Compute local mean RGB of nearby fg and bg pixels.
      const fgLocal = localMeanRgb(src, w, h, opts.trimap, 255, x, y);
      const bgLocal = localMeanRgb(src, w, h, opts.trimap, 0, x, y);

      // Fall back to global means when local neighbourhood has
      // no pixels of the required class.
      const fgRef = fgLocal.count > 0 ? fgLocal : fgMean;
      const bgRef = bgLocal.count > 0 ? bgLocal : bgMean;

      const dFg = colourDistance({ r, g, b: bVal }, fgRef);
      const dBg = colourDistance({ r, g, b: bVal }, bgRef);

      // Alpha estimate: closer to fg → higher alpha. The ratio
      // is clamped to avoid division-by-zero and kept continuous.
      let alpha: number;
      if (dFg + dBg < 1e-6) {
        alpha = 128;
      } else {
        alpha = Math.round((255 * dBg) / (dFg + dBg));
      }
      alpha = Math.max(0, Math.min(255, alpha));

      out[off] = r;
      out[off + 1] = g;
      out[off + 2] = bVal;
      out[off + 3] = alpha;
    }
  }

  return {
    ...image,
    width: w,
    height: h,
    bitDepth: 8,
    frames: [
      {
        data: out,
        durationMs: frame.durationMs,
        disposal: frame.disposal ?? 'none',
      },
    ],
  };
}
