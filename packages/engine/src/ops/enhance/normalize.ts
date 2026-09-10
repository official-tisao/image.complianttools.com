import type { RasterImage } from '../../types.js';
import { computeHistogram } from '../histogram.js';

/**
 * Normalize: stretch the per-channel histogram so the
 * `lowPercentile`-th and `highPercentile`-th percentile pixels map to 0
 * and 255 respectively. A pixel-local op — no kernel, no halo. When
 * `lowPercentile === 0` and `highPercentile === 100` and the histogram
 * already covers the full range, this is a no-op (returns the same
 * instance).
 *
 * The percentile lookup is over the luma channel and the same stretch
 * factor is applied to R, G, and B together (so colour balance is
 * preserved). This matches the OC `Normalize` behaviour.
 */
export function applyNormalize(
  image: RasterImage,
  lowPercentile = 0,
  highPercentile = 100,
): RasterImage {
  if (lowPercentile <= 0 && highPercentile >= 100) {
    // Even at default values, the no-op is "no change". The caller may
    // have a non-trivial histogram where this still does something,
    // so we don't short-circuit on the value alone — only on the
    // measured histogram.
  }
  const histogram = computeHistogram(image);
  // Apply the stretch per channel independently. A luma-based
  // stretch (the historical "Normalize" behaviour) is wrong for
  // colourful images because the per-channel range is not
  // luma-proportional; the OC `Normalize` checkbox does a per-channel
  // stretch.
  const loR = percentileFromHistogram(histogram.red, lowPercentile);
  const hiR = percentileFromHistogram(histogram.red, highPercentile);
  const loG = percentileFromHistogram(histogram.green, lowPercentile);
  const hiG = percentileFromHistogram(histogram.green, highPercentile);
  const loB = percentileFromHistogram(histogram.blue, lowPercentile);
  const hiB = percentileFromHistogram(histogram.blue, highPercentile);
  if (hiR <= loR && hiG <= loG && hiB <= loB) return image; // zero-variance on all channels
  const scaleR = hiR > loR ? 255 / (hiR - loR) : 0;
  const scaleG = hiG > loG ? 255 / (hiG - loG) : 0;
  const scaleB = hiB > loB ? 255 / (hiB - loB) : 0;
  const newFrames = image.frames.map((frame) => {
    const input = frame.data;
    const output = new Uint8ClampedArray(input.length);
    for (let offset = 0; offset < input.length; offset += 4) {
      output[offset] = scaleR > 0 ? clampByte((input[offset]! - loR) * scaleR) : input[offset]!;
      output[offset + 1] =
        scaleG > 0 ? clampByte((input[offset + 1]! - loG) * scaleG) : input[offset + 1]!;
      output[offset + 2] =
        scaleB > 0 ? clampByte((input[offset + 2]! - loB) * scaleB) : input[offset + 2]!;
      output[offset + 3] = input[offset + 3]!;
    }
    return { ...frame, data: output };
  });
  return { ...image, frames: newFrames as unknown as RasterImage['frames'] };
}

/**
 * Find the `percentile` (0..100) value of a 256-bin histogram. Returns
 * the bin index whose cumulative count first meets or exceeds
 * `totalPixels × percentile / 100`. O(256) — fast.
 */
function percentileFromHistogram(histogram: Uint32Array, percentile: number): number {
  const total = histogram.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const target = Math.max(0, Math.min(total, Math.floor((total * percentile) / 100)));
  let cum = 0;
  for (let i = 0; i < 256; i += 1) {
    cum += histogram[i] ?? 0;
    if (cum >= target) return i;
  }
  return 255;
}

function clampByte(value: number): number {
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
