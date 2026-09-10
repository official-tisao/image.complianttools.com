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
  applyPixelLocalOptions,
  createRaster,
  temperatureGains,
} from '../src/index.js';

const raster = () => createRaster(2, 2, new Uint8ClampedArray(16));
const px = (r: number, g: number, b: number, a = 255) =>
  createRaster(1, 1, new Uint8ClampedArray([r, g, b, a]));
const alphaOf = (data: Uint8ClampedArray) => Array.from(data).filter((_, index) => index % 4 === 3);

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
      whites: 0,
      blacks: 0,
      vibrance: 0,
      hue: 0,
      clarity: 0,
      dehaze: 0,
      opacity: 100,
      curvesRGB: [],
      curvesR: [],
      curvesG: [],
      curvesB: [],
      levelsInBlack: 0,
      levelsGamma: 1,
      levelsInWhite: 255,
      levelsOutBlack: 0,
      levelsOutWhite: 255,
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

describe('applySaturation (P3-02.6)', () => {
  it('returns the same instance for value 0', () => {
    const image = px(100, 150, 200);
    expect(applySaturation(image, 0)).toBe(image);
  });

  it('reproduces Rec.709 grayscale at -100', () => {
    const out = applySaturation(px(100, 150, 200), -100);
    const luma = 0.2126 * 100 + 0.7152 * 150 + 0.0722 * 200; // ≈142.98
    expect(Array.from(out.frames[0].data)).toEqual([
      Math.round(luma),
      Math.round(luma),
      Math.round(luma),
      255,
    ]);
  });

  it('applies the known formula at +50 (doubling distance from luma)', () => {
    const out = applySaturation(px(100, 150, 200), 50);
    expect(Array.from(out.frames[0].data)).toEqual([79, 154, 229, 255]);
  });

  it('clamps at 0 and 255', () => {
    const low = applySaturation(px(200, 0, 0), 100);
    expect(Array.from(low.frames[0].data)).toEqual([255, 0, 0, 255]);
    const high = applySaturation(px(0, 0, 200), 100);
    expect(Array.from(high.frames[0].data)).toEqual([0, 0, 255, 255]);
  });

  it('leaves alpha unchanged', () => {
    const image = px(10, 20, 30, 40);
    expect(alphaOf(applySaturation(image, 30).frames[0].data)).toEqual([40]);
  });

  it('processes transparent pixels', () => {
    const out = applySaturation(px(100, 150, 200, 0), -100);
    const luma = Math.round(0.2126 * 100 + 0.7152 * 150 + 0.0722 * 200);
    expect(Array.from(out.frames[0].data)).toEqual([luma, luma, luma, 0]);
  });

  it('does not mutate the source', () => {
    const image = px(100, 150, 200);
    const before = Array.from(image.frames[0].data);
    applySaturation(image, 50);
    expect(Array.from(image.frames[0].data)).toEqual(before);
  });

  it('preserves metadata and is deterministic', () => {
    const image = { ...px(100, 150, 200), iccProfile: new Uint8Array([9]) };
    const out = applySaturation(image, 50);
    expect(out.iccProfile).toBe(image.iccProfile);
    expect(Array.from(applySaturation(px(100, 150, 200), 50).frames[0].data)).toEqual(
      Array.from(applySaturation(px(100, 150, 200), 50).frames[0].data),
    );
  });
});

