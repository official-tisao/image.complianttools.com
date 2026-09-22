import { describe, expect, it } from 'vitest';

import {
  isT79GeneratorErrorKind,
  T79GeneratorError,
  T79GeneratorErrorRemedies,
  T79GeneratorOptionsSchema,
} from '../src/schemas/procedural-generator.js';

describe('T79 procedural generator schema and typed errors', () => {
  it('supplies deterministic default controls and rejects extra input', () => {
    expect(T79GeneratorOptionsSchema.parse({})).toEqual({
      width: 256,
      height: 256,
      seed: 42,
      mode: 'fbm',
    });
    expect(T79GeneratorOptionsSchema.safeParse({ label: 'ignored' }).success).toBe(false);
  });

  it.each([
    [{ width: 15 }, 'minimum width'],
    [{ width: 513 }, 'maximum width'],
    [{ height: 15 }, 'minimum height'],
    [{ height: 513 }, 'maximum height'],
    [{ width: 16.5 }, 'fractional width'],
    [{ seed: 2_147_483_648 }, 'seed overflow'],
    [{ seed: -2_147_483_649 }, 'seed underflow'],
    [{ seed: Number.NaN }, 'NaN seed'],
    [{ mode: 'unknown' }, 'unknown mode'],
  ])('rejects invalid options (%s)', (candidate) => {
    expect(T79GeneratorOptionsSchema.safeParse(candidate).success).toBe(false);
  });

  it('exposes each typed failure with an actionable remedy', () => {
    for (const [kind, remedy] of Object.entries(T79GeneratorErrorRemedies)) {
      expect(isT79GeneratorErrorKind(kind)).toBe(true);
      expect(remedy.length).toBeGreaterThan(12);
      const error = new T79GeneratorError(kind as keyof typeof T79GeneratorErrorRemedies);
      expect(error.name).toBe('T79GeneratorError');
      expect(error.kind).toBe(kind);
      expect(error.remedy).toBe(remedy);
    }
    expect(isT79GeneratorErrorKind('unexpected')).toBe(false);
    expect(isT79GeneratorErrorKind(undefined)).toBe(false);
  });
});
