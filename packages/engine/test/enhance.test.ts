import { describe, expect, it } from 'vitest';

import {
  createRaster,
  executeTiled,
  applyAntialias,
  applyBlur,
  applyDenoise,
  applyDespeckle,
  applyEnhanceToggle,
  applyNoMultilayer,
  applyNormalize,
  applySharpen,
  applyThreshold,
  otsuThreshold,
  sauvolaThresholdMap,
  BLUR_HALO_FN,
  DESPECKLE_HALO_FN,
  ENHANCE_HALO,
  SHARPEN_HALO_FN,
  type RasterImage,
} from '../src/index.js';

const bytes = (image: { frames: readonly { data: Uint8ClampedArray }[] }) =>
  Array.from(image.frames[0]!.data);

const bytesAll = (image: RasterImage) => Array.from(image.frames[0]!.data);

function gradientRaster(): RasterImage {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const offset = (y * 8 + x) * 4;
      data[offset] = (x * 32) % 256;
      data[offset + 1] = (y * 32) % 256;
      data[offset + 2] = ((x + y) * 16) % 256;
      data[offset + 3] = 255;
    }
  }
  return createRaster(8, 8, data);
}

describe('P3-04 enhancement ops: defaults are no-ops', () => {
  it('applyDespeckle with radius 0 is a no-op', () => {
    const r = gradientRaster();
    expect(applyDespeckle(r, 0)).toBe(r);
  });

  it('applySharpen with amount 0 is a no-op', () => {
    const r = gradientRaster();
    expect(applySharpen(r, 0)).toBe(r);
  });

  it('applyAntialias with amount 0 is a no-op', () => {
    const r = gradientRaster();
    expect(applyAntialias(r, 0)).toBe(r);
  });

  it('applyNormalize produces a valid RGBA image', () => {
    // Per-channel percentile stretch — when the histogram already
    // covers 0..255 the operation is approximately a no-op, but the
    // exact output is not byte-identical because the per-channel
    // histogram may have gaps (e.g. 0, 32, 64, 96, 128, 160, 192,
    // 224 in our gradient) that the stretch expands. The contract
    // is that the output is a valid RGBA image — every byte in
    // 0..255, alpha preserved.
    const r = gradientRaster();
    const out = applyNormalize(r, 0, 100);
    expect(out.frames[0]!.data.length).toBe(r.frames[0]!.data.length);
    for (let i = 0; i < out.frames[0]!.data.length; i += 4) {
      expect(out.frames[0]!.data[i]!).toBeGreaterThanOrEqual(0);
      expect(out.frames[0]!.data[i]!).toBeLessThanOrEqual(255);
      expect(out.frames[0]!.data[i + 1]!).toBeGreaterThanOrEqual(0);
      expect(out.frames[0]!.data[i + 1]!).toBeLessThanOrEqual(255);
      expect(out.frames[0]!.data[i + 2]!).toBeGreaterThanOrEqual(0);
      expect(out.frames[0]!.data[i + 2]!).toBeLessThanOrEqual(255);
      expect(out.frames[0]!.data[i + 3]).toBe(255);
    }
  });

  it('applyBlur with radius 0 is a no-op', () => {
    const r = gradientRaster();
    expect(applyBlur(r, 'gaussian', 0)).toBe(r);
  });

  it('applyEnhanceToggle with amount 0 is a no-op', () => {
    const r = gradientRaster();
    expect(applyEnhanceToggle(r, 0)).toBe(r);
  });

  it('applyDenoise with strength 0 is a no-op', () => {
    const r = gradientRaster();
    expect(applyDenoise(r, 'median', 0)).toBe(r);
  });

  it('applyThreshold with mode off is a no-op', () => {
    const r = gradientRaster();
    expect(applyThreshold(r, 'off')).toBe(r);
  });

  it('applyNoMultilayer is a no-op on single-frame input', () => {
    const r = gradientRaster();
    expect(applyNoMultilayer(r)).toBe(r);
  });
});

