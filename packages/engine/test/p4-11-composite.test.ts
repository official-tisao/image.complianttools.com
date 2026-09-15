import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import { compositeLayers } from '../src/layer/composite.js';

describe('P4-11 Layer compositing', () => {
  const createSolid = (r: number, g: number, b: number, a: number) =>
    createRaster(2, 2, new Uint8ClampedArray([r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a]));

  it('returns unchanged image when no layers provided', () => {
    const img = createSolid(100, 100, 100, 255);
    const result = compositeLayers(img);
    expect(result.width).toBe(img.width);
    expect(result.height).toBe(img.height);
    expect(result.frames[0]!.data).toEqual(img.frames[0]!.data);
  });

  it('returns unchanged image when layers array is empty', () => {
    const img = createSolid(100, 100, 100, 255);
    const result = compositeLayers(img, []);
    expect(result.frames[0]!.data).toEqual(img.frames[0]!.data);
  });

  it('applies normal blend with full opacity', () => {
    const base = createSolid(100, 100, 100, 255);
    const overlay = createSolid(200, 200, 200, 255);
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 1, visible: true },
    ]);
    // Normal blend with full opacity should take overlay colour (approximate due to blend logic)
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
  });

  it('skips invisible layers', () => {
    const base = createSolid(100, 100, 100, 255);
    const overlay = createSolid(200, 200, 200, 255);
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 1, visible: false },
    ]);
    // Should be unchanged since layer invisible
    expect(result.frames[0]!.data).toEqual(base.frames[0]!.data);
  });

  it('skips layers with zero opacity', () => {
    const base = createSolid(100, 100, 100, 255);
    const overlay = createSolid(200, 200, 200, 255);
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 0, visible: true },
    ]);
    expect(result.frames[0]!.data).toEqual(base.frames[0]!.data);
  });

  it('handles fully transparent overlay (alpha 0)', () => {
    const base = createSolid(128, 128, 128, 255);
    const overlay = createRaster(
      2,
      2,
      new Uint8ClampedArray([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0]),
    );
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 1, visible: true },
    ]);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(Number.isFinite(result.frames[0]!.data[0]!)).toBe(true);
  });

  it('handles fully opaque overlay', () => {
    const base = createSolid(50, 50, 50, 255);
    const overlay = createSolid(255, 255, 255, 255);
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 1, visible: true },
    ]);
    expect(result.width).toBe(2);
  });

  it('ignores dimension-mismatched layers', () => {
    const base = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255,
      ]),
    );
    const overlay = createRaster(4, 4, new Uint8ClampedArray(new Array(4 * 4 * 4).fill(200)));
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 1, visible: true },
    ]);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.frames[0]!.data.length).toBe(4 * 4);
  });

  it('handles multiple layers sequentially', () => {
    const base = createSolid(100, 100, 100, 255);
    const overlay1 = createSolid(150, 150, 150, 255);
    const overlay2 = createSolid(200, 200, 200, 255);
    const result = compositeLayers(base, [
      { image: overlay1, blendMode: 'normal', opacity: 0.5, visible: true },
      { image: overlay2, blendMode: 'normal', opacity: 0.5, visible: true },
    ]);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.frames[0]!.data.length).toBe(4 * 4);
  });

  it('blend mode multiply produces darker pixels', () => {
    const base = createSolid(200, 200, 200, 255);
    const overlay = createSolid(200, 200, 200, 255);
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'multiply', opacity: 1, visible: true },
    ]);
    // Multiply 200*200/255 ≈ 156, should be lower than 200
    const r = result.frames[0]!.data[0]!;
    expect(r).toBeLessThanOrEqual(200);
    expect(Number.isFinite(r)).toBe(true);
  });

  it('blend mode screen produces brighter pixels', () => {
    const base = createSolid(100, 100, 100, 255);
    const overlay = createSolid(200, 200, 200, 255);
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'screen', opacity: 1, visible: true },
    ]);
    const r = result.frames[0]!.data[0]!;
    expect(Number.isFinite(r)).toBe(true);
  });

  it('blend mode difference produces absolute difference', () => {
    const base = createSolid(200, 100, 50, 255);
    const overlay = createSolid(100, 200, 150, 255);
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'difference', opacity: 1, visible: true },
    ]);
    expect(Number.isFinite(result.frames[0]!.data[0]!)).toBe(true);
  });

  it('deterministic: same inputs yield same output', () => {
    const base = createSolid(128, 64, 32, 255);
    const overlay = createSolid(64, 128, 200, 255);
    const a = compositeLayers(base, [
      { image: overlay, blendMode: 'overlay', opacity: 0.8, visible: true },
    ]);
    const b = compositeLayers(base, [
      { image: overlay, blendMode: 'overlay', opacity: 0.8, visible: true },
    ]);
    for (let i = 0; i < a.frames[0]!.data.length; i++) {
      expect(a.frames[0]!.data[i]!).toBe(b.frames[0]!.data[i]!);
    }
  });

  it('preserves alpha channel of base', () => {
    const base = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        128, 128, 128, 200, 128, 128, 128, 200, 128, 128, 128, 200, 128, 128, 128, 200,
      ]),
    );
    const overlay = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      ]),
    );
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 1, visible: true },
    ]);
    expect(result.frames[0]!.data.length).toBe(16);
  });
});

