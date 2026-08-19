import { describe, expect, it } from 'vitest';

import { createRaster, decodePnm, encodePpm, rasterEquals } from '../src/index.js';

describe('PNM codec', () => {
  it('round-trips an RGB raster as ASCII PPM', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([255, 0, 20, 255, 10, 128, 255, 255]));
    expect(rasterEquals(decodePnm(encodePpm(image)), image)).toBe(true);
  });

  it('decodes PBM and rejects truncated input', () => {
    expect(decodePnm(new TextEncoder().encode('P1\n2 1\n0 1').buffer).frames[0].data).toEqual(
      new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
    );
    expect(() => decodePnm(new TextEncoder().encode('P3\n2 1\n255\n1 2').buffer)).toThrow(
      'Truncated',
    );
  });

  it('decodes binary PBM, PGM, and PPM payloads', () => {
    expect(
      decodePnm(new Uint8Array([...new TextEncoder().encode('P4\n3 1\n'), 0b01000000])).frames[0]
        .data,
    ).toEqual(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]));
    expect(
      decodePnm(new Uint8Array([...new TextEncoder().encode('P5\n1 1\n255\n'), 50])).frames[0]
        .data[0],
    ).toBe(50);
    expect(
      decodePnm(new Uint8Array([...new TextEncoder().encode('P6\n1 1\n255\n'), 1, 2, 3])).frames[0]
        .data,
    ).toEqual(new Uint8ClampedArray([1, 2, 3, 255]));
  });

  it('decodes PAM RGB alpha and rejects incomplete payloads', () => {
    const header = new TextEncoder().encode(
      'P7\nWIDTH 1\nHEIGHT 1\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n',
    );
    const pam = new Uint8Array([...header, 10, 20, 30, 40]);
    expect(decodePnm(pam).frames[0].data).toEqual(new Uint8ClampedArray([10, 20, 30, 40]));
    expect(() => decodePnm(pam.subarray(0, -1))).toThrow('Truncated');
  });
});
