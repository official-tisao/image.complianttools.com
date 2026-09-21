import { describe, expect, it } from 'vitest';
import {
  PixelArtToolError,
  PixelArtToolOptionsSchema,
  pixelArtToolError,
} from '../src/schemas/pixel-art.js';
import { createRaster } from '../src/ops/raster.js';
import { pixelArtScale, PixelArtScaleError } from '../src/cv/pixel-art.js';

describe('T70 pixel-art tool contract', () => {
  it('defaults to an exact pass-through until the user enables scaling', () => {
    expect(PixelArtToolOptionsSchema.parse({})).toEqual({ enabled: false, factor: '2' });
  });

  it('accepts only the supported integer scale factors and known options', () => {
    for (const factor of ['2', '3', '4']) {
      expect(PixelArtToolOptionsSchema.parse({ enabled: true, factor })).toEqual({
        enabled: true,
        factor,
      });
    }
    expect(PixelArtToolOptionsSchema.safeParse({ enabled: true, factor: '5' }).success).toBe(false);
    expect(
      PixelArtToolOptionsSchema.safeParse({ enabled: true, factor: '2', sharpen: true }).success,
    ).toBe(false);
  });

  it('exposes typed input failures with a concrete recovery remedy', () => {
    const error = pixelArtToolError('unsupported-file', 'GIF input is not supported.');
    expect(error).toBeInstanceOf(PixelArtToolError);
    expect(error.kind).toBe('unsupported-file');
    expect(error.detail).toContain('GIF');
    expect(error.remedy).toContain('PNG');
  });

  it('provides recovery guidance for every typed tool error', () => {
    const kinds = [
      'unsupported-file',
      'file-too-large',
      'image-too-large',
      'invalid-options',
      'decode-failed',
      'processing-failed',
    ] as const;
    for (const kind of kinds) expect(pixelArtToolError(kind).remedy.trim()).not.toBe('');
  });

  it('rejects a runtime factor outside the typed scale union with a remedy', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([12, 34, 56, 255]));
    try {
      pixelArtScale(image, 5 as 2);
      throw new Error('Expected the invalid factor to throw.');
    } catch (cause) {
      expect(cause).toBeInstanceOf(PixelArtScaleError);
      expect(cause).toMatchObject({ kind: 'invalid-factor' });
      expect((cause as PixelArtScaleError).remedy).toContain('2, 3, or 4');
    }
  });

  it('reports determinate progress through completion', () => {
    const image = createRaster(2, 2, new Uint8ClampedArray(16).fill(255));
    const progress: number[] = [];
    pixelArtScale(image, 2, (value) => progress.push(value));
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(progress.at(-1)).toBe(1);
  });
});
