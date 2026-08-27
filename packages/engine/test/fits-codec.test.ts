import { describe, expect, it } from 'vitest';

import { createRaster, decodeFits, encodeFits } from '../src/index.js';

function card(value: string): string {
  return value.padEnd(80, ' ');
}

function fitsFixture(): Uint8Array {
  const header = [
    card('SIMPLE  =                    T'),
    card('BITPIX  =                    8'),
    card('NAXIS   =                    2'),
    card('NAXIS1  =                    2'),
    card('NAXIS2  =                    1'),
    card('END'),
  ].join('');
  const bytes = new Uint8Array(2882);
  bytes.set(new TextEncoder().encode(header));
  bytes.set([0, 255], 2880);
  return bytes;
}

describe('FITS codec', () => {
  it('decodes a primary 8-bit image into grayscale RGBA', () => {
    const image = decodeFits(fitsFixture());
    expect(image.colorSpace).toBe('gray');
    expect(image.frames[0].data).toEqual(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]));
  });

  it('writes a block-aligned grayscale FITS primary image', () => {
    const encoded = new Uint8Array(
      encodeFits(createRaster(2, 1, new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]))),
    );
    expect(encoded.byteLength % 2880).toBe(0);
    expect(new TextDecoder().decode(encoded.subarray(0, 80))).toContain('SIMPLE');
    expect(decodeFits(encoded).frames[0].data).toEqual(
      new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
    );
  });

  it('refuses malformed headers and truncated pixel payloads', () => {
    expect(() => decodeFits(new Uint8Array(80))).toThrow('Malformed');
    expect(() => decodeFits(fitsFixture().subarray(0, -1))).toThrow('Truncated');
  });
});
