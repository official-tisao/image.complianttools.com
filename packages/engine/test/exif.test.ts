import { describe, expect, it } from 'vitest';

import { readExifIfd0 } from '../src/index.js';

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
});
