import { describe, expect, it } from 'vitest';

import { resolveIccProfile, synthesizeIccProfile } from '../src/index.js';

describe('ICC profile synthesis', () => {
  it.each(['srgb', 'display-p3', 'adobe-rgb-compatible', 'gray'] as const)(
    'generates a structurally valid %s profile',
    (kind) => {
      const profile = synthesizeIccProfile(kind);
      const view = new DataView(profile.buffer);
      expect(view.getUint32(0)).toBe(profile.length);
      expect(new TextDecoder().decode(profile.subarray(36, 40))).toBe('acsp');
      const count = view.getUint32(128);
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const offset = view.getUint32(136 + index * 12);
        const size = view.getUint32(140 + index * 12);
        expect(offset + size).toBeLessThanOrEqual(profile.length);
      }
    },
  );

  it('preserves an embedded profile verbatim unless strip or synthesis is requested', () => {
    const embedded = new Uint8Array([1, 2, 3]);
    expect(resolveIccProfile(embedded, 'preserve')).toBe(embedded);
    expect(resolveIccProfile(embedded, 'strip')).toBeUndefined();
    expect(resolveIccProfile(embedded, 'synthesize')).not.toBe(embedded);
  });
});
