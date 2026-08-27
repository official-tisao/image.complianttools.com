import { describe, expect, it } from 'vitest';

import { createRaster, decodeXbm, decodeXpm, encodeXbm, encodeXpm } from '../src/index.js';

describe('XBM codec', () => {
  it('decodes LSB-first bitmap source data', () => {
    const source =
      '#define demo_width 3\n#define demo_height 1\nstatic unsigned char demo_bits[] = { 0x05 };';
    expect(decodeXbm(new TextEncoder().encode(source)).frames[0].data).toEqual(
      new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]),
    );
  });

  it('encodes an LSB-first XBM source that round-trips', () => {
    const image = createRaster(
      3,
      1,
      new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]),
    );
    const source = new TextDecoder().decode(encodeXbm(image, 'icon'));
    expect(source).toContain('#define icon_width 3');
    expect(source).toContain('0x05');
    expect(decodeXbm(encodeXbm(image)).frames[0].data).toEqual(image.frames[0].data);
  });

  it('rejects non-identifier XBM names', () => {
    expect(() => encodeXbm(createRaster(1, 1), 'not-valid')).toThrow('identifier');
  });

  it('rejects missing declarations and payloads', () => {
    expect(() => decodeXbm(new TextEncoder().encode('#define no_width 1'))).toThrow();
    expect(() =>
      decodeXbm(new TextEncoder().encode('#define x_width 9\n#define x_height 1\n{}')),
    ).toThrow('Truncated');
  });

  it('decodes transparent and hexadecimal XPM palette entries', () => {
    const source = [
      '/* XPM */',
      'static char *icon[] = {',
      '"2 1 2 1",',
      '"a c #ff0000",',
      '"b c None",',
      '"ab"',
      '};',
    ].join('\n');
    expect(decodeXpm(new TextEncoder().encode(source)).frames[0].data).toEqual(
      new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]),
    );
  });

  it('rejects unsafe and malformed XPM palette data', () => {
    expect(() => decodeXpm(new TextEncoder().encode('"1 1 1 1", "a c #000000"'))).toThrow(
      'Invalid or unsafe',
    );
    expect(() => decodeXpm(new TextEncoder().encode('"1 1 1 1", "a c #000000", "b"'))).toThrow(
      'undefined colour',
    );
  });

  it('encodes opaque and transparent XPM pixels losslessly', () => {
    const image = createRaster(
      3,
      1,
      new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0]),
    );
    expect(decodeXpm(encodeXpm(image, 'icon')).frames[0].data).toEqual(image.frames[0].data);
    expect(() => encodeXpm(createRaster(1, 1, new Uint8ClampedArray([1, 2, 3, 128])))).toThrow(
      'fully transparent or fully opaque',
    );
  });
});
