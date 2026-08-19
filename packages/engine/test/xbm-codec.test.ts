import { describe, expect, it } from 'vitest';

import { decodeXbm } from '../src/index.js';

describe('XBM codec', () => {
  it('decodes LSB-first bitmap source data', () => {
    const source =
      '#define demo_width 3\n#define demo_height 1\nstatic unsigned char demo_bits[] = { 0x05 };';
    expect(decodeXbm(new TextEncoder().encode(source)).frames[0].data).toEqual(
      new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]),
    );
  });

  it('rejects missing declarations and payloads', () => {
    expect(() => decodeXbm(new TextEncoder().encode('#define no_width 1'))).toThrow();
    expect(() =>
      decodeXbm(new TextEncoder().encode('#define x_width 9\n#define x_height 1\n{}')),
    ).toThrow('Truncated');
  });
});
