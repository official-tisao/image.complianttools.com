import { describe, expect, it } from 'vitest';

import {
  T61DuplicateOptionsSchema,
  t61DuplicateOptionDescriptions,
} from '../src/schemas/t61-duplicate-options.js';

describe('T61 duplicate finder options', () => {
  it('applies documented defaults', () => {
    expect(T61DuplicateOptionsSchema.parse({})).toEqual({
      averageDistance: 6,
      differenceDistance: 6,
      aspectRatioTolerance: 10,
    });
  });

  it('accepts the documented boundaries', () => {
    expect(
      T61DuplicateOptionsSchema.parse({
        averageDistance: 0,
        differenceDistance: 56,
        aspectRatioTolerance: 50,
      }),
    ).toEqual({ averageDistance: 0, differenceDistance: 56, aspectRatioTolerance: 50 });
  });

  it('rejects fractional, out-of-range, and unknown values', () => {
    for (const value of [
      { averageDistance: -1 },
      { averageDistance: 65 },
      { differenceDistance: 56.5 },
      { differenceDistance: 57 },
      { aspectRatioTolerance: -1 },
      { aspectRatioTolerance: 51 },
      { unexpected: 1 },
    ]) {
      expect(T61DuplicateOptionsSchema.safeParse(value).success).toBe(false);
    }
  });

  it('keeps generated controls aligned with schema defaults and ranges', () => {
    expect(Object.keys(t61DuplicateOptionDescriptions)).toEqual([
      't61.averageDistance',
      't61.differenceDistance',
      't61.aspectRatioTolerance',
    ]);
    for (const [path, description] of Object.entries(t61DuplicateOptionDescriptions)) {
      expect(description.control).toBe('slider');
      expect(description.defaultValue).toBe(
        T61DuplicateOptionsSchema.parse({})[
          path.slice(4) as keyof ReturnType<typeof T61DuplicateOptionsSchema.parse>
        ],
      );
    }
    expect(t61DuplicateOptionDescriptions['t61.averageDistance'].max).toBe(64);
    expect(t61DuplicateOptionDescriptions['t61.differenceDistance'].max).toBe(56);
    expect(t61DuplicateOptionDescriptions['t61.aspectRatioTolerance'].max).toBe(50);
  });
});
