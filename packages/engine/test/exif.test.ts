import { describe, expect, it } from 'vitest';

import {
  editExifCopyright,
  readExifAllIfds,
  readExifGps,
  readExifIfd0,
  readExifMakerNote,
  stripExifExceptOrientationCopyright,
  stripExifGps,
  stripExifMakerNotes,
} from '../src/index.js';

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
  it('enumerates every entry across linked IFDs with typed values', () => {
    const bytes = tiff();
    const view = new DataView(bytes.buffer);
    view.setUint32(34, 40, true);
    view.setUint16(40, 1, true);
    view.setUint16(42, 0x010f, true);
    view.setUint16(44, 2, true);
    view.setUint32(46, 4, true);
    bytes.set([65, 67, 77, 0], 50);
    expect(readExifAllIfds(bytes)).toEqual([
      { ifdOffset: 8, tag: 0x0112, name: 'orientation', type: 3, count: 1, value: '6' },
      { ifdOffset: 8, tag: 0x8298, name: 'copyright', type: 2, count: 4, value: 'CC0' },
      { ifdOffset: 40, tag: 0x010f, name: 'make', type: 2, count: 4, value: 'ACM' },
    ]);
  });
  it('refuses bad TIFF headers and offsets', () => {
    expect(() => readExifIfd0(new Uint8Array())).toThrow('truncated');
    const invalid = tiff();
    new DataView(invalid.buffer).setUint32(4, 1000, true);
    expect(() => readExifIfd0(invalid)).toThrow('outside');
  });

  it('edits an existing copyright field without relocating EXIF data', () => {
    const source = tiff();
    const edited = editExifCopyright(source, 'Me');
    expect(readExifIfd0(edited)).toContainEqual({
      tag: 0x8298,
      name: 'copyright',
      value: 'Me',
    });
    expect(edited.subarray(0, 26)).toEqual(source.subarray(0, 26));
    expect(source.subarray(30, 34)).toEqual(new Uint8Array([67, 67, 48, 0]));
    expect(() => editExifCopyright(source, 'This does not fit')).toThrow('metadata rebuild');
    expect(() => editExifCopyright(source, 'M\u00e9')).toThrow('ASCII');
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

  it('reports a bounded opaque MakerNote without interpreting proprietary bytes', () => {
    const bytes = new Uint8Array(80);
    const view = new DataView(bytes.buffer);
    bytes.set([0x49, 0x49, 42, 0]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 0x8769, true);
    view.setUint16(12, 4, true);
    view.setUint32(14, 1, true);
    view.setUint32(18, 32, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 0x927c, true);
    view.setUint16(36, 7, true);
    view.setUint32(38, 5, true);
    view.setUint32(42, 64, true);
    bytes.set([0xde, 0xad, 0xbe, 0xef, 1], 64);
    expect(readExifMakerNote(bytes)).toEqual({ byteLength: 5, previewHex: 'deadbeef01' });
    const stripped = stripExifMakerNotes(bytes);
    expect(readExifMakerNote(stripped)).toBeUndefined();
    expect(stripped.subarray(64, 69)).toEqual(new Uint8Array(5));
    expect(stripped.subarray(0, 34)).toEqual(bytes.subarray(0, 34));
  });

  it('keeps only Orientation and Copyright while wiping other entry payloads', () => {
    const bytes = new Uint8Array(80);
    const view = new DataView(bytes.buffer);
    bytes.set([0x49, 0x49, 42, 0]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 3, true);
    const entries = [
      [0x0112, 3, 1, 6],
      [0x8298, 2, 5, 60],
      [0x0131, 2, 8, 68],
    ] as const;
    entries.forEach(([tag, type, count, value], index) => {
      const offset = 10 + index * 12;
      view.setUint16(offset, tag, true);
      view.setUint16(offset + 2, type, true);
      view.setUint32(offset + 4, count, true);
      if (type === 3 && count === 1) view.setUint16(offset + 8, value, true);
      else view.setUint32(offset + 8, value, true);
    });
    bytes.set(new TextEncoder().encode('Mine\0'), 60);
    bytes.set(new TextEncoder().encode('Tooling\0'), 68);
    const stripped = stripExifExceptOrientationCopyright(bytes);
    expect(readExifAllIfds(stripped).map(({ name, value }) => ({ name, value }))).toEqual([
      { name: 'orientation', value: '6' },
      { name: 'copyright', value: 'Mine' },
    ]);
    expect(stripped.subarray(68, 76)).toEqual(new Uint8Array(8));
  });

  it('destructively wipes a GPS IFD, its pointer, and referenced coordinate values', () => {
    const bytes = new Uint8Array(96);
    const view = new DataView(bytes.buffer);
    bytes.set([0x49, 0x49, 42, 0]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 0x8825, true);
    view.setUint16(12, 4, true);
    view.setUint32(14, 1, true);
    view.setUint32(18, 32, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 2, true);
    view.setUint16(36, 5, true);
    view.setUint32(38, 3, true);
    view.setUint32(42, 64, true);
    bytes.fill(0xaa, 64, 88);
    const stripped = stripExifGps(bytes);
    expect(stripped.subarray(10, 22)).toEqual(new Uint8Array(12));
    expect(stripped.subarray(32, 50)).toEqual(new Uint8Array(18));
    expect(stripped.subarray(64, 88)).toEqual(new Uint8Array(24));
    expect(bytes[64]).toBe(0xaa);
  });
});