describe('applyExposure (P3-02.7)', () => {
  it('returns the same instance for value 0', () => {
    const image = px(100, 150, 200);
    expect(applyExposure(image, 0)).toBe(image);
  });

  it('applies the multiplier 2^EV', () => {
    expect(Array.from(applyExposure(px(100, 150, 200), 1).frames[0].data)).toEqual([
      200, 255, 255, 255,
    ]);
    expect(Array.from(applyExposure(px(100, 150, 200), -1).frames[0].data)).toEqual([
      50, 75, 100, 255,
    ]);
    expect(Array.from(applyExposure(px(10, 20, 30), 2).frames[0].data)).toEqual([40, 80, 120, 255]);
  });

  it('clamps at 0 and 255', () => {
    expect(Array.from(applyExposure(px(100, 100, 100), 5).frames[0].data)).toEqual([
      255, 255, 255, 255,
    ]);
    expect(Array.from(applyExposure(px(100, 100, 100), -5).frames[0].data)).toEqual([3, 3, 3, 255]);
    expect(Array.from(applyExposure(px(10, 10, 10), -5).frames[0].data)).toEqual([0, 0, 0, 255]);
  });

  it('leaves alpha unchanged and processes transparent pixels', () => {
    expect(alphaOf(applyExposure(px(10, 20, 30, 99), 2).frames[0].data)).toEqual([99]);
    expect(Array.from(applyExposure(px(50, 50, 50, 0), 1).frames[0].data)).toEqual([
      100, 100, 100, 0,
    ]);
  });

  it('does not mutate the source', () => {
    const image = px(100, 150, 200);
    const before = Array.from(image.frames[0].data);
    applyExposure(image, 3);
    expect(Array.from(image.frames[0].data)).toEqual(before);
  });

  it('preserves metadata and is deterministic', () => {
    const image = { ...px(100, 150, 200), encodedMetadata: { format: 'png' as const, blocks: [] } };
    const out = applyExposure(image, 2);
    expect(out.encodedMetadata).toBe(image.encodedMetadata);
    expect(Array.from(out.frames[0].data)).toEqual(
      Array.from(applyExposure(px(100, 150, 200), 2).frames[0].data),
    );
  });
});

describe('applyGamma (P3-02.8)', () => {
  it('returns the same instance for gamma 1', () => {
    const image = px(64, 64, 64);
    expect(applyGamma(image, 1)).toBe(image);
  });

  it('gamma > 1 brightens and gamma < 1 darkens', () => {
    expect(Array.from(applyGamma(px(64, 64, 64), 2).frames[0].data)).toEqual([128, 128, 128, 255]);
    expect(Array.from(applyGamma(px(64, 64, 64), 0.5).frames[0].data)).toEqual([16, 16, 16, 255]);
  });

  it('applies the known formula', () => {
    expect(Array.from(applyGamma(px(128, 128, 128), 2).frames[0].data)).toEqual([
      181, 181, 181, 255,
    ]);
  });

  it('handles the 0.1 and 5.0 boundaries', () => {
    expect(Array.from(applyGamma(px(128, 128, 128), 0.1).frames[0].data)).toEqual([0, 0, 0, 255]);
    expect(Array.from(applyGamma(px(64, 64, 64), 5).frames[0].data)).toEqual([193, 193, 193, 255]);
  });

  it('leaves alpha unchanged and processes transparent pixels', () => {
    expect(alphaOf(applyGamma(px(64, 64, 64, 7), 2).frames[0].data)).toEqual([7]);
    expect(Array.from(applyGamma(px(64, 64, 64, 0), 2).frames[0].data)).toEqual([128, 128, 128, 0]);
  });

  it('does not mutate the source', () => {
    const image = px(64, 64, 64);
    const before = Array.from(image.frames[0].data);
    applyGamma(image, 2);
    expect(Array.from(image.frames[0].data)).toEqual(before);
  });

  it('preserves metadata and is deterministic', () => {
    const image = { ...px(64, 64, 64), bitDepth: 8 as const };
    const out = applyGamma(image, 2);
    expect(out.bitDepth).toBe(8);
    expect(Array.from(out.frames[0].data)).toEqual(
      Array.from(applyGamma(px(64, 64, 64), 2).frames[0].data),
    );
  });
});

