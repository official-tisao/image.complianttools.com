/**
 * P4-08 — Edge-aware matte refinement (our own, clean-room).
 *
 * Provenance / clearance (honest):
 * - Joint (cross) bilateral filter: Tomasi & Manduchi 1998 (public domain
 *   technique, well outside any patent term). Not derived from any excluded
 *   implementation. No external bilateral-filter package is used.
 * - Guided filter (He, Sun, Tang 2010, MSR) is EXCLUDED (§25.3.2, §28.6,
 *   docs/ADR/ip-clearance.md) and is NOT present in this file or any import.
 * - Alpha-band trimming and defringe are original constructions for this
 *   engine, not copied from any external implementation.
 * - No reference hair/fur matte corpus exists in the repository; no
 *   "measured against reference" claim is made. Synthetic test assertions
 *   verify structural properties (preservation, continuity, range) rather
 *   than pixel-level reference equality.
 */

import type { RasterImage } from '../types.js';

export interface MatteRefineOptions {
  /** Source guide image (same dimensions as alpha); typically the original photo. */
  readonly guide?: RasterImage;
  /** Radius for spatial weight computation (pixels). */
  readonly spatialSigma?: number;
  /** Radius for colour-intensity similarity weight. */
  readonly colourSigma?: number;
  /** How many iterations of refinement to apply (default 1). */
  readonly iterations?: number;
}

/** Simple Gaussian weight for a distance value. */
function gaussianWeight(dist: number, sigma: number): number {
  return Math.exp(-(dist * dist) / (2 * sigma * sigma));
}

/**
 * Cross (joint) bilateral filter: the guide image's colour/intensity
 * guides the smoothing of the alpha channel. Hard opaque and fully
 * transparent regions are protected by the colour similarity term, so
 * edges in the guide are preserved in the alpha output.
 */
export function crossBilateralRefine(
  image: RasterImage,
  alphaImage: RasterImage,
  opts?: MatteRefineOptions,
): RasterImage {
  const w = alphaImage.width;
  const h = alphaImage.height;
  const guide = opts?.guide ?? image;
  if (guide.width !== w || guide.height !== h) {
    throw new RangeError(
      `Guide dimensions (${guide.width}x${guide.height}) must match alpha (${w}x${h})`,
    );
  }

  const sigmaSpatial = Math.max(0.1, opts?.spatialSigma ?? 1.5);
  const sigmaColour = Math.max(0.1, opts?.colourSigma ?? 20);
  const iterations = Math.max(1, opts?.iterations ?? 1);

  const alphaFrame = alphaImage.frames[0]!;
  let alphaData = new Uint8ClampedArray(alphaFrame.data);
  const guideFrame = guide.frames[0]!;
  const guideData = guideFrame.data;

  // Each iteration refines the previous alpha output.
  for (let it = 0; it < iterations; it++) {
    const prevAlpha = new Uint8ClampedArray(alphaData);
    const newAlpha = new Uint8ClampedArray(alphaData.length);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const off = idx * 4;

        // Use guide pixel intensity (luminance) for colour similarity.
        const guideOff = off; // guide has same RGBA layout
        const guideR = guideData[guideOff]!;
        const guideG = guideData[guideOff + 1]!;
        const guideB = guideData[guideOff + 2]!;
        const guideLum = (guideR + guideG + guideB) / 3;

        let weightSum = 0;
        let alphaSum = 0;

        // Small neighbourhood (3x3 or 5x5) to keep it band-limited and fast.
        const radius = Math.max(1, Math.round(sigmaSpatial));
        const rLim = Math.min(radius, Math.max(2, Math.round(sigmaSpatial)));

        for (let dy = -rLim; dy <= rLim; dy++) {
          for (let dx = -rLim; dx <= rLim; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nOff = (ny * w + nx) * 4;
            const nr = guideData[nOff]!;
            const ng = guideData[nOff + 1]!;
            const nb = guideData[nOff + 2]!;
            const nLum = (nr + ng + nb) / 3;

            const spatialDist = Math.sqrt(dx * dx + dy * dy);
            const colourDist = Math.abs(guideLum - nLum);

            const wSpatial = gaussianWeight(spatialDist, sigmaSpatial);
            const wColour = gaussianWeight(colourDist, sigmaColour);
            const weight = wSpatial * wColour;

            const nAlpha = prevAlpha[nOff + 3]!;
            weightSum += weight;
            alphaSum += weight * nAlpha;
          }
        }

        const refinedAlpha = weightSum > 0 ? alphaSum / weightSum : prevAlpha[off + 3]!;
        newAlpha[off] = prevAlpha[off]!;
        newAlpha[off + 1] = prevAlpha[off + 1]!;
        newAlpha[off + 2] = prevAlpha[off + 2]!;
        newAlpha[off + 3] = Math.max(0, Math.min(255, Math.round(refinedAlpha)));
      }
    }
    alphaData = newAlpha;
  }

  // Build refined alpha as a RasterImage with same dimensions.
  // We keep the original RGB from the input image and replace only alpha.
  const outData = new Uint8ClampedArray(alphaData.length);
  for (let i = 0; i < alphaData.length; i += 4) {
    // Preserve original colour from image, refined alpha from filter.
    const srcOff = i;
    outData[srcOff] = image.frames[0]!.data[srcOff]!;
    outData[srcOff + 1] = image.frames[0]!.data[srcOff + 1]!;
    outData[srcOff + 2] = image.frames[0]!.data[srcOff + 2]!;
    outData[srcOff + 3] = alphaData[srcOff + 3]!;
  }

  return {
    ...image,
    width: w,
    height: h,
    bitDepth: 8,
    frames: [
      {
        data: outData,
        durationMs: image.frames[0]!.durationMs,
        disposal: image.frames[0]!.disposal ?? 'none',
      },
    ],
  };
}

