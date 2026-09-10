/**
 * Dithering strategies for the `monochrome` filter (P3-03). The monochrome filter
 * reduces each pixel to two values (black or white) by default; dithering is the family
 * of techniques that distribute the quantization error spatially so the result preserves
 * the *average* brightness of the source instead of producing hard bands.
 *
 * Five strategies are supported. They are listed in README §6.5:
 *
 *   - 'none'            : simple thresholding (no dithering)
 *   - 'floyd-steinberg' : error diffusion, classic 4-coefficient kernel
 *   - 'atkinson'        : error diffusion, 6-coefficient kernel used on the original Mac
 *   - 'bayer-2x2'       : ordered dithering, 2×2 threshold matrix
 *   - 'bayer-4x4'       : ordered dithering, 4×4 threshold matrix
 *
 * The module is pure (no I/O, no globals, no random state). `errorDiffuse` is the
 * workhorse for the two error-diffusion strategies; `orderedDither` handles the two
 * Bayer matrices.
 *
 * The contract is identical for every strategy: a single-channel byte input is reduced
 * to a single bit, with the dithering method distributing the quantization error.
 * The `monochrome` filter passes the per-pixel luma; the per-channel pipeline in
 * `monochrome.ts` is responsible for the final RGB expansion.
 */

export type DitherName = 'none' | 'floyd-steinberg' | 'atkinson' | 'bayer-2x2' | 'bayer-4x4';

/** The five dithers the monochrome filter supports. */
export const SUPPORTED_DITHERS: readonly DitherName[] = [
  'none',
  'floyd-steinberg',
  'atkinson',
  'bayer-2x2',
  'bayer-4x4',
] as const;

/**
 * Thresholds a 2-D byte buffer to 0/255 using a simple `value >= threshold ? 255 : 0`
 * rule. The threshold is the canonical 128 used by monochrome defaults. Returns a new
 * buffer the same size as the input.
 */
export function threshold(luma: Uint8ClampedArray, thresholdValue = 128): Uint8ClampedArray {
  const output = new Uint8ClampedArray(luma.length);
  for (let i = 0; i < luma.length; i += 1) output[i] = luma[i]! >= thresholdValue ? 255 : 0;
  return output;
}

/**
 * Floyd–Steinberg error diffusion. The kernel is:
 *
 *        *   7
 *   3   5   1     ÷ 16
 *
 * The asterisk is the current pixel. Pixels off the right or bottom edge are dropped.
 */
export function errorDiffuseFloydSteinberg(
  luma: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  // Work on a Float32 copy so the error stays in floating point during diffusion.
  const work = new Float32Array(luma.length);
  for (let i = 0; i < luma.length; i += 1) work[i] = luma[i]!;
  const output = new Uint8ClampedArray(luma.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const oldPixel = work[index]!;
      const newPixel = oldPixel >= 128 ? 255 : 0;
      output[index] = newPixel;
      const error = oldPixel - newPixel;
      // Right
      if (x + 1 < width) work[index + 1] = (work[index + 1] ?? 0) + (error * 7) / 16;
      // Below-left
      if (y + 1 < height && x > 0)
        work[index + width - 1] = (work[index + width - 1] ?? 0) + (error * 3) / 16;
      // Below
      if (y + 1 < height) work[index + width] = (work[index + width] ?? 0) + (error * 5) / 16;
      // Below-right
      if (y + 1 < height && x + 1 < width)
        work[index + width + 1] = (work[index + width + 1] ?? 0) + (error * 1) / 16;
    }
  }
  return output;
}

/**
 * Atkinson error diffusion. The kernel distributes only 6/8 of the error (the remaining
 * 2/8 is dropped, which is the algorithm's hallmark — it produces a slightly lighter
 * image than Floyd–Steinberg and is the original Mac dither used in early System 7):
 *
 *        *   1   1
 *   1   1   1
 *       1
 *
 * Each `1` is `error / 8`; the kernel is ÷ 8.
 */
export function errorDiffuseAtkinson(
  luma: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const work = new Float32Array(luma.length);
  for (let i = 0; i < luma.length; i += 1) work[i] = luma[i]!;
  const output = new Uint8ClampedArray(luma.length);
  const eighth = 1 / 8;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const oldPixel = work[index]!;
      const newPixel = oldPixel >= 128 ? 255 : 0;
      output[index] = newPixel;
      const error = oldPixel - newPixel;
      const push = (target: number) => {
        if (target < 0 || target >= work.length) return;
        work[target] = (work[target] ?? 0) + error * eighth;
      };
      push(index + 1);
      push(index + 2);
      push(index + width - 1);
      push(index + width);
      push(index + width + 1);
      push(index + 2 * width);
    }
  }
  return output;
}

/** 2×2 Bayer threshold matrix, normalised to 0..255. */
const BAYER_2: readonly number[] = (() => {
  // The classic 2×2 matrix is [[0, 2], [3, 1]]; the formula `b / 4 * 255` maps to 0..191.
  const m = [0, 2, 3, 1];
  return m.map((v) => (v / 4) * 255);
})();

/** 4×4 Bayer threshold matrix, normalised to 0..255. */
const BAYER_4: readonly number[] = (() => {
  // Standard 4×4 Bayer matrix, generated by recursive Kronecker product.
  const m2 = [
    [0, 2],
    [3, 1],
  ];
  const m4: number[][] = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (let r = 0; r < 2; r += 1)
    for (let c = 0; c < 2; c += 1)
      for (let rr = 0; rr < 2; rr += 1)
        for (let cc = 0; cc < 2; cc += 1)
          m4[r * 2 + rr]![c * 2 + cc] = m2[r]![c]! * 4 + m2[rr]![cc]!;
  return m4.flat().map((v) => (v / 16) * 255);
})();

/**
 * Ordered (Bayer) dithering. `matrixSize` is 2 or 4. The threshold matrix tiles across
 * the image; each pixel becomes 255 if `luma > matrixThreshold` else 0.
 */
export function orderedDither(
  luma: Uint8ClampedArray,
  width: number,
  height: number,
  matrixSize: 2 | 4,
): Uint8ClampedArray {
  const matrix = matrixSize === 2 ? BAYER_2 : BAYER_4;
  const output = new Uint8ClampedArray(luma.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const threshold = matrix[(y % matrixSize) * matrixSize + (x % matrixSize)] ?? 128;
      output[index] = luma[index]! > threshold ? 255 : 0;
    }
  }
  return output;
}

/**
 * Run the named dither against the per-pixel luma buffer. Returns a new 0/255 buffer
 * the same size as the input. Pure; never mutates the input.
 */
export function applyDither(
  name: DitherName,
  luma: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  switch (name) {
    case 'none':
      return threshold(luma);
    case 'floyd-steinberg':
      return errorDiffuseFloydSteinberg(luma, width, height);
    case 'atkinson':
      return errorDiffuseAtkinson(luma, width, height);
    case 'bayer-2x2':
      return orderedDither(luma, width, height, 2);
    case 'bayer-4x4':
      return orderedDither(luma, width, height, 4);
  }
}