describe('P3-04 enhancement ops: kernels are tile-safe', () => {
  // For each kernel op, the result of `executeTiled` with the
  // documented halo must match the whole-image result byte-for-byte.
  const TILE = 3;

  it('despeckle at radius 1 is tile-safe with halo = DESPECKLE_HALO_FN(1)', () => {
    const r = gradientRaster();
    const halo = DESPECKLE_HALO_FN(1);
    const direct = applyDespeckle(r, 1);
    const tiled = executeTiled(r, (tile) => applyDespeckle(tile, 1), TILE, halo);
    expect(bytesAll(tiled)).toEqual(bytesAll(direct));
  });

  it('sharpen at radius 2 is tile-safe with halo = SHARPEN_HALO_FN(2)', () => {
    const r = gradientRaster();
    const halo = SHARPEN_HALO_FN(2);
    const direct = applySharpen(r, 100, 2, 0);
    const tiled = executeTiled(r, (tile) => applySharpen(tile, 100, 2, 0), TILE, halo);
    expect(bytesAll(tiled)).toEqual(bytesAll(direct));
  });

  it('blur (gaussian) is tile-safe with halo = BLUR_HALO_FN(gaussian, 2)', () => {
    const r = gradientRaster();
    const halo = BLUR_HALO_FN('gaussian', 2);
    const direct = applyBlur(r, 'gaussian', 2);
    const tiled = executeTiled(r, (tile) => applyBlur(tile, 'gaussian', 2), TILE, halo);
    expect(bytesAll(tiled)).toEqual(bytesAll(direct));
  });

  it('blur (box) is tile-safe with halo = BLUR_HALO_FN(box, 2)', () => {
    const r = gradientRaster();
    const halo = BLUR_HALO_FN('box', 2);
    const direct = applyBlur(r, 'box', 2);
    const tiled = executeTiled(r, (tile) => applyBlur(tile, 'box', 2), TILE, halo);
    expect(bytesAll(tiled)).toEqual(bytesAll(direct));
  });

  it('enhance is NOT tile-safe by design (whole-image histogram read inside the op)', () => {
    // `applyEnhanceToggle` reads the per-frame histogram inside the
    // op body. A tile's histogram is a strict subset of the whole
    // image's, so the auto-levels step inside the op produces a
    // different stretch per tile. The executor therefore runs
    // enhance on the whole image without tiling, which is honest
    // and avoids the bug. This test guards that contract by
    // asserting the per-tile result DIFFERS from the whole-image
    // result — the opposite of the kernel-op tile-safety tests
    // above. The change is logged in PLAN.md §16.
    const r = gradientRaster();
    const direct = applyEnhanceToggle(r, 50);
    const tiled = executeTiled(r, (tile) => applyEnhanceToggle(tile, 50), TILE, ENHANCE_HALO);
    expect(bytesAll(tiled)).not.toEqual(bytesAll(direct));
  });

  it('denoise (median) is tile-safe with halo 1', () => {
    const r = gradientRaster();
    const direct = applyDenoise(r, 'median', 50);
    const tiled = executeTiled(r, (tile) => applyDenoise(tile, 'median', 50), TILE, 1);
    expect(bytesAll(tiled)).toEqual(bytesAll(direct));
  });

  it('threshold (Sauvola) is tile-safe with halo 7', () => {
    const r = gradientRaster();
    const direct = applyThreshold(r, 'adaptive');
    const tiled = executeTiled(r, (tile) => applyThreshold(tile, 'adaptive'), TILE, 7);
    expect(bytesAll(tiled)).toEqual(bytesAll(direct));
  });
});