describe('applyTemperature (P3-02.9)', () => {
  it('applies the authoritative temperatureGains to R and B, leaving G', () => {
    for (const kelvin of [2000, 6500, 50000]) {
      const [redGain, , blueGain] = temperatureGains(kelvin, 0);
      const out = applyTemperature(px(128, 128, 128), kelvin);
      const [r, g, b] = out.frames[0].data;
      expect(r).toBe(Math.min(255, Math.round(128 * redGain)));
      expect(g).toBe(128);
      expect(b).toBe(Math.min(255, Math.round(128 * blueGain)));
    }
  });

  it('low kelvin drives the image toward blue (red down, blue up) per the RAW gains', () => {
    const out = applyTemperature(px(128, 128, 128), 2000);
    const [r, , b] = out.frames[0].data;
    expect(r).toBeLessThan(128);
    expect(b).toBeGreaterThan(128);
  });

  it('high kelvin drives the image toward red (red up, blue down) per the RAW gains', () => {
    const out = applyTemperature(px(128, 128, 128), 50000);
    const [r, , b] = out.frames[0].data;
    expect(r).toBeGreaterThan(128);
    expect(b).toBeLessThan(128);
  });

  it('accepts the 2000 and 50000 boundaries without throwing and is deterministic', () => {
    const a = applyTemperature(px(128, 128, 128), 2000);
    const b = applyTemperature(px(128, 128, 128), 2000);
    expect(Array.from(a.frames[0].data)).toEqual(Array.from(b.frames[0].data));
    expect(() => applyTemperature(px(128, 128, 128), 50000)).not.toThrow();
  });

  it('leaves alpha unchanged and processes transparent pixels', () => {
    expect(alphaOf(applyTemperature(px(128, 128, 128, 5), 6500).frames[0].data)).toEqual([5]);
    expect(applyTemperature(px(128, 128, 128, 0), 6500).frames[0].data[3]).toBe(0);
  });

  it('does not mutate the source', () => {
    const image = px(128, 128, 128);
    const before = Array.from(image.frames[0].data);
    applyTemperature(image, 6500);
    expect(Array.from(image.frames[0].data)).toEqual(before);
  });

  it('preserves metadata', () => {
    const image = { ...px(128, 128, 128), colorSpace: 'srgb' as const };
    const out = applyTemperature(image, 6500);
    expect(out.colorSpace).toBe('srgb');
  });

  it('skips the temperature adjustment for the detected sentinel', () => {
    const image = px(128, 128, 128);
    expect(applyAdjustments(image, AdjustOptionsSchema.parse({ temperature: 'detected' }))).toBe(
      image,
    );
  });
});

describe('applyTint (P3-02.10)', () => {
  it('returns the same instance for value 0', () => {
    const image = px(100, 100, 100);
    expect(applyTint(image, 0)).toBe(image);
  });

  it('applies the green gain 2^(tint/150)', () => {
    expect(Array.from(applyTint(px(100, 100, 100), 150).frames[0].data)).toEqual([
      100, 200, 100, 255,
    ]);
    expect(Array.from(applyTint(px(100, 100, 100), -150).frames[0].data)).toEqual([
      100, 50, 100, 255,
    ]);
  });

  it('leaves R and B unchanged and handles boundaries', () => {
    const out = applyTint(px(50, 60, 70), 150);
    expect(Array.from(out.frames[0].data)).toEqual([50, Math.round(60 * 2), 70, 255]);
    const outNeg = applyTint(px(50, 60, 70), -150);
    expect(Array.from(outNeg.frames[0].data)).toEqual([50, Math.round(60 * 0.5), 70, 255]);
  });

  it('leaves alpha unchanged and processes transparent pixels', () => {
    expect(alphaOf(applyTint(px(100, 100, 100, 11), 100).frames[0].data)).toEqual([11]);
    expect(applyTint(px(100, 100, 100, 0), 100).frames[0].data[3]).toBe(0);
  });

  it('does not mutate the source', () => {
    const image = px(100, 100, 100);
    const before = Array.from(image.frames[0].data);
    applyTint(image, 100);
    expect(Array.from(image.frames[0].data)).toEqual(before);
  });

  it('preserves metadata and is deterministic', () => {
    const image = { ...px(100, 100, 100), premultipliedAlpha: false as const };
    const out = applyTint(image, 100);
    expect(out.premultipliedAlpha).toBe(false);
    expect(Array.from(out.frames[0].data)).toEqual(
      Array.from(applyTint(px(100, 100, 100), 100).frames[0].data),
    );
  });
});

