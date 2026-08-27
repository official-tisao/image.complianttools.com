import { describe, expect, it } from 'vitest';
import { createRaster, decodeTga, encodeTga, rasterEquals } from '../src/index.js';
describe('P2 TGA codec', () => {
  it('round-trips RGBA pixels', () => {
    const image = createRaster(1, 2, Uint8ClampedArray.from([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(rasterEquals(decodeTga(encodeTga(image)), image)).toBe(true);
  });

  it('decodes RLE true-colour packets and rejects an oversized packet', () => {
    const rle = new Uint8Array(18 + 4);
    rle[2] = 10;
    rle[12] = 2;
    rle[14] = 1;
    rle[16] = 24;
    rle[17] = 0x20;
    rle.set([0x81, 3, 2, 1], 18);
    expect(decodeTga(rle).frames[0].data).toEqual(
      new Uint8ClampedArray([1, 2, 3, 255, 1, 2, 3, 255]),
    );
    rle[18] = 0x82;
    expect(() => decodeTga(rle)).toThrow('exceeds');
  });
});
