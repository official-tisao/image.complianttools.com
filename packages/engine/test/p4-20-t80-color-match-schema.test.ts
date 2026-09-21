import { describe, expect, it } from 'vitest';

import {
  T80ColorMatchOptionsSchema,
  t80ColorMatchOptionDescriptions,
} from '../src/schemas/t80-color-match-options.js';

describe('T80 colour match options', () => {
  it('defaults to the existing Reinhard method', () => {
    expect(T80ColorMatchOptionsSchema.parse({})).toEqual({ method: 'reinhard' });
  });

  it('accepts both methods and rejects unknown values', () => {
    expect(T80ColorMatchOptionsSchema.parse({ method: 'histogram' })).toEqual({
      method: 'histogram',
    });
    expect(T80ColorMatchOptionsSchema.safeParse({ method: 'unknown' }).success).toBe(false);
    expect(T80ColorMatchOptionsSchema.safeParse({ unexpected: true }).success).toBe(false);
  });

  it('keeps generated metadata aligned with the schema', () => {
    const description = t80ColorMatchOptionDescriptions['t80.method'];
    expect(description.control).toBe('segmented');
    expect(description.options).toEqual(['reinhard', 'histogram']);
    expect(description.defaultValue).toBe(T80ColorMatchOptionsSchema.parse({}).method);
  });
});