describe('applyHighlights (P3-02.11)', () => {
  it('returns the same instance for value 0', () => {
    const image = px(200, 200, 200);
    expect(applyHighlights(image, 0)).toBe(image);
  });

  it('lifts high-luma pixels with a positive value', () => {
    const out = applyHighlights(px(200, 200, 200), 20);
    expect(Array.from(out.frames[0].data)).toEqual([225, 225, 225, 255]);
  });

  it('reduces high-luma pixels with a negative value', () => {
    const out = applyHighlights(px(200, 200, 200), -20);
    expect(Array.from(out.frames[0].data)).toEqual([175, 175, 175, 255]);
  });

  it('leaves low-luma pixels essentially unaffected', () => {
    const out = applyHighlights(px(10, 10, 10), 100);
    expect(Array.from(out.frames[0].data)).toEqual([10, 10, 10, 255]);
  });

  it('clamps at 255 and boundary +100', () => {
    expect(Array.from(applyHighlights(px(200, 200, 200), 100).frames[0].data)).toEqual([
      255, 255, 255, 255,
    ]);
    expect(Array.from(applyHighlights(px(200, 200, 200), -100).frames[0].data)).toEqual([
      75, 75, 75, 255,
    ]);
  });

  it('leaves alpha unchanged and processes transparent pixels', () => {
    expect(alphaOf(applyHighlights(px(200, 200, 200, 3), 20).frames[0].data)).toEqual([3]);
    expect(applyHighlights(px(200, 200, 200, 0), 20).frames[0].data[3]).toBe(0);
  });

  it('does not mutate the source', () => {
    const image = px(200, 200, 200);
    const before = Array.from(image.frames[0].data);
    applyHighlights(image, 20);
    expect(Array.from(image.frames[0].data)).toEqual(before);
  });

  it('preserves metadata and is deterministic', () => {
    const image = { ...px(200, 200, 200), iccProfile: new Uint8Array([8]) };
    const out = applyHighlights(image, 20);
    expect(out.iccProfile).toBe(image.iccProfile);
    expect(Array.from(out.frames[0].data)).toEqual(
      Array.from(applyHighlights(px(200, 200, 200), 20).frames[0].data),
    );
  });
});

describe('applyShadows (P3-02.12)', () => {
  it('returns the same instance for value 0', () => {
    const image = px(10, 10, 10);
    expect(applyShadows(image, 0)).toBe(image);
  });

  it('lifts low-luma pixels with a positive value', () => {
    const out = applyShadows(px(10, 10, 10), 50);
    expect(Array.from(out.frames[0].data)).toEqual([15, 15, 15, 255]);
  });

  it('deepens low-luma pixels with a negative value', () => {
    const out = applyShadows(px(10, 10, 10), -50);
    expect(Array.from(out.frames[0].data)).toEqual([5, 5, 5, 255]);
  });

  it('leaves high-luma pixels essentially unaffected', () => {
    const out = applyShadows(px(200, 200, 200), 100);
    expect(Array.from(out.frames[0].data)).toEqual([200, 200, 200, 255]);
  });

  it('applies the known mask at midtones', () => {
    expect(Array.from(applyShadows(px(60, 60, 60), 100).frames[0].data)).toEqual([93, 93, 93, 255]);
    expect(Array.from(applyShadows(px(60, 60, 60), -100).frames[0].data)).toEqual([
      27, 27, 27, 255,
    ]);
  });

  it('clamps to black with a strong negative value', () => {
    const out = applyShadows(px(20, 20, 20), -100);
    expect(Array.from(out.frames[0].data)).toEqual([0, 0, 0, 255]);
  });

  it('leaves alpha unchanged and processes transparent pixels', () => {
    expect(alphaOf(applyShadows(px(10, 10, 10, 6), 50).frames[0].data)).toEqual([6]);
    expect(applyShadows(px(10, 10, 10, 0), 50).frames[0].data[3]).toBe(0);
  });

  it('does not mutate the source', () => {
    const image = px(10, 10, 10);
    const before = Array.from(image.frames[0].data);
    applyShadows(image, 50);
    expect(Array.from(image.frames[0].data)).toEqual(before);
  });

  it('preserves metadata and is deterministic', () => {
    const image = { ...px(10, 10, 10), colorSpace: 'srgb' as const };
    const out = applyShadows(image, 50);
    expect(out.colorSpace).toBe('srgb');
    expect(Array.from(out.frames[0].data)).toEqual(
      Array.from(applyShadows(px(10, 10, 10), 50).frames[0].data),
    );
  });
});

