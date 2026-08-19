import { describe, expect, it } from 'vitest';

import { readExifGps, readExifIfd0 } from '../src/index.js';

function tiff(): Uint8Array {
  const bytes = new Uint8Array(64);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 2, true);
  view.setUint16(10, 0x0112, true);
  view.setUint16(12, 3, true);
  view.setUint32(14, 1, true);
  view.setUint16(18, 6, true);
  view.setUint16(22, 0x8298, true);
  view.setUint16(24, 2, true);
  view.setUint32(26, 4, true);
  bytes.set([67, 67, 48, 0], 30);
  return bytes;
}

describe('EXIF IFD0 reader', () => {
  it('reads orientation and inline copyright values', () => {
    expect(readExifIfd0(tiff())).toEqual([
      { tag: 0x0112, name: 'orientation', value: 6 },
      { tag: 0x8298, name: 'copyright', value: 'CC0' },
    ]);
  });
  it('refuses bad TIFF headers and offsets', () => {
    expect(() => readExifIfd0(new Uint8Array())).toThrow('truncated');
    const invalid = tiff();
    new DataView(invalid.buffer).setUint32(4, 1000, true);
    expect(() => readExifIfd0(invalid)).toThrow('outside');
  });

  it('reads standard GPS coordinates as decimal values and a geo URI', () => {
    const bytes = new Uint8Array(200);
    const view = new DataView(bytes.buffer);
    bytes.set([0x49, 0x49, 42, 0]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 0x8825, true);
    view.setUint16(12, 4, true);
    view.setUint32(14, 1, true);
    view.setUint32(18, 32, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 1, true);
    view.setUint16(36, 2, true);
    view.setUint32(38, 2, true);
    bytes.set([78, 0], 42);
    view.setUint16(46, 2, true);
    view.setUint16(48, 5, true);
    view.setUint32(50, 3, true);
    view.setUint32(54, 128, true);
    view.setUint16(58, 3, true);
    view.setUint16(60, 2, true);
    view.setUint32(62, 2, true);
    bytes.set([87, 0], 66);
    view.setUint16(70, 4, true);
    view.setUint16(72, 5, true);
    view.setUint32(74, 3, true);
    view.setUint32(78, 152, true);
    [40, 1, 0, 1, 0, 1, 74, 1, 0, 1, 0, 1].forEach((value, index) =>
      view.setUint32(128 + index * 4, value, true),
    );
    expect(readExifGps(bytes)).toEqual({
      latitude: 40,
      longitude: -74,
      latitudeDms: '40° 0′ 0″ N',
      longitudeDms: '74° 0′ 0″ W',
      geoUri: 'geo:40,-74',
    });
  });
});
