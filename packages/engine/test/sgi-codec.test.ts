import { describe, expect, it } from 'vitest';

import { createRaster, decodeSgi, encodeSgi } from '../src/index.js';

function fixture(): Uint8Array {
  const bytes = new Uint8Array(515);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 474, false);
  bytes[3] = 1;
  view.setUint16(4, 3, false);
  view.setUint16(6, 1, false);
  view.setUint16(8, 1, false);
  view.setUint16(10, 3, false);
  bytes.set([3, 2, 1], 512);
  return bytes;
}

describe('SGI codec', () => {
  it('decodes planar RGB channels', () => {
    expect(decodeSgi(fixture()).frames[0].data).toEqual(new Uint8ClampedArray([3, 2, 1, 255]));
  });

  it('round-trips uncompressed RGB and RGBA SGI images', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([3, 2, 1, 7]));
    expect(decodeSgi(encodeSgi(image)).frames[0].data).toEqual(image.frames[0].data);
  });

  it('rejects dimensions outside the SGI header range', () => {
    expect(() => encodeSgi(createRaster(65_536, 1))).toThrow('65535');
  });

  it('refuses RLE and truncated data', () => {
    const rle = fixture();
    rle[2] = 1;
    expect(() => decodeSgi(rle)).toThrow('Unsupported');
    expect(() => decodeSgi(fixture().subarray(0, -1))).toThrow('truncated');
  });
});
