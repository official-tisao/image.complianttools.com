import { describe, expect, it } from 'vitest';

import {
  T60CompareOptionsSchema,
  t60CompareOptionDescriptions,
} from '../src/schemas/t60-compare-options.js';

describe('T60 comparison option schema', () => {
  it('preserves the default split view and neutral viewer settings', () => {
    expect(T60CompareOptionsSchema.parse({})).toEqual({
      mode: 'split',
      split: 50,
      opacity: 50,
      gain: 4,
    });
  });

  it('accepts the supported modes and boundary values', () => {
    expect(
      T60CompareOptionsSchema.parse({
        mode: 'difference',
        split: 0,
        opacity: 100,
        gain: 20,
      }),
    ).toEqual({ mode: 'difference', split: 0, opacity: 100, gain: 20 });
  });

  it.each([
    [{ mode: 'heatmap' }, 'unknown mode'],
    [{ split: -1 }, 'split below minimum'],
    [{ split: 101 }, 'split above maximum'],
    [{ split: 50.5 }, 'fractional split'],
    [{ opacity: -1 }, 'opacity below minimum'],
    [{ opacity: 101 }, 'opacity above maximum'],
    [{ gain: 0 }, 'gain below minimum'],
    [{ gain: 21 }, 'gain above maximum'],
    [{ gain: Number.NaN }, 'NaN gain'],
    [{ unsupported: true }, 'unknown option'],
  ])('rejects invalid options (%s)', (candidate) => {
    expect(T60CompareOptionsSchema.safeParse(candidate).success).toBe(false);
  });

  it('keeps generated controls aligned with schema defaults and enum values', () => {
    const defaults = T60CompareOptionsSchema.parse({});
    expect(Object.keys(t60CompareOptionDescriptions).sort()).toEqual(Object.keys(defaults).sort());
    expect(t60CompareOptionDescriptions.mode).toMatchObject({
      control: 'select',
      options: ['split', 'side', 'onion', 'difference', 'output'],
      defaultValue: defaults.mode,
    });
    expect(t60CompareOptionDescriptions.split).toMatchObject({
      control: 'slider',
      min: 0,
      max: 100,
      defaultValue: defaults.split,
    });
    expect(t60CompareOptionDescriptions.opacity.defaultValue).toBe(defaults.opacity);
    expect(t60CompareOptionDescriptions.gain.defaultValue).toBe(defaults.gain);
  });
});
