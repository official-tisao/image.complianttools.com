import type { RasterImage } from '../types.js';

/**
 * P3-05 T46 recolour / hue replace.
 *
 * For each pixel:
 *   1. Convert RGB to HSV (using the standard hue formula).
 *   2. Compute the circular hue distance to `targetHue`.
 *   3. If the distance is within `tolerance`, blend toward the
 *      `replacement` colour, with a soft `feather` transition. The
 *      blend factor is `1 - max(0, distance − tolerance) / feather`
 *      (clamped to 0..1).
 *   4. Pixels outside the tolerance window are passed through
 *      unchanged.
 *
 * The output preserves the input's alpha and overall luminance; only
 * the hue is shifted toward the replacement.
 *
 * Note: the engine also has a Zod-derived `RecolourOptions` type
 * (the schema's `RecolourOptionsSchema`). The two are kept distinct
 * on purpose: the schema is the recipe-facing wire format, and this
 * is the engine-internal settings record passed to `applyRecolour`.
 */
export interface RecolourSettings {
  readonly targetHue: number; // 0..360
  readonly tolerance: number; // 0..180
  readonly replacement: { r: number; g: number; b: number };
  readonly feather: number; // 0..180
}

export function applyRecolour(image: RasterImage, options: RecolourSettings): RasterImage {
  const { targetHue, tolerance, replacement, feather } = options;
  if (tolerance <= 0) return image;
  const featherSpan = Math.max(1e-6, feather);
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      const hsv = rgbToHsv(r, g, b);
      const distance = circularHueDistance(hsv.h, targetHue);
      if (distance <= tolerance) {
        const t = 1 - Math.max(0, distance - tolerance) / featherSpan;
        // Blend toward the replacement colour while preserving the
        // pixel's luminance.
        const target = rgbToHsv(replacement.r, replacement.g, replacement.b);
        const newH = targetHue; // snapped to the target hue
        const newS = hsv.s * (1 - t) + target.s * t;
        const newV = hsv.v;
        const [nr, ng, nb] = hsvToRgb(newH, newS, newV);
        output[offset] = nr;
        output[offset + 1] = ng;
        output[offset + 2] = nb;
      } else {
        output[offset] = r;
        output[offset + 1] = g;
        output[offset + 2] = b;
      }
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const maxC = Math.max(rn, gn, bn);
  const minC = Math.min(rn, gn, bn);
  const delta = maxC - minC;
  let h = 0;
  if (delta !== 0) {
    if (maxC === rn) h = ((gn - bn) / delta) % 6;
    else if (maxC === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }
  h = (h * 60 + 360) % 360; // degrees
  const s = maxC === 0 ? 0 : delta / maxC;
  return { h, s, v: maxC };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hh = (h / 60) % 6;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) {
    r = c;
    g = x;
  } else if (hh < 2) {
    r = x;
    g = c;
  } else if (hh < 3) {
    g = c;
    b = x;
  } else if (hh < 4) {
    g = x;
    b = c;
  } else if (hh < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = v - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Circular hue distance in degrees, in [0, 180]. */
function circularHueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
