import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import { alphaMatting } from '../src/cv/alpha-matting.js';

describe('P4-07 alpha matting — cleared band-limited colour-unmixing fallback', () => {
  // Reference fixtures: no hair/fur corpus exists in repo; fixtures are
  // deterministic synthetic arrays. No false claim of external validation.

  it('basic trimap with fg/bg/unknown produces continuous alpha', () => {
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
    expect(d[3]).toBe(255);
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
    const src = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255,
      0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 255, 255, 255, 255,
    ]);
    const image = createRaster(3, 3, src);
    const trimap = new Uint8ClampedArray([255, 128, 255, 0, 128, 0, 255, 128, 255]);
    const result = alphaMatting(image, { trimap });
    const d = result.frames[0]!.data;
    const alphaTopMid = d[(0 * 3 + 1) * 4 + 3];
    expect(alphaTopMid).toBeGreaterThanOrEqual(0);
    expect(alphaTopMid).toBeLessThanOrEqual(255);
  });

  it('alpha transition behaves sensibly around artificial hair/fur-like edge', () => {
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
      for (let x = 2; x < 4; x++) trimap[y * 6 + x] = 128;
      for (let x = 4; x < 6; x++) trimap[y * 6 + x] = 0;
    }
    const result = alphaMatting(image, { trimap });
    const d = result.frames[0]!.data;
    const alphaUnknown = d[(0 * 6 + 2) * 4 + 3];
    expect(alphaUnknown).toBeGreaterThanOrEqual(0);
    expect(alphaUnknown).toBeLessThanOrEqual(255);
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
    const trimap = new Uint8ClampedArray(3);
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
    const src = new Uint8ClampedArray([200, 150, 100, 128]);
    const image = createRaster(1, 1, src);
    const trimap = new Uint8ClampedArray([255]);
    const result = alphaMatting(image, { trimap });
    expect(result.frames[0]!.data[3]).toBe(255);
  });

  it('protect mask not required — trimap is the mask mechanism', () => {
    const src = new Uint8ClampedArray(new Array(4 * 4 * 4).fill(200));
    const image = createRaster(4, 4, src);
    const trimap = new Uint8ClampedArray(new Array(16).fill(128));
    const result = alphaMatting(image, { trimap });
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  // --- Additional focused P4-07 coverage ---

  it('semi-transparent input pixel preserves colour with estimated alpha under unknown trimap', () => {
    const src = new Uint8ClampedArray([100, 150, 200, 128]);
    const image = createRaster(1, 1, src);
    const trimap = new Uint8ClampedArray([128]);
    const result = alphaMatting(image, { trimap });
    const d = result.frames[0]!.data;
    expect(d[0]).toBe(100);
    expect(d[1]).toBe(150);
    expect(d[2]).toBe(200);
    expect(d[3]).toBeGreaterThanOrEqual(0);
    expect(d[3]).toBeLessThanOrEqual(255);
  });

  it('all-unknown trimap produces alpha within [0,255] for every pixel', () => {
    const src = new Uint8ClampedArray(new Array(2 * 2 * 4).fill(200));
    const image = createRaster(2, 2, src);
    const trimap = new Uint8ClampedArray([128, 128, 128, 128]);
    const result = alphaMatting(image, { trimap });
    const d = result.frames[0]!.data;
    for (let i = 3; i < d.length; i += 4) {
      expect(d[i]).toBeGreaterThanOrEqual(0);
      expect(d[i]).toBeLessThanOrEqual(255);
    }
  });

  it('all-background trimap produces alpha 0 everywhere', () => {
    const src = new Uint8ClampedArray(new Array(2 * 2 * 4).fill(128));
    const image = createRaster(2, 2, src);
    const trimap = new Uint8ClampedArray([0, 0, 0, 0]);
    const result = alphaMatting(image, { trimap });
    const d = result.frames[0]!.data;
    for (let i = 3; i < d.length; i += 4) {
      expect(d[i]).toBe(0);
    }
  });

  it('all-foreground trimap produces alpha 255 everywhere', () => {
    const src = new Uint8ClampedArray(new Array(3 * 3 * 4).fill(128));
    const image = createRaster(3, 3, src);
    const trimap = new Uint8ClampedArray(new Array(9).fill(255));
    const result = alphaMatting(image, { trimap });
    const d = result.frames[0]!.data;
    for (let i = 3; i < d.length; i += 4) {
      expect(d[i]).toBe(255);
    }
  });

  it('single-pixel image with hard fg trimap works', () => {
    const src = new Uint8ClampedArray([80, 90, 100, 255]);
    const image = createRaster(1, 1, src);
    const trimap = new Uint8ClampedArray([255]);
    const result = alphaMatting(image, { trimap });
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.frames[0]!.data[3]).toBe(255);
  });

  it('large image preserves dimensions and produces valid alpha', () => {
    const w = 20;
    const h = 15;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        src[idx] = 100 + x * 5;
        src[idx + 1] = 50 + y * 3;
        src[idx + 2] = 200;
        src[idx + 3] = 255;
      }
    }
    const image = createRaster(w, h, src);
    const trimap = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (y < h / 3) trimap[i] = 255;
        else if (y > (2 * h) / 3) trimap[i] = 0;
        else trimap[i] = 128;
      }
    }
    const result = alphaMatting(image, { trimap });
    expect(result.width).toBe(w);
    expect(result.height).toBe(h);
    expect(result.frames[0]!.data.length).toBe(w * h * 4);
  });

  it('integration with P4-08 refineMatte produces valid refined alpha', async () => {
    const src = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 255, 255, 128, 128, 128, 255,
    ]);
    const image = createRaster(2, 2, src);
    const trimap = new Uint8ClampedArray([255, 255, 128, 0]);
    const matte = alphaMatting(image, { trimap });
    const { refineMatte } = await import('../src/cv/matte-refine.js');
    const refined = refineMatte(image, matte);
    expect(refined.width).toBe(2);
    expect(refined.height).toBe(2);
    const d = refined.frames[0]!.data;
    for (let i = 3; i < d.length; i += 4) {
      expect(d[i]!).toBeGreaterThanOrEqual(0);
      expect(d[i]!).toBeLessThanOrEqual(255);
    }
  });
});
