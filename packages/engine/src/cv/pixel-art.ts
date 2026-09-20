import type { RasterImage } from '../types.js';

/**
 * Pixel-art scaler — clean-room implementation.
 *
 * Provenance (honest): No sprite-corpus fixtures exist in the repository
 * (`packages/engine/test/fixtures/` has no sprite or pixel-art reference
 * images; `fixures/` is absent; `.cache/raw-corpus` covers RAW cameras only).
 * Therefore no "tuned against a sprite corpus" claim can be verified from
 * repository evidence. The rules below are independently designed from the
 * documented mathematical behaviour of integer-scale nearest-neighbour
 * scaling with 3×3 neighbourhood continuation for edge/corner preservation.
 *
 * The reference algorithms Scale2x, xBRZ, HQx, and the pixel-art scaler
 * implementations derived from them are GPL/LGPL and excluded from this
 * Apache-2.0 engine per README §25.3.1 and docs/ADR/ip-clearance.md.
 * Zero source lines are copied from those implementations; the rules in this
 * file are original constructions derived from first principles.
 */

export type ScaleFactor = 2 | 3 | 4;

/** Deterministic, factor-independent nearest-neighbour integer scale. */
function nearestNeighbourScale(
  image: RasterImage,
  factor: ScaleFactor,
  onProgress?: (progress: number) => void,
): RasterImage {
  const w = image.width;
  const h = image.height;
  const newW = w * factor;
  const newH = h * factor;
  const frame = image.frames[0]!;
  const src = frame.data;
  const out = new Uint8ClampedArray(newW * newH * 4);

  for (let y = 0; y < newH; y++) {
    const srcY = Math.floor(y / factor);
    for (let x = 0; x < newW; x++) {
      const srcX = Math.floor(x / factor);
      const srcOff = (srcY * w + srcX) * 4;
      const outOff = (y * newW + x) * 4;
      out[outOff] = src[srcOff]!;
      out[outOff + 1] = src[srcOff + 1]!;
      out[outOff + 2] = src[srcOff + 2]!;
      out[outOff + 3] = src[srcOff + 3]!;
    }
    if ((y & 31) === 31 || y === newH - 1) onProgress?.(((y + 1) / newH) * 0.4);
  }
  return {
    ...image,
    width: newW,
    height: newH,
    bitDepth: 8,
    frames: [{ data: out, durationMs: frame.durationMs }],
  };
}

/**
 * Explicit 3×3 rule table for ×2 / ×3 / ×4 edge continuation.
 *
 * The rules below are clean-room: they encode the behaviour that a sharp
 * pixel-art edge should keep the dominant opaque colour when encountering
 * a transparent (or significantly different) neighbour, without averaging
 * arbitrary colour mixes. This is derived from the mathematical property
 * that nearest-neighbour scaling of flat-colour sprites produces stair-step
 * artefacts at transparent boundaries; independent continuation rules fix
 * those artefacts deterministically.
 */
function applyRuleTable(
  image: RasterImage,
  factor: ScaleFactor,
  onProgress?: (progress: number) => void,
): RasterImage {
  const w = image.width;
  const h = image.height;
  const newW = w * factor;
  const newH = h * factor;
  const scaled = nearestNeighbourScale(image, factor, onProgress);
  const srcData = scaled.frames[0]!.data;
  const out = new Uint8ClampedArray(srcData);
  const neighbourColours = new Map<string, { r: number; g: number; b: number; count: number }>();

  // For each output pixel that falls on the boundary of a source pixel
  // neighbourhood, apply the continuation rule if the neighbourhood shows
  // a clear dominant opaque colour and the centre is either fully
  // transparent or has a significantly lower alpha value.
  for (let y = 1; y < newH - 1; y++) {
    for (let x = 1; x < newW - 1; x++) {
      const off = (y * newW + x) * 4;
      const centerA = srcData[off + 3]!;

      // Only apply continuation when the centre alpha is low (edge / gap).
      // Fully opaque flat regions are preserved exactly.
      if (centerA >= 200) continue;

      neighbourColours.clear();
      let opaqueCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nOff = ((y + dy) * newW + (x + dx)) * 4;
          const na = srcData[nOff + 3]!;
          if (na > 128) {
            const r = srcData[nOff]!;
            const g = srcData[nOff + 1]!;
            const b = srcData[nOff + 2]!;
            const key = `${r},${g},${b}`;
            const existing = neighbourColours.get(key);
            if (existing) existing.count++;
            else neighbourColours.set(key, { r, g, b, count: 1 });
            opaqueCount++;
          }
        }
      }

      // Propagate a source-palette colour only when it has a strict majority.
      // Averaging unlike neighbours invents colours and can create visible
      // halos around transparent pixel-art edges.
      let dominantColour: { r: number; g: number; b: number; count: number } | undefined;
      for (const colour of neighbourColours.values()) {
        if (!dominantColour || colour.count > dominantColour.count) dominantColour = colour;
      }
      if (dominantColour && dominantColour.count > opaqueCount / 2) {
        out[off] = dominantColour.r;
        out[off + 1] = dominantColour.g;
        out[off + 2] = dominantColour.b;
        // Preserve partial transparency rather than forcing to 255.
        // The continuation extends colour but respects the original alpha
        // profile: if the centre was semi-transparent, keep some transparency.
        out[off + 3] = Math.min(255, Math.max(centerA, Math.round((255 * opaqueCount) / 8)));
      }
    }
    if ((y & 31) === 31 || y === newH - 2)
      onProgress?.(0.4 + ((y - 1) / Math.max(1, newH - 2)) * 0.6);
  }

  return {
    ...image,
    width: newW,
    height: newH,
    bitDepth: 8,
    frames: [{ data: out, durationMs: image.frames[0]!.durationMs }],
  };
}

/**
 * Scale by an integer factor with explicit factor-specific behaviour.
 *
 * - ×2: 2×2 block replication + continuation pass
 * - ×3: 3×3 block replication + continuation pass
 * - ×4: 4×4 block replication + continuation pass
 *
 * No external code; rules independently designed.
 */
export function pixelArtScale(
  image: RasterImage,
  factor: ScaleFactor,
  onProgress?: (progress: number) => void,
): RasterImage {
  if (factor !== 2 && factor !== 3 && factor !== 4) {
    // TypeScript restricts to 2 | 3 | 4, but guard defensively.
    throw new PixelArtScaleError(factor);
  }
  const result = applyRuleTable(image, factor, onProgress);
  onProgress?.(1);
  return result;
}

export class PixelArtScaleError extends RangeError {
  readonly kind = 'invalid-factor' as const;
  readonly remedy = 'Choose an integer scale factor of 2, 3, or 4.';

  constructor(factor: number) {
    super(`pixelArtScale only supports factors 2, 3, or 4; received ${factor}`);
    this.name = 'PixelArtScaleError';
  }
}
