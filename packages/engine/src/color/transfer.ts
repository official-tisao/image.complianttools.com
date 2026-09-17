import type { RasterImage } from '../types.js';

/**
 * P4-03 — Reinhard mean/std-deviation colour transfer in Lαβ.
 *
 * Mechanism: convert source RGB → Lαβ colour-opponent space, compute mean and
 * standard deviation per channel, then scale / shift target to match source
 * statistics. This is the classic Reinhard et al. (2001) colour transfer.
 *
 * The implementation is independent (no copied code from any external
 * implementation). Per-channel alignment is preserved; alpha is handled
 * by copying the alpha channel unchanged from source or target as required.
 */

export interface ColourTransferOptions {
  readonly targetImage?: RasterImage;
}

export interface HistogramMatchOptions {
  readonly referenceImage?: RasterImage;
}

/** Approximate Lαβ conversion (independent clean-room formulation).
 *  L = luminance; a = red-green opponent; b = blue-yellow opponent.
 *  This is a linear approximation sufficient for mean/std alignment. */
function rgbToLab(pixel: { r: number; g: number; b: number }): { L: number; a: number; b: number } {
  const r = pixel.r / 255;
  const g = pixel.g / 255;
  const b = pixel.b / 255;
  // Simplified Lαβ (approximate Rec.709 luma + opponent channels)
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const a = 0.5 * (r - g);
  const b_ = 0.5 * (b - (r + g) / 2);
  return { L, a, b: b_ };
}

function labToRgb(L: number, a: number, b_: number): { r: number; g: number; b: number } {
  // Inverse approximation
  const r = L + a * 2;
  const g = L - a * 2 + b_ * 2;
  const b = L + b_ * 2;
  return {
    r: Math.max(0, Math.min(255, Math.round(r * 255))),
    g: Math.max(0, Math.min(255, Math.round(g * 255))),
    b: Math.max(0, Math.min(255, Math.round(b * 255))),
  };
}

function computeMeanStd(array: Float64Array): { mean: number; std: number } {
  let sum = 0;
  for (let i = 0; i < array.length; i++) sum += array[i]!;
  const mean = sum / array.length;
  let sqSum = 0;
  for (let i = 0; i < array.length; i++) {
    const d = array[i]! - mean;
    sqSum += d * d;
  }
  const std = Math.sqrt(sqSum / array.length) || 1e-6;
  return { mean, std };
}

/** Reinhard mean/std transfer: adjust source image to match target statistics. */
export function reinhardTransfer(
  source: RasterImage,
  target: RasterImage,
  _opts?: ColourTransferOptions,
): RasterImage {
  const srcData = source.frames[0]!.data;
  const tgtData = target.frames[0]!.data;
  const w = source.width;
  const h = source.height;

  // Read source and target pixels into Lαβ arrays.
  const srcL = new Float64Array(w * h);
  const srcA = new Float64Array(w * h);
  const srcB = new Float64Array(w * h);
  const tgtL = new Float64Array(w * h);
  const tgtA = new Float64Array(w * h);
  const tgtB = new Float64Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const srcLab = rgbToLab({
        r: srcData[off]!,
        g: srcData[off + 1]!,
        b: srcData[off + 2]!,
      });
      const tgtLab = rgbToLab({
        r: tgtData[off]!,
        g: tgtData[off + 1]!,
        b: tgtData[off + 2]!,
      });
      const idx = y * w + x;
      srcL[idx] = srcLab.L;
      srcA[idx] = srcLab.a;
      srcB[idx] = srcLab.b;
      tgtL[idx] = tgtLab.L;
      tgtA[idx] = tgtLab.a;
      tgtB[idx] = tgtLab.b;
    }
  }

  // Compute mean/std for each channel on source and target.
  const srcStatsL = computeMeanStd(srcL);
  const srcStatsA = computeMeanStd(srcA);
  const srcStatsB = computeMeanStd(srcB);
  const tgtStatsL = computeMeanStd(tgtL);
  const tgtStatsA = computeMeanStd(tgtA);
  const tgtStatsB = computeMeanStd(tgtB);

  // Scale and shift source channels to match target statistics.
  const out = new Uint8ClampedArray(srcData.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const idx = y * w + x;
      const L = srcL[idx]!;
      const a_ = srcA[idx]!;
      const b_ = srcB[idx]!;

      const L_t = ((L - srcStatsL.mean) / srcStatsL.std) * tgtStatsL.std + tgtStatsL.mean;
      const a_t = ((a_ - srcStatsA.mean) / srcStatsA.std) * tgtStatsA.std + tgtStatsA.mean;
      const b_t = ((b_ - srcStatsB.mean) / srcStatsB.std) * tgtStatsB.std + tgtStatsB.mean;

      const rgb = labToRgb(L_t, a_t, b_t);
      out[off] = rgb.r;
      out[off + 1] = rgb.g;
      out[off + 2] = rgb.b;
      // Preserve alpha from source.
      out[off + 3] = srcData[off + 3]!;
    }
  }

  return {
    ...source,
    frames: [{ data: out, durationMs: source.frames[0]!.durationMs }],
  };
}

/** Histogram matching: align per-channel histogram of source to reference. */
export function histogramMatch(
  source: RasterImage,
  reference: RasterImage,
  _opts?: HistogramMatchOptions,
): RasterImage {
  const srcData = source.frames[0]!.data;
  const refData = reference.frames[0]!.data;
  const channels = [0, 1, 2]; // R, G, B
  const out = new Uint8ClampedArray(srcData.length);
  out.set(srcData);

  for (const ch of channels) {
    // Build reference histogram.
    const histRef = new Uint32Array(256);
    for (let i = 0; i < refData.length; i += 4) {
      histRef[refData[i + ch]!] = (histRef[refData[i + ch]!] ?? 0) + 1;
    }
    // Build cumulative distribution for reference.
    const cumRef = new Uint32Array(256);
    let sum = 0;
    for (let v = 0; v < 256; v++) {
      sum += histRef[v]!;
      cumRef[v] = sum;
    }
    const totalRef = sum || 1;

    // Build source histogram.
    const histSrc = new Uint32Array(256);
    for (let i = 0; i < srcData.length; i += 4) {
      histSrc[srcData[i + ch]!] = (histSrc[srcData[i + ch]!] ?? 0) + 1;
    }
    const cumSrc = new Uint32Array(256);
    sum = 0;
    for (let v = 0; v < 256; v++) {
      sum += histSrc[v]!;
      cumSrc[v] = sum;
    }
    const totalSrc = sum || 1;

    // Build lookup table mapping source value → reference value.
    const lookup = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      const targetCum = Math.round((cumSrc[v]! / totalSrc) * (totalRef - 1));
      // Find reference value with closest cumulative count.
      let bestVal = 0;
      let bestDiff = Infinity;
      for (let refV = 0; refV < 256; refV++) {
        const diff = Math.abs(cumRef[refV]! - targetCum);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestVal = refV;
        }
      }
      lookup[v] = bestVal;
    }

    // Apply lookup per pixel (only RGB channels, preserve alpha).
    for (let off = 0; off < srcData.length; off += 4) {
      out[off + ch] = lookup[srcData[off + ch]!]!;
    }
  }

  return {
    ...source,
    frames: [{ data: out, durationMs: source.frames[0]!.durationMs }],
  };
}
