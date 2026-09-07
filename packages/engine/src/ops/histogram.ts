import type { RasterImage } from '../types.js';

/**
 * One frame's histogram. Each channel is 256 bins over 0..255. `luminance` uses Rec.709
 * weights on the gamma-encoded bytes and bins the same way; it is provided so the levels
 * UI can show a luma-only curve without re-computing per channel.
 */
export interface Histogram {
  readonly red: Uint32Array;
  readonly green: Uint32Array;
  readonly blue: Uint32Array;
  readonly luminance: Uint32Array;
  readonly totalPixels: number;
}

/**
 * Compute the histogram of the first frame of `image`. Read-only — the image is not mutated.
 * Frames after the first are ignored; the call site that wants per-frame data can call this
 * once per frame. The result is allocated per call (256×4 = 1024 bytes for the channels plus a
 * 256-element luma array); caching is the caller's responsibility.
 */
export function computeHistogram(image: RasterImage): Histogram {
  const red = new Uint32Array(256);
  const green = new Uint32Array(256);
  const blue = new Uint32Array(256);
  const luminance = new Uint32Array(256);
  const data = image.frames[0]?.data ?? new Uint8ClampedArray(0);
  let total = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset]!;
    const g = data[offset + 1]!;
    const b = data[offset + 2]!;
    // Alpha is intentionally not counted toward any channel bin.
    red[r] = (red[r] ?? 0) + 1;
    green[g] = (green[g] ?? 0) + 1;
    blue[b] = (blue[b] ?? 0) + 1;
    // Rec.709 luma on the gamma-encoded bytes, binned by floor to 256.
    const luma = Math.min(255, Math.max(0, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
    luminance[luma] = (luminance[luma] ?? 0) + 1;
    total += 1;
  }
  return { red, green, blue, luminance, totalPixels: total };
}
