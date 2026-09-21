import { describe, expect, it } from 'vitest';
import { SmartCropOptionsSchema } from '../src/schemas/options.js';
import {
  approximateSaliencyCropRect,
  centerCropRect,
  ruleOfThirdsCropRect,
  smartCropAnalysisSize,
  type SmartCropImageData,
} from '../src/ops/smart-crop.js';

function rgbaImage(width: number, height: number, pixel: (x: number, y: number) => number[]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, data } satisfies SmartCropImageData;
}

describe('T27 smart-crop geometry', () => {
  it('defaults to original ratio and centered placement, preserving the full source', () => {
    expect(SmartCropOptionsSchema.parse({})).toEqual({ ratio: 'original', method: 'center' });
    expect(centerCropRect(400, 200, 400 / 200)).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    });
  });

  it('rejects option values outside its declared schema', () => {
    expect(() => SmartCropOptionsSchema.parse({ ratio: 'cinema', method: 'face' })).toThrow();
  });

  it('centres the largest matching crop for wide and tall images', () => {
    expect(centerCropRect(400, 200, 1)).toEqual({ x: 100, y: 0, width: 200, height: 200 });
    expect(centerCropRect(200, 400, 1)).toEqual({ x: 0, y: 100, width: 200, height: 200 });
    expect(centerCropRect(400, 200, 2)).toEqual({ x: 0, y: 0, width: 400, height: 200 });
  });

  it('aligns the source centre with a nearest legal rule-of-thirds position', () => {
    const crop = ruleOfThirdsCropRect(600, 400, {
      x: 100,
      y: 0,
      width: 400,
      height: 400,
    });

    expect(crop.width).toBe(400);
    expect(crop.height).toBe(400);
    expect(crop.x).toBeCloseTo(600 / 2 - 400 / 3);
    expect(crop.y).toBe(0);
  });

  it('rejects invalid dimensions and ratios', () => {
    expect(() => centerCropRect(0, 10, 1)).toThrow(RangeError);
    expect(() => centerCropRect(10, 0, 1)).toThrow(RangeError);
    expect(() => centerCropRect(10, 10, 0)).toThrow(RangeError);
    expect(() => centerCropRect(10, 10, Number.NaN)).toThrow(RangeError);
  });

  it('rejects every invalid rule-of-thirds input field', () => {
    const crop = { x: 0, y: 0, width: 1, height: 1 };
    expect(() => ruleOfThirdsCropRect(0, 10, crop)).toThrow('imageWidth');
    expect(() => ruleOfThirdsCropRect(10, 0, crop)).toThrow('imageHeight');
    expect(() => ruleOfThirdsCropRect(10, 10, { ...crop, width: 0 })).toThrow('crop.width');
    expect(() => ruleOfThirdsCropRect(10, 10, { ...crop, height: 0 })).toThrow('crop.height');
    expect(() => ruleOfThirdsCropRect(10, 10, { ...crop, x: Number.NaN })).toThrow(
      'Crop offsets must be finite',
    );
    expect(() => ruleOfThirdsCropRect(10, 10, { ...crop, y: Number.POSITIVE_INFINITY })).toThrow(
      'Crop offsets must be finite',
    );
  });
});

describe('T27 smart-crop analysis', () => {
  it('bounds its analysis image and does not upscale small inputs', () => {
    expect(smartCropAnalysisSize(1200, 600)).toEqual({
      width: 256,
      height: 128,
      scale: 256 / 1200,
    });
    expect(smartCropAnalysisSize(80, 40)).toEqual({ width: 80, height: 40, scale: 1 });
  });

  it('rejects invalid analysis dimensions', () => {
    expect(() => smartCropAnalysisSize(0, 10)).toThrow('imageWidth');
    expect(() => smartCropAnalysisSize(10, Number.NaN)).toThrow('imageHeight');
  });

  it('moves a crop toward an isolated high-contrast feature', () => {
    const image = rgbaImage(100, 50, (x, y) => {
      const bright = x >= 76 && x < 96 && y >= 14 && y < 36;
      const level = bright ? 255 : 24;
      return [level, level, level, 255];
    });

    const crop = approximateSaliencyCropRect({ x: 0, y: 0, width: 50, height: 50 }, image, 1);

    expect(crop.x).toBeGreaterThan(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(100);
    expect(crop.y).toBe(0);
    expect(crop.height).toBe(50);
  });

  it('keeps a low-contrast crop at its preferred position', () => {
    const image = rgbaImage(100, 50, () => [96, 96, 96, 255]);
    const base = { x: 25, y: 0, width: 50, height: 50 };
    expect(approximateSaliencyCropRect(base, image, 1)).toEqual(base);
  });

  it('rejects incomplete RGBA data', () => {
    expect(() =>
      approximateSaliencyCropRect(
        { x: 0, y: 0, width: 1, height: 1 },
        { width: 2, height: 2, data: [0, 0, 0, 255] },
        1,
      ),
    ).toThrow(RangeError);
  });

  it('rejects every invalid saliency input field', () => {
    const crop = { x: 0, y: 0, width: 1, height: 1 };
    const pixels = rgbaImage(2, 2, () => [0, 0, 0, 255]);
    expect(() => approximateSaliencyCropRect(crop, { ...pixels, width: 0 }, 1)).toThrow(
      'image.width',
    );
    expect(() => approximateSaliencyCropRect(crop, { ...pixels, height: 0 }, 1)).toThrow(
      'image.height',
    );
    expect(() => approximateSaliencyCropRect(crop, pixels, 0)).toThrow('scale');
    expect(() => approximateSaliencyCropRect({ ...crop, width: 0 }, pixels, 1)).toThrow(
      'baseCrop.width',
    );
    expect(() => approximateSaliencyCropRect({ ...crop, height: 0 }, pixels, 1)).toThrow(
      'baseCrop.height',
    );
    expect(() => approximateSaliencyCropRect(crop, { ...pixels, width: 1.5 }, 1)).toThrow(
      'positive integers',
    );
    expect(() => approximateSaliencyCropRect(crop, { ...pixels, height: 1.5 }, 1)).toThrow(
      'positive integers',
    );
    expect(() => approximateSaliencyCropRect({ ...crop, x: Number.NaN }, pixels, 1)).toThrow(
      'Crop offsets must be finite',
    );
    expect(() =>
      approximateSaliencyCropRect({ ...crop, y: Number.POSITIVE_INFINITY }, pixels, 1),
    ).toThrow('Crop offsets must be finite');
  });

  it('returns the whole-image crop without scoring when no movement is possible', () => {
    const pixels = rgbaImage(2, 2, () => [10, 20, 30, 255]);
    expect(approximateSaliencyCropRect({ x: 0, y: 0, width: 2, height: 2 }, pixels, 1)).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
  });
});