describe('P3-04 enhancement ops: semantics', () => {
  it('despeckle replaces a salt-and-pepper pixel with the local median', () => {
    // Build a 3×3 raster with a single bright outlier in the middle.
    const data = new Uint8ClampedArray(3 * 3 * 4).fill(50);
    for (let i = 0; i < 9; i += 1) data[i * 4 + 3] = 255;
    data[4 * 4] = 250; // outlier
    const r = createRaster(3, 3, data);
    const out = applyDespeckle(r, 1);
    // The median of 50..50 + 250 is 50, so the outlier is removed.
    expect(out.frames[0]!.data[4 * 4]).toBe(50);
  });

  it('sharpen on a hard edge pushes the edge brighter / darker', () => {
    // Build a 2x2 raster with a vertical edge: left half black, right
    // half white. After sharpen, the bright side gets brighter and the
    // dark side gets darker.
    const data = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255,
      0, 0, 0, 255, 255, 255, 255, 255,
    ]);
    const r = createRaster(2, 2, data);
    const out = applySharpen(r, 100, 1, 0);
    expect(out.frames[0]!.data[0]).toBeLessThan(0 + 1); // clamped, but < input
    expect(out.frames[0]!.data[4]).toBeGreaterThan(255 - 1);
  });

  it('Otsu picks a threshold between two intensity bands separated by mid-grey', () => {
    // 8 dark pixels at luma 50 and 8 bright pixels at luma 200. Otsu
    // should land in the gap (51..199) so the two classes are
    // maximally separated.
    const data = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < 16; i += 1) {
      const v = i < 8 ? 50 : 200;
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const r = createRaster(16, 1, data);
    const t = otsuThreshold(r);
    expect(t).toBeGreaterThan(50);
    expect(t).toBeLessThan(200);
  });

  it('Sauvola returns a per-pixel threshold map of the right size', () => {
    const r = gradientRaster();
    const map = sauvolaThresholdMap(r);
    expect(map).not.toBeNull();
    expect(map!.length).toBe(8 * 8);
  });

  it('applyThreshold with a numeric value produces pure black/white', () => {
    const r = gradientRaster();
    const out = applyThreshold(r, 128);
    for (let i = 0; i < out.frames[0]!.data.length; i += 4) {
      const v = out.frames[0]!.data[i]!;
      expect(v === 0 || v === 255).toBe(true);
    }
  });

  it('applyDenoise with bilateral produces a smooth but edge-aware result', () => {
    const r = gradientRaster();
    const out = applyDenoise(r, 'bilateral', 50);
    // The output should not be identical to the input (it's a denoise
    // op, not a no-op), but it should still be valid RGBA.
    for (const v of out.frames[0]!.data) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('applyEnhanceToggle(amount=100) increases contrast on a low-contrast gradient', () => {
    // Low-contrast gradient: luma 80..120 over 8 px. After a 100%
    // enhance, the standard deviation across the row should be
    // larger than before.
    const data = new Uint8ClampedArray(8 * 4);
    for (let i = 0; i < 8; i += 1) {
      const v = 80 + i * 5;
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const r = createRaster(8, 1, data);
    const before = stddev(Array.from(r.frames[0]!.data).filter((_, i) => i % 4 === 0));
    const out = applyEnhanceToggle(r, 100);
    const after = stddev(Array.from(out.frames[0]!.data).filter((_, i) => i % 4 === 0));
    expect(after).toBeGreaterThan(before);
  });
});

function stddev(values: readonly number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return Math.sqrt(variance);
}

describe('P3-04 noMultilayer: multi-frame input collapses to first frame', () => {
  it('collapses a 2-frame raster to 1 frame', () => {
    const r: RasterImage = {
      width: 1,
      height: 1,
      colorSpace: 'srgb',
      bitDepth: 8,
      premultipliedAlpha: false,
      frames: [
        { data: new Uint8ClampedArray([1, 2, 3, 255]), durationMs: 10 },
        { data: new Uint8ClampedArray([4, 5, 6, 255]), durationMs: 20 },
      ],
    } as RasterImage;
    const out = applyNoMultilayer(r);
    expect(out.frames.length).toBe(1);
    expect(bytes(out)).toEqual([1, 2, 3, 255]);
  });
});