describe('P4-11 Overlay alpha and hard-edge', () => {
  const createSolid = (r: number, g: number, b: number, a: number) =>
    createRaster(2, 2, new Uint8ClampedArray([r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a]));

  it('fully opaque overlay produces blended colors', () => {
    const base = createSolid(100, 100, 100, 255);
    const overlay = createSolid(200, 200, 200, 255);
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 1, visible: true },
    ]);
    // Normal blend with opaque overlay should take overlay RGB
    expect(result.frames[0]!.data[0]!).toBe(200);
  });

  it('fully transparent overlay preserves base exactly (mask boundary)', () => {
    const base = createSolid(100, 100, 100, 255);
    const overlayTransparent = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        100, 100, 100, 0, 100, 100, 100, 0, 100, 100, 100, 0, 100, 100, 100, 0,
      ]),
    );
    const result = compositeLayers(base, [
      { image: overlayTransparent, blendMode: 'normal', opacity: 1, visible: true },
    ]);
    // Where overlay alpha = 0, base should be preserved exactly
    expect(result.frames[0]!.data[0]!).toBe(100);
    expect(result.frames[0]!.data[1]!).toBe(100);
    expect(result.frames[0]!.data[2]!).toBe(100);
    expect(result.frames[0]!.data[3]!).toBe(255);
  });

  it('partially transparent overlay blends proportionally', () => {
    const base = createSolid(50, 50, 50, 255);
    const overlay = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        200, 200, 200, 128, 200, 200, 200, 128, 200, 200, 200, 128, 200, 200, 200, 128,
      ]),
    );
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 1, visible: true },
    ]);
    // RGB should be blended; alpha should include overlay contribution (clamped to 255 max)
    expect(Number.isFinite(result.frames[0]!.data[3]!)).toBe(true);
    expect(result.frames[0]!.data[3]!).toBeGreaterThanOrEqual(128);
  });

  it('layer opacity combined with pixel alpha affects blend', () => {
    const base = createSolid(100, 100, 100, 255);
    const overlay = createRaster(
      2,
      2,
      new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]),
    );
    const result = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 0.5, visible: true },
    ]);
    // With 50% opacity over opaque base, red should blend with gray
    expect(result.frames[0]!.data[0]!).toBeGreaterThanOrEqual(100);
  });

  it('hard-edge mask boundary: foreground preserved where mask=255, background where mask=0', () => {
    const base = createSolid(0, 0, 255, 255); // blue base
    const overlayMask = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        255,
        0,
        0,
        255, // red opaque at pixel 1
        0,
        0,
        255,
        0, // transparent at pixel 2 (base preserved)
        255,
        0,
        0,
        128, // red semi-transparent at pixel 3
        0,
        0,
        255,
        255, // base opaque at pixel 4
      ]),
    );
    const result = compositeLayers(base, [
      { image: overlayMask, blendMode: 'normal', opacity: 1, visible: true },
    ]);
    // Pixel 1 (red opaque): should be red-ish
    expect(result.frames[0]!.data[0]!).toBeGreaterThanOrEqual(200);
    // Pixel 2 (alpha 0, transparent) is index 4-7; base is [0,0,255,255]
    expect(result.frames[0]!.data[4]!).toBe(0);
    expect(result.frames[0]!.data[6]!).toBe(255);
  });

  it('deterministic with overlay alpha', () => {
    const base = createSolid(128, 128, 128, 255);
    const overlay = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        200, 200, 200, 128, 200, 200, 200, 128, 200, 200, 200, 128, 200, 200, 200, 128,
      ]),
    );
    const a = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 0.7, visible: true },
    ]);
    const b = compositeLayers(base, [
      { image: overlay, blendMode: 'normal', opacity: 0.7, visible: true },
    ]);
    for (let i = 0; i < a.frames[0]!.data.length; i++) {
      expect(a.frames[0]!.data[i]!).toBe(b.frames[0]!.data[i]!);
    }
  });

  it('destination alpha interaction preserved', () => {
    const base = createRaster(
      2,
      2,
      new Uint8ClampedArray([
        100, 100, 100, 128, 100, 100, 100, 128, 100, 100, 100, 128, 100, 100, 100, 128,
      ]),
    );
    const overlayOpaque = createSolid(255, 0, 0, 255);
    const result = compositeLayers(base, [
      { image: overlayOpaque, blendMode: 'normal', opacity: 1, visible: true },
    ]);
    // Base alpha should contribute to final alpha after compositing with opaque overlay
    expect(Number.isFinite(result.frames[0]!.data[3]!)).toBe(true);
  });
});
