import { describe, expect, it } from 'vitest';

import { decodePcx } from '../src/index.js';

function pcxFixture(): Uint8Array {
  const output = new Uint8Array(128 + 2 + 769);
  const view = new DataView(output.buffer);
  output.set([0x0a, 5, 1, 8]);
  view.setUint16(8, 1, true); // xmax, width 2
  view.setUint16(10, 0, true); // ymax, height 1
  output[65] = 1;
  view.setUint16(66, 2, true);
  output.set([1, 2], 128);
  output[130] = 12;
  output.set([255, 0, 0], 131 + 3);
  output.set([0, 255, 0], 131 + 6);
  return output;
}

describe('PCX codec', () => {
  it('decodes a paletted PCX row', () => {
    expect(decodePcx(pcxFixture()).frames[0].data).toEqual(
      new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
    );
  });

  it('rejects missing palettes and truncated RLE', () => {
    const missingPalette = pcxFixture();
    missingPalette[130] = 0;
    expect(() => decodePcx(missingPalette)).toThrow('palette');
    expect(() => decodePcx(pcxFixture().subarray(0, 129))).toThrow();
  });
});