describe('applyContrast (P3-02.5)', () => {
  it('returns the same instance for contrast 0', () => {
    const image = px(100, 200, 128);
    expect(applyContrast(image, 0)).toBe(image);
  });

  it('increases separation from the pivot with a positive value', () => {
    const out = applyContrast(px(100, 200, 128), 50);
    expect(Array.from(out.frames[0].data)).toEqual([86, 235, 128, 255]);
  });

  it('reduces separation from the pivot with a negative value', () => {
    const out = applyContrast(px(100, 200, 128), -50);
    expect(Array.from(out.frames[0].data)).toEqual([109, 177, 128, 255]);
  });

  it('leaves the pivot 128 unchanged', () => {
    expect(Array.from(applyContrast(px(128, 128, 128), 100).frames[0].data)).toEqual([
      128, 128, 128, 255,
    ]);
  });

  it('clamps at 0', () => {
    expect(Array.from(applyContrast(px(20, 20, 20), 100).frames[0].data)).toEqual([0, 0, 0, 255]);
  });

  it('clamps at 255', () => {
    expect(Array.from(applyContrast(px(200, 200, 200), 100).frames[0].data)).toEqual([
      255, 255, 255, 255,
    ]);
  });

  it('leaves alpha unchanged and processes transparent pixels', () => {
    expect(alphaOf(applyContrast(px(100, 200, 128, 42), 50).frames[0].data)).toEqual([42]);
    expect(Array.from(applyContrast(px(100, 200, 128, 0), 50).frames[0].data)).toEqual([
      86, 235, 128, 0,
    ]);
  });

  it('does not mutate the source', () => {
    const image = px(100, 200, 128);
    const before = Array.from(image.frames[0].data);
    applyContrast(image, 50);
    expect(Array.from(image.frames[0].data)).toEqual(before);
  });

  it('preserves metadata', () => {
    const image = {
      ...px(100, 200, 128),
      iccProfile: new Uint8Array([5]),
      encodedMetadata: { format: 'png' as const, blocks: [] },
    };
    const out = applyContrast(image, 50);
    expect(out.iccProfile).toBe(image.iccProfile);
    expect(out.encodedMetadata).toBe(image.encodedMetadata);
    expect(out.colorSpace).toBe(image.colorSpace);
    expect(out.bitDepth).toBe(image.bitDepth);
    expect(out.premultipliedAlpha).toBe(image.premultipliedAlpha);
  });

  it('is deterministic', () => {
    expect(Array.from(applyContrast(px(100, 200, 128), 50).frames[0].data)).toEqual(
      Array.from(applyContrast(px(100, 200, 128), 50).frames[0].data),
    );
  });

  it.each([-100, -50, 25, 100])(
    'matches the authoritative applyPixelLocalOptions for contrast %s',
    (contrast) => {
      const image = createRaster(
        2,
        2,
        new Uint8ClampedArray([
          10,
          200,
          90,
          255, // pixel 0
          128,
          128,
          128,
          0, // pixel 1 (transparent)
          5,
          5,
          5,
          9, // pixel 2
          250,
          3,
          17,
          128, // pixel 3
        ]),
      );
      const viaContrast = applyContrast(image, contrast);
      const viaRaster = applyPixelLocalOptions(image, { contrast });
      expect(Array.from(viaContrast.frames[0].data)).toEqual(Array.from(viaRaster.frames[0].data));
    },
  );
});