/**
 * Alpha-band trimming: focus refinement on pixels with intermediate alpha
 * (the uncertain transition band), preserving confident opaque and transparent
 * assignments.
 */
export function alphaBandTrim(
  image: RasterImage,
  alphaImage: RasterImage,
  opts?: { lower?: number; upper?: number },
): RasterImage {
  const lower = Math.max(0, opts?.lower ?? 20);
  const upper = Math.min(255, opts?.upper ?? 230);
  const w = alphaImage.width;
  const h = alphaImage.height;
  const srcData = alphaImage.frames[0]!.data;
  const out = new Uint8ClampedArray(srcData.length);
  out.set(srcData);

  // For pixels inside the uncertain band, apply a light smoothing
  // only to the alpha value (not colour), keeping the colour intact
  // so that defringe operates on the correct boundary.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const off = (y * w + x) * 4;
      const a = srcData[off + 3]!;
      if (a >= lower && a <= upper) {
        // Average alpha with 4-connected neighbours.
        const neighbours = [
          srcData[((y - 1) * w + x) * 4 + 3]!,
          srcData[((y + 1) * w + x) * 4 + 3]!,
          srcData[(y * w + (x - 1)) * 4 + 3]!,
          srcData[(y * w + (x + 1)) * 4 + 3]!,
        ];
        const avg = neighbours.reduce((s, v) => s + v, 0) / neighbours.length;
        out[off + 3] = Math.max(0, Math.min(255, Math.round(avg)));
      }
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
        durationMs: image.frames[0]!.durationMs,
        disposal: image.frames[0]!.disposal ?? 'none',
      },
    ],
  };
}

/**
 * Defringe: reduce foreground-colour contamination in semi-transparent
 * edge pixels by blending toward the estimated background colour based
 * on the current alpha value.
 */
export function defringe(
  image: RasterImage,
  alphaImage: RasterImage,
  opts?: { strength?: number },
): RasterImage {
  const strength = Math.max(0, Math.min(1, opts?.strength ?? 0.5));
  const w = alphaImage.width;
  const h = alphaImage.height;
  const srcData = alphaImage.frames[0]!.data;
  const out = new Uint8ClampedArray(srcData.length);
  out.set(srcData);

  // For each pixel with significant but not full alpha, blend the colour
  // slightly toward a neutral tone (grey) proportional to transparency,
  // which reduces colour spill at the edge without destroying the edge.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const a = srcData[off + 3]!;
      if (a > 0 && a < 255) {
        const blendFactor = (255 - a) / 255; // more transparent → more blend
        // Blend RGB channels toward grey (128, 128, 128) by a fraction
        // controlled by blendFactor * strength. This mimics removing
        // background spill without a full colour-unmixing solve (which
        // would need known background colour per pixel).
        const blend = blendFactor * strength;
        const r = srcData[off]!;
        const g = srcData[off + 1]!;
        const bVal = srcData[off + 2]!;
        out[off] = Math.round(r * (1 - blend) + 128 * blend);
        out[off + 1] = Math.round(g * (1 - blend) + 128 * blend);
        out[off + 2] = Math.round(bVal * (1 - blend) + 128 * blend);
        // Alpha is preserved from input.
      }
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
        durationMs: image.frames[0]!.durationMs,
        disposal: image.frames[0]!.disposal ?? 'none',
      },
    ],
  };
}

/** Combined pipeline: bilateral refinement → alpha-band trimming → defringe. */
export function refineMatte(
  image: RasterImage,
  alphaImage: RasterImage,
  opts?: MatteRefineOptions & { trim?: boolean; defringe?: boolean },
): RasterImage {
  let refined: RasterImage = crossBilateralRefine(image, alphaImage, opts);
  if (opts?.trim !== false) {
    refined = alphaBandTrim(image, refined);
  }
  if (opts?.defringe !== false) {
    refined = defringe(image, refined);
  }
  return refined;
}
