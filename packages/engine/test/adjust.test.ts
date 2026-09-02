import { describe, expect, it } from 'vitest';

import {
  AdjustOptionsSchema,
  applyAdjustments,
  applyBrightness,
  applyContrast,
  applyExposure,
  applyGamma,
  applyHighlights,
  applySaturation,
  applyShadows,
  applyTemperature,
  applyTint,
  createRaster,
} from '../src/index.js';

const raster = () => createRaster(2, 2, new Uint8ClampedArray(16));

describe('AdjustOptionsSchema (P3-02 foundation)', () => {
  it('applies the documented defaults, including the temperature sentinel', () => {
    expect(AdjustOptionsSchema.parse({})).toEqual({
      brightness: 0,
      contrast: 0,
      saturation: 0,
      exposure: 0,
      gamma: 1,
      temperature: 'detected',
      tint: 0,
      highlights: 0,
      shadows: 0,
    });
  });

  it('accepts the authoritative range boundaries', () => {
    expect(
      AdjustOptionsSchema.parse({
        brightness: 100,
        contrast: -100,
        saturation: 100,
        exposure: 5,
        gamma: 5,
        temperature: 50000,
        tint: 150,
        highlights: -100,
        shadows: 100,
      }),
    ).toMatchObject({
      brightness: 100,
      contrast: -100,
      saturation: 100,
      exposure: 5,
      gamma: 5,
      temperature: 50000,
      tint: 150,
      highlights: -100,
      shadows: 100,
    });
  });

  it('accepts a resolved temperature in Kelvin and the detected sentinel', () => {
    expect(AdjustOptionsSchema.parse({ temperature: 6500 }).temperature).toBe(6500);
    expect(AdjustOptionsSchema.parse({ temperature: 'detected' }).temperature).toBe('detected');
  });

  it('rejects out-of-range values', () => {
    expect(() => AdjustOptionsSchema.parse({ brightness: 101 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ contrast: -101 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ saturation: -101 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ exposure: 6 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ exposure: -5.1 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ gamma: 5.1 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ gamma: 0.05 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ temperature: 1999 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ temperature: 50001 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ tint: 151 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ highlights: 101 })).toThrow();
    expect(() => AdjustOptionsSchema.parse({ shadows: -101 })).toThrow();
  });
});

describe('adjustment operation foundation (P3-02)', () => {
  it('is a true no-op for default options: returns the identical instance (no copy, metadata intact)', () => {
    const image = raster();
    const output = applyAdjustments(image, AdjustOptionsSchema.parse({}));
    expect(output).toBe(image);
  });

  it('each pixel-local adjustment is a no-op at its default and keeps the source instance', () => {
    const image = raster();
    expect(applyBrightness(image, 0)).toBe(image);
    expect(applyContrast(image, 0)).toBe(image);
    expect(applySaturation(image, 0)).toBe(image);
    expect(applyExposure(image, 0)).toBe(image);
    expect(applyGamma(image, 1)).toBe(image);
    expect(applyTint(image, 0)).toBe(image);
    expect(applyHighlights(image, 0)).toBe(image);
    expect(applyShadows(image, 0)).toBe(image);
  });

  it('is metadata-preserving: an active brightness returns a new raster that keeps dimensions and metadata', () => {
    const image = raster();
    const output = applyAdjustments(image, AdjustOptionsSchema.parse({ brightness: 5 }));
    expect(output).not.toBe(image);
    expect(output.width).toBe(image.width);
    expect(output.height).toBe(image.height);
    expect(output.colorSpace).toBe(image.colorSpace);
    expect(output.bitDepth).toBe(image.bitDepth);
    expect(output.premultipliedAlpha).toBe(image.premultipliedAlpha);
  });

  it('does not mutate the source raster when an active adjustment is applied', () => {
    const image = raster();
    const before = Array.from(image.frames[0].data);
    applyAdjustments(image, AdjustOptionsSchema.parse({ contrast: 40 }));
    expect(Array.from(image.frames[0].data)).toEqual(before);
  });

  it('exposes the adjustment composition entry point', () => {
    expect(typeof applyAdjustments).toBe('function');
    expect(typeof applyTemperature).toBe('function');
  });
});

