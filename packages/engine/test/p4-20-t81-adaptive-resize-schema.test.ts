import { describe, expect, it } from 'vitest';

import {
  T81AdaptiveResizeOptionsSchema,
  t81AdaptiveResizeOptionDescriptions,
} from '../src/schemas/t81-adaptive-resize-options.js';

describe('T81 adaptive resize options', () => {
  it('applies bounded defaults', () => {
    expect(T81AdaptiveResizeOptionsSchema.parse({})).toEqual({
      width: 1,
      height: 1,
      protectEnabled: false,
    });
  });

  it('accepts UI boundaries and rejects invalid values', () => {
    expect(
      T81AdaptiveResizeOptionsSchema.parse({ width: 320, height: 320, protectEnabled: true }),
    ).toEqual({ width: 320, height: 320, protectEnabled: true });
    for (const value of [
      { width: -1 },
      { height: -1 },
      { height: 321 },
      { width: 1.5 },
      { protectEnabled: 'yes' },
      { unexpected: true },
    ]) {
      expect(T81AdaptiveResizeOptionsSchema.safeParse(value).success).toBe(false);
    }
  });

  it('keeps generated metadata aligned with the schema', () => {
    expect(Object.keys(t81AdaptiveResizeOptionDescriptions)).toEqual([
      't81.width',
      't81.height',
      't81.protectEnabled',
    ]);
    expect(t81AdaptiveResizeOptionDescriptions['t81.width'].defaultValue).toBe(1);
    expect(t81AdaptiveResizeOptionDescriptions['t81.height'].defaultValue).toBe(1);
    expect(t81AdaptiveResizeOptionDescriptions['t81.protectEnabled'].defaultValue).toBe(false);
  });
});
