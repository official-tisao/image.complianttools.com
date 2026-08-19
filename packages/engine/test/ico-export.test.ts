import { describe, expect, it } from 'vitest';

import { createRaster, encodeIco } from '../src/index.js';

describe('ICO exporter', () => {
  it('writes a one-image 32-bit ICO with an alpha AND mask', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([255, 0, 0, 0]));
    const bytes = new Uint8Array(encodeIco(image));
    const view = new DataView(bytes.buffer);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([
      0, 1, 1,
    ]);
    expect([bytes[6], bytes[7], view.getUint16(12, true)]).toEqual([1, 1, 32]);
    expect(bytes[22 + 40 + 4]).toBe(0x80);
  });

  it('rejects icon dimensions outside the ICO range', () => {
    expect(() => encodeIco(createRaster(257, 1))).toThrow('between 1 and 256');
  });
});