describe('applyBrightness (P3-02.4)', () => {
  const raster2x2 = () =>
    createRaster(
      2,
      2,
      new Uint8ClampedArray([
        10,
        20,
        30,
        255, // pixel 0
        250,
        251,
        252,
        200, // pixel 1
        0,
        0,
        0,
        0, // pixel 2 (fully transparent)
        128,
        129,
        130,
        128, // pixel 3
      ]),
    );
  const onePixel = (rgba: readonly number[]) => createRaster(1, 1, new Uint8ClampedArray(rgba));
  const alphaOf = (data: Uint8ClampedArray) =>
    Array.from(data).filter((_, index) => index % 4 === 3);

  it('brightness=0 returns the exact same instance (true no-op)', () => {
    const image = raster2x2();
    expect(applyBrightness(image, 0)).toBe(image);
  });

  it('positive brightness increases RGB values', () => {
    const out = applyBrightness(onePixel([30, 40, 50, 255]), 20);
    expect(Array.from(out.frames[0].data)).toEqual([50, 60, 70, 255]);
  });

  it('negative brightness decreases RGB values', () => {
    const out = applyBrightness(onePixel([30, 40, 50, 255]), -10);
    expect(Array.from(out.frames[0].data)).toEqual([20, 30, 40, 255]);
  });

  it('clamps lower bounds at 0', () => {
    const out = applyBrightness(onePixel([3, 8, 15, 255]), -20);
    expect(Array.from(out.frames[0].data)).toEqual([0, 0, 0, 255]);
  });

  it('clamps upper bounds at 255', () => {
    const out = applyBrightness(onePixel([250, 251, 252, 255]), 20);
    expect(Array.from(out.frames[0].data)).toEqual([255, 255, 255, 255]);
  });

  it('leaves the alpha channel unchanged', () => {
    const image = raster2x2();
    const out = applyBrightness(image, 30);
    expect(alphaOf(out.frames[0].data)).toEqual(alphaOf(image.frames[0].data));
  });

  it('still processes RGB of transparent pixels (alpha=0 is not skipped)', () => {
    const out = applyBrightness(onePixel([0, 0, 0, 0]), 50);
    expect(Array.from(out.frames[0].data)).toEqual([50, 50, 50, 0]);
  });

  it('does not mutate the source image', () => {
    const image = raster2x2();
    const before = Array.from(image.frames[0].data);
    applyBrightness(image, 25);
    expect(Array.from(image.frames[0].data)).toEqual(before);
  });

  it('preserves RasterImage metadata', () => {
    const iccProfile = new Uint8Array([1, 2, 3]);
    const encodedMetadata = { format: 'png' as const, blocks: [new Uint8Array([])] };
    const image = { ...onePixel([10, 20, 30, 255]), iccProfile, encodedMetadata };
    const out = applyBrightness(image, 10);
    expect(out).not.toBe(image);
    expect(out.iccProfile).toBe(iccProfile);
    expect(out.encodedMetadata).toBe(encodedMetadata);
    expect(out.colorSpace).toBe(image.colorSpace);
    expect(out.bitDepth).toBe(image.bitDepth);
    expect(out.premultipliedAlpha).toBe(image.premultipliedAlpha);
  });

  it('is deterministic for the same input', () => {
    const a = applyBrightness(onePixel([123, 45, 67, 255]), 30);
    const b = applyBrightness(onePixel([123, 45, 67, 255]), 30);
    expect(Array.from(a.frames[0].data)).toEqual(Array.from(b.frames[0].data));
  });

  it('applies the boundary values -100 and +100', () => {
    const low = applyBrightness(onePixel([100, 100, 100, 255]), -100);
    expect(Array.from(low.frames[0].data)).toEqual([0, 0, 0, 255]);
    const high = applyBrightness(onePixel([100, 100, 100, 255]), 100);
    expect(Array.from(high.frames[0].data)).toEqual([200, 200, 200, 255]);
  });
});
