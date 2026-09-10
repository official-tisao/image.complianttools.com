import type { RasterImage } from '../types.js';
import { clampByte } from '../filters/framework.js';

/** A 2-D control point for a curve, in 0..255. `input` is the x coordinate. */
export type CurvePoint = readonly [input: number, output: number];

/**
 * Build a 256-entry lookup table for a curve. The table is the integer byte value that
 * each input byte maps to. Defaults:
 *   - empty array → identity
 *   - single point [v, v] → identity (the engine treats it as no-op)
 *   - non-monotone input → inputs are sorted by x, duplicates are removed (last wins)
 *
 * Interpolation is monotone-cubic (Fritsch–Carlson) so the curve never overshoots its
 * endpoints and never introduces a local extremum. The output is clamped to 0..255.
 */
export function buildCurveLut(points: readonly CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let index = 0; index < 256; index += 1) lut[index] = index;
  if (points.length === 0) return lut;

  // Sort by input, drop duplicates (last write wins), require at least 2 points.
  const sorted = [...points]
    .map(([input, output]) => [input, output] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const dedup: Array<[number, number]> = [];
  for (const point of sorted) {
    const last = dedup[dedup.length - 1];
    if (last && last[0] === point[0]) dedup[dedup.length - 1] = [point[0], point[1]];
    else dedup.push(point);
  }
  if (dedup.length === 1) {
    const v = dedup[0]![1];
    for (let index = 0; index < 256; index += 1) lut[index] = clampByte(v);
    return lut;
  }

  // Segment slopes.
  const n = dedup.length;
  const xs = new Array<number>(n);
  const ys = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    xs[i] = dedup[i]![0];
    ys[i] = dedup[i]![1];
  }
  const deltas = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i += 1) {
    const dx = xs[i + 1]! - xs[i]!;
    deltas[i] = dx === 0 ? 0 : (ys[i + 1]! - ys[i]!) / dx;
  }
  // Fritsch–Carlson tangents.
  const m = new Array<number>(n);
  m[0] = deltas[0]!;
  m[n - 1] = deltas[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    const left = deltas[i - 1]!;
    const right = deltas[i]!;
    if (left * right <= 0) m[i] = 0;
    else m[i] = (left + right) / 2;
  }

  // Sample at every integer 0..255.
  let segment = 0;
  for (let x = 0; x < 256; x += 1) {
    while (segment < n - 2 && xs[segment + 1]! < x) segment += 1;
    const x0 = xs[segment]!;
    const x1 = xs[segment + 1]!;
    if (x1 === x0) {
      lut[x] = clampByte(ys[segment]!);
      continue;
    }
    const t = (x - x0) / (x1 - x0);
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const dx = x1 - x0;
    const value =
      h00 * ys[segment]! +
      h10 * dx * m[segment]! +
      h01 * ys[segment + 1]! +
      h11 * dx * m[segment + 1]!;
    lut[x] = clampByte(value);
  }
  return lut;
}

/**
 * Apply one or more curves to `image`. `rgbCurve` applies to all three channels; per-channel
 * curves override the RGB value for that channel. Each empty curve is the identity; the
 * result is byte-equivalent to the input if every curve is empty.
 *
 * Curves are pixel-local: the operation is tile-safe and fuses with the other pixel-local
 * adjustments in `compile.ts`. The returned `RasterImage` is the same instance when every
 * input curve is empty.
 */
export function applyCurves(
  image: RasterImage,
  curves: {
    rgb?: readonly CurvePoint[];
    r?: readonly CurvePoint[];
    g?: readonly CurvePoint[];
    b?: readonly CurvePoint[];
  },
): RasterImage {
  const hasRgb = (curves.rgb?.length ?? 0) > 0;
  const hasR = (curves.r?.length ?? 0) > 0;
  const hasG = (curves.g?.length ?? 0) > 0;
  const hasB = (curves.b?.length ?? 0) > 0;
  if (!hasRgb && !hasR && !hasG && !hasB) return image;
  const lutRgb = hasRgb ? buildCurveLut(curves.rgb!) : null;
  const lutR = hasR ? buildCurveLut(curves.r!) : null;
  const lutG = hasG ? buildCurveLut(curves.g!) : null;
  const lutB = hasB ? buildCurveLut(curves.b!) : null;
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      const r = input[offset]!;
      const g = input[offset + 1]!;
      const b = input[offset + 2]!;
      output[offset] = lutR ? lutR[r]! : lutRgb ? lutRgb[r]! : r;
      output[offset + 1] = lutG ? lutG[g]! : lutRgb ? lutRgb[g]! : g;
      output[offset + 2] = lutB ? lutB[b]! : lutRgb ? lutRgb[b]! : b;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}
