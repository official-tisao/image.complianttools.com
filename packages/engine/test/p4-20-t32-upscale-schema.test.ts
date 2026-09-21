import { describe, expect, it } from 'vitest';
import {
  T32UpscaleOptionsSchema,
  t32UpscaleToolOptionDescriptions,
} from '../src/schemas/t32-upscale-options.js';

describe('T32 route options', () => {
  it('preserves the existing DCCI ×2 defaults', () => {
    expect(T32UpscaleOptionsSchema.parse({})).toEqual({ method: 'dcci', factor: 2 });
  });

  it('accepts every method and scale already supported by the route', () => {
    expect(T32UpscaleOptionsSchema.parse({ method: 'dcci', factor: 2 })).toEqual({
      method: 'dcci',
      factor: 2,
    });
    expect(T32UpscaleOptionsSchema.parse({ method: 'nedi', factor: 4 })).toEqual({
      method: 'nedi',
      factor: 4,
    });
  });

  it('rejects values outside the existing method and scale choices', () => {
    expect(() => T32UpscaleOptionsSchema.parse({ method: 'nearest', factor: 2 })).toThrow();
    expect(() => T32UpscaleOptionsSchema.parse({ method: 'dcci', factor: 3 })).toThrow();
  });

  it('keeps generated controls aligned with the validated route options', () => {
    expect(t32UpscaleToolOptionDescriptions['t32.method']).toMatchObject({
      control: 'select',
      options: ['dcci', 'nedi'],
      defaultValue: 'dcci',
    });
    expect(t32UpscaleToolOptionDescriptions['t32.factor']).toMatchObject({
      control: 'select',
      options: ['2', '4'],
      defaultValue: 2,
    });
  });
});
