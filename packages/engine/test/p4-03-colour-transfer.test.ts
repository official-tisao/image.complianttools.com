import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import { reinhardTransfer, histogramMatch } from '../src/color/transfer.js';

function makeImage(w: number, h: number, data: Uint8ClampedArray) {
  return createRaster(w, h, data);
}

describe('P4-03 — Reinhard colour transfer', () => {
  it('preserves dimensions', () => {
    const src = makeImage(
      3,
      2,
      new Uint8ClampedArray([
        10, 20, 30, 255, 50, 60, 70, 255, 90, 100, 110, 255, 130, 140, 150, 255, 160, 170, 180, 255,
        190, 200, 210, 255,
      ]),
    );
    const tgt = makeImage(
      3,
      2,
      new Uint8ClampedArray([
        200, 210, 220, 255, 50, 60, 70, 255, 90, 100, 110, 255, 130, 140, 150, 255, 250, 240, 230,
        255, 220, 210, 200, 255,
      ]),
    );
    const result = reinhardTransfer(src, tgt);
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
    expect(result.frames[0]!.data.length).toBe(24);
  });

  it('preserves alpha (alpha channel unchanged)', () => {
    const src = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        10, 20, 30, 200, 50, 60, 70, 180, 90, 100, 110, 128, 130, 140, 150, 200,
      ]),
    );
    const tgt = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        210, 220, 230, 255, 50, 60, 70, 255, 90, 100, 110, 128, 130, 140, 150, 200,
      ]),
    );
    const result = reinhardTransfer(src, tgt);
    const alphaValues = [result.frames[0]!.data[3], result.frames[0]!.data[7]];
    expect(alphaValues).toContain(200);
    expect(alphaValues).toContain(180);
  });

  it('deterministic output', () => {
    const src = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        30, 60, 90, 255, 120, 150, 180, 255, 200, 210, 220, 255, 240, 230, 200, 255,
      ]),
    );
    const tgt = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        10, 20, 30, 255, 40, 50, 60, 255, 250, 240, 230, 255, 220, 210, 200, 255,
      ]),
    );
    const a = reinhardTransfer(src, tgt);
    const b = reinhardTransfer(src, tgt);
    expect(a.frames[0]!.data).toEqual(b.frames[0]!.data);
  });

  it('mean/std transfer shifts values (not identical copy)', () => {
    const src = makeImage(2, 1, new Uint8ClampedArray([20, 30, 40, 255, 200, 210, 220, 255]));
    const tgt = makeImage(2, 1, new Uint8ClampedArray([200, 210, 220, 255, 220, 230, 240, 255]));
    const result = reinhardTransfer(src, tgt);
    // Should not be identical to source (some colour shift expected).
    expect(result.frames[0]!.data).not.toEqual(src.frames[0]!.data);
  });

  it('handles uniform small image without error', () => {
    const src = makeImage(2, 2, new Uint8ClampedArray(new Array(16).fill(128)));
    src.frames[0]!.data[15] = 255; // set alpha
    const tgt = makeImage(2, 2, new Uint8ClampedArray(new Array(16).fill(200)));
    tgt.frames[0]!.data[3] = 255;
    const result = reinhardTransfer(src, tgt);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
  });

  it('uses every pixel in a differently-sized target image', () => {
    const src = makeImage(2, 1, new Uint8ClampedArray([20, 30, 40, 255, 230, 220, 210, 180]));
    const tgt = makeImage(1, 1, new Uint8ClampedArray([180, 120, 80, 255]));
    const result = reinhardTransfer(src, tgt);
    const output = result.frames[0]!.data;

    expect([...output.slice(0, 3)]).toEqual([180, 120, 80]);
    expect([...output.slice(4, 7)]).toEqual([180, 120, 80]);
    expect([output[3], output[7]]).toEqual([255, 180]);
  });
});

describe('P4-03 — Histogram matching', () => {
  it('preserves dimensions', () => {
    const src = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        10, 20, 30, 255, 50, 60, 70, 255, 90, 100, 110, 255, 130, 140, 150, 255,
      ]),
    );
    const ref = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        200, 210, 220, 255, 230, 240, 250, 255, 250, 240, 230, 255, 220, 210, 200, 255,
      ]),
    );
    const result = histogramMatch(src, ref);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
  });

  it('preserves alpha', () => {
    const src = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        10, 20, 30, 128, 50, 60, 70, 128, 90, 100, 110, 128, 130, 140, 150, 128,
      ]),
    );
    const ref = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        200, 210, 220, 255, 230, 240, 250, 255, 250, 240, 230, 255, 220, 210, 200, 255,
      ]),
    );
    const result = histogramMatch(src, ref);
    expect(result.frames[0]!.data[3]).toBe(128);
    expect(result.frames[0]!.data[7]).toBe(128);
  });

  it('deterministic output', () => {
    const src = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        30, 60, 90, 255, 120, 150, 180, 255, 200, 210, 220, 255, 240, 230, 200, 255,
      ]),
    );
    const ref = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        10, 20, 30, 255, 40, 50, 60, 255, 250, 240, 230, 255, 220, 210, 200, 255,
      ]),
    );
    const a = histogramMatch(src, ref);
    const b = histogramMatch(src, ref);
    expect(a.frames[0]!.data).toEqual(b.frames[0]!.data);
  });

  it('edge case: uniform source and uniform reference', () => {
    const src = makeImage(2, 2, new Uint8ClampedArray(new Array(16).fill(100)));
    src.frames[0]!.data[3] = 255;
    src.frames[0]!.data[7] = 200;
    const ref = makeImage(2, 2, new Uint8ClampedArray(new Array(16).fill(150)));
    ref.frames[0]!.data[3] = 255;
    const result = histogramMatch(src, ref);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.frames[0]!.data[3]).toBe(255);
  });

  it('matches normalized channel quantiles when reference size differs', () => {
    const src = makeImage(
      4,
      1,
      new Uint8ClampedArray([
        0, 0, 0, 255, 50, 50, 50, 255, 100, 100, 100, 255, 150, 150, 150, 255,
      ]),
    );
    const ref = makeImage(2, 1, new Uint8ClampedArray([200, 200, 200, 255, 240, 240, 240, 255]));
    const result = histogramMatch(src, ref);

    expect([0, 4, 8, 12].map((offset) => result.frames[0]!.data[offset])).toEqual([
      200, 200, 240, 240,
    ]);
    expect([3, 7, 11, 15].map((offset) => result.frames[0]!.data[offset])).toEqual([
      255, 255, 255, 255,
    ]);
  });
});
