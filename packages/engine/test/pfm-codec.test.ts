import { describe, expect, it } from 'vitest';

import { createRaster, decodePfm, encodePfm } from '../src/index.js';

function pfmFixture(): Uint8Array {
  const header = new TextEncoder().encode('PF\n1 2\n-1.0\n');
  const pixels = new Uint8Array(header.length + 24);
  pixels.set(header);
  const view = new DataView(pixels.buffer, header.length);
  // Bottom pixel then top pixel, as required by PFM.
  [0, 1, 0, 1, 0, 0].forEach((value, index) => view.setFloat32(index * 4, value, true));
  return pixels;
}

describe('PFM codec', () => {
  it('decodes little-endian floating RGB data and reverses PFM row order', () => {
    expect(decodePfm(pfmFixture()).frames[0].data).toEqual(
      new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
    );
  });

  it('refuses malformed dimensions, non-finite samples, and truncated payloads', () => {
    expect(() => decodePfm(new TextEncoder().encode('PF\n0 1\n-1\n'))).toThrow('malformed');
    expect(() => decodePfm(pfmFixture().subarray(0, -1))).toThrow('Truncated');
    const nonFinite = pfmFixture();
    new DataView(nonFinite.buffer, nonFinite.byteLength - 4).setFloat32(0, Number.NaN, true);
    expect(() => decodePfm(nonFinite)).toThrow('finite');
  });

  it('round-trips an RGB raster through little-endian PFM', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([12, 34, 56, 255]));
    expect(decodePfm(encodePfm(image)).frames[0].data).toEqual(image.frames[0].data);
  });
});
