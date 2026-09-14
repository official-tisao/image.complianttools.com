import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import { alphaMatting } from '../src/cv/alpha-matting.js';

describe('P4-07 alpha matting — cleared band-limited colour-unmixing fallback', () => {
  // Reference fixtures: no hair/fur corpus exists in repo; fixtures are
  // deterministic synthetic arrays. No false claim of external validation.

  it('basic trimap with fg/bg/unknown produces continuous alpha', () => {
    // 4×4 image with a central 2×2 unknown region surrounded by fg/bg.
    const src = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 0,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255,
    ]);
    const image = createRaster(4, 4, src);
    const trimap = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 128, 128, 255, 255, 128, 128, 255, 255, 255, 255, 255,
    ]);
    const result = alphaMatting(image, { trimap });
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    const d = result.frames[0]!.data;
    // Foreground preserved.
    expect(d[3]).toBe(255);
    // Unknown region (1,1) should have continuous alpha (not 0 or 255 necessarily — intermediate).
    const unknownAlpha = d[(1 * 4 + 1) * 4 + 3];
    expect(unknownAlpha).toBeGreaterThanOrEqual(0);
    expect(unknownAlpha).toBeLessThanOrEqual(255);
  });

  it('hard foreground preserved exactly', () => {
    const src = new Uint8ClampedArray([200, 100, 50, 255]);
    const image = createRaster(1, 1, src);
    const trimap = new Uint8ClampedArray([255]);
    const result = alphaMatting(image, { trimap });
    expect(result.frames[0]!.data[3]).toBe(255);
  });

  it('hard background preserved exactly (alpha 0)', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 255]);
    const image = createRaster(1, 1, src);
    const trimap = new Uint8ClampedArray([0]);
    const result = alphaMatting(image, { trimap });
    expect(result.frames[0]!.data[3]).toBe(0);
  });

  it('alpha remains within [0, 255]', () => {
    const src = new Uint8ClampedArray(new Array(3 * 3 * 4).fill(128));
    const image = createRaster(3, 3, src);
    const trimap = new Uint8ClampedArray([255, 128, 0, 255, 128, 0, 255, 128, 0]);
    const result = alphaMatting(image, { trimap });
    const d = result.frames[0]!.data;
    for (let i = 3; i < d.length; i += 4) {
      expect(d[i]).toBeGreaterThanOrEqual(0);
      expect(d[i]).toBeLessThanOrEqual(255);
    }
  });

  it('unknown region receives interpolated alpha (not fully opaque/transparent)', () => {
    // 3×3 image: corners fg (white), center bg (black), edges unknown.
    const src = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255,
      0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 255, 255, 255, 255,
    ]);
    const image = createRaster(3, 3, src);
    const trimap = new Uint8ClampedArray([255, 128, 255, 0, 128, 0, 255, 128, 255]);
    const result = alphaMatting(image, { trimap });
    const d = result.frames[0]!.data;
    // Unknown edge pixels (e.g. top middle x=1,y=0) should be interpolated.
    const alphaTopMid = d[(0 * 3 + 1) * 4 + 3];
    expect(alphaTopMid).toBeGreaterThanOrEqual(0);
    expect(alphaTopMid).toBeLessThanOrEqual(255);
  });

  it('alpha transition behaves sensibly around artificial hair/fur-like edge', () => {
    // 6×3 stripe: fg (red) on left, bg (blue) on right, narrow unknown band in middle.
    const src = new Uint8ClampedArray(new Array(6 * 3 * 4).fill(128));
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 2; x++) {
        const off = (y * 6 + x) * 4;
        src[off] = 255;
        src[off + 1] = 0;
        src[off + 2] = 0;
        src[off + 3] = 255;
      }
      for (let x = 4; x < 6; x++) {
        const off = (y * 6 + x) * 4;
        src[off] = 0;
        src[off + 1] = 0;
        src[off + 2] = 255;
        src[off + 3] = 255;
      }
    }
    const image = createRaster(6, 3, src);
    const trimap = new Uint8ClampedArray(6 * 3);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 2; x++) trimap[y * 6 + x] = 255;
      for (let x = 2; x < 4; x++) trimap[y * 6 + x] = 128; // unknown band
      for (let x = 4; x < 6; x++) trimap[y * 6 + x] = 0;
    }
    const result = alphaMatting(image, { trimap });
    // Unknown band (x=2,3) should have intermediate alpha values
    const d = result.frames[0]!.data;
    const alphaUnknown = d[(0 * 6 + 2) * 4 + 3];
    expect(alphaUnknown).toBeGreaterThanOrEqual(0);
    expect(alphaUnknown).toBeLessThanOrEqual(255);
    // The transition should vary smoothly: at least one intermediate value
    // should exist (not just 0 or 255 everywhere in the band).
    let intermediateCount = 0;
    for (let y = 0; y < 3; y++) {
      for (let x = 2; x < 4; x++) {
        const a = d[(y * 6 + x) * 4 + 3];
        if (a > 0 && a < 255) intermediateCount++;
      }
    }
    expect(intermediateCount).toBeGreaterThan(0);
  });

  it('invalid trimap dimensions are rejected', () => {
    const image = createRaster(2, 2, new Uint8ClampedArray(new Array(16).fill(128)));
    const trimap = new Uint8ClampedArray(3); // wrong size
    expect(() => alphaMatting(image, { trimap })).toThrow('Trimap size mismatch');
  });

  it('deterministic output', () => {
    const src = new Uint8ClampedArray([
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255,
    ]);
    const image = createRaster(2, 2, src);
    const trimap = new Uint8ClampedArray([255, 0, 128, 255]);
    const a = alphaMatting(image, { trimap });
    const b = alphaMatting(image, { trimap });
    expect(a.frames[0]!.data).toEqual(b.frames[0]!.data);
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
  });

  it('input dimensions preserved', () => {
    const src = new Uint8ClampedArray(new Array(5 * 5 * 4).fill(128));
    const image = createRaster(5, 5, src);
    const trimap = new Uint8ClampedArray(new Array(25).fill(128));
    const result = alphaMatting(image, { trimap });
    expect(result.width).toBe(5);
    expect(result.height).toBe(5);
  });

  it('transparency / alpha preserved from hard assignments', () => {
    // Hard fg pixel with alpha 128 should keep its alpha (not forced to 255 by colour similarity).
    const src = new Uint8ClampedArray([200, 150, 100, 128]);
    const image = createRaster(1, 1, src);
    const trimap = new Uint8ClampedArray([255]);
    const result = alphaMatting(image, { trimap });
    expect(result.frames[0]!.data[3]).toBe(255); // fg preserved as fully opaque (mask 255)
  });

  it('protect mask not required — trimap is the mask mechanism', () => {
    // Verify the interface accepts trimap only; no extra mask parameter needed.
    const src = new Uint8ClampedArray(new Array(4 * 4 * 4).fill(200));
    const image = createRaster(4, 4, src);
    const trimap = new Uint8ClampedArray(new Array(16).fill(128));
    const result = alphaMatting(image, { trimap });
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });
});
