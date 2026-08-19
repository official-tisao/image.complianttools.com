import { describe, expect, it } from 'vitest';

import { resolveIccProfile, synthesizeIccProfile } from '../src/index.js';

describe('ICC profile synthesis', () => {
  it.each(
    (['srgb', 'display-p3', 'adobe-rgb-compatible', 'gray'] as const).flatMap((kind) =>
      ([2, 4] as const).map((version) => [kind, version] as const),
    ),
  )('generates a structurally valid %s v%s profile', (kind, version) => {
    const profile = synthesizeIccProfile(kind, version);
    const view = new DataView(profile.buffer);
    expect(view.getUint32(0)).toBe(profile.length);
    expect(view.getUint32(8)).toBe(version === 2 ? 0x02100000 : 0x04300000);
    expect(new TextDecoder().decode(profile.subarray(36, 40))).toBe('acsp');
    const count = view.getUint32(128);
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const offset = view.getUint32(136 + index * 12);
      const size = view.getUint32(140 + index * 12);
      expect(offset + size).toBeLessThanOrEqual(profile.length);
    }
  });

  it('preserves an embedded profile verbatim unless strip or synthesis is requested', () => {
    const embedded = new Uint8Array([1, 2, 3]);
    expect(resolveIccProfile(embedded, 'preserve')).toBe(embedded);
    expect(resolveIccProfile(embedded, 'strip')).toBeUndefined();
    expect(resolveIccProfile(embedded, 'synthesize')).not.toBe(embedded);
    expect(
      new DataView(resolveIccProfile(undefined, 'synthesize', 'gray', 2)!.buffer).getUint32(8),
    ).toBe(0x02100000);
  });
});
