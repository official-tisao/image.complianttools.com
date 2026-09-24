import { describe, expect, it } from 'vitest';

import {
  T41ThresholdOptionsSchema,
  T43SharpenBlurOptionsSchema,
  T47DuotoneOptionsSchema,
  t41ThresholdOptionDescriptions,
  t43SharpenBlurOptionDescriptions,
  t47DuotoneOptionDescriptions,
} from '../src/index.js';

describe('P3 colour tool option schemas', () => {
  it('keeps T41 defaults and bounded threshold values', () => {
    expect(T41ThresholdOptionsSchema.parse({})).toEqual({ mode: 'off', value: 128 });
    expect(T41ThresholdOptionsSchema.parse({ mode: 'fixed', value: 220 })).toEqual({
      mode: 'fixed',
      value: 220,
    });
    expect(T41ThresholdOptionsSchema.safeParse({ value: 256 }).success).toBe(false);
    expect(T41ThresholdOptionsSchema.safeParse({ mode: 'unknown' }).success).toBe(false);
  });

  it('keeps T43 operation controls within their browser budget', () => {
    expect(T43SharpenBlurOptionsSchema.parse({})).toEqual({
      operation: 'sharpen',
      amount: 100,
      radius: 1,
    });
    expect(
      T43SharpenBlurOptionsSchema.safeParse({ operation: 'gaussian', amount: 301, radius: 1 })
        .success,
    ).toBe(false);
    expect(T43SharpenBlurOptionsSchema.safeParse({ radius: 9 }).success).toBe(false);
  });

  it('accepts only explicit T47 colours and a normalized midpoint', () => {
    expect(T47DuotoneOptionsSchema.parse({})).toEqual({
      shadowColor: '#000000',
      highlightColor: '#ffffff',
      midpoint: 0.5,
    });
    expect(
      T47DuotoneOptionsSchema.safeParse({
        shadowColor: 'black',
        highlightColor: '#fff',
        midpoint: 0.5,
      }).success,
    ).toBe(false);
    expect(T47DuotoneOptionsSchema.safeParse({ midpoint: 1.1 }).success).toBe(false);
  });

  it('exposes metadata for generated controls for every route', () => {
    expect(Object.keys(t41ThresholdOptionDescriptions)).toEqual(['t41.mode', 't41.value']);
    expect(Object.keys(t43SharpenBlurOptionDescriptions)).toEqual([
      't43.operation',
      't43.amount',
      't43.radius',
    ]);
    expect(Object.keys(t47DuotoneOptionDescriptions)).toEqual([
      't47.shadowColor',
      't47.highlightColor',
      't47.midpoint',
    ]);
  });
});
