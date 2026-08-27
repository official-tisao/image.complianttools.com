import { describe, expect, it } from 'vitest';

import { decodeWindowsMetafile, decodeWithTypedErrors } from '../src/index.js';

function wmfFixture(): Uint8Array {
  const bytes = new Uint8Array(74);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x9ac6cdd7, true);
  view.setInt16(6, 0, true);
  view.setInt16(8, 0, true);
  view.setInt16(10, 100, true);
  view.setInt16(12, 50, true);
  view.setUint16(14, 1440, true);
  const header = 22;
  view.setUint16(header, 1, true);
  view.setUint16(header + 2, 9, true);
  view.setUint16(header + 4, 0x0300, true);
  view.setUint32(header + 6, 26, true);
  view.setUint32(header + 12, 5, true);
  let offset = 40;
  const point = (fn: number, x: number, y: number) => {
    view.setUint32(offset, 5, true);
    view.setUint16(offset + 4, fn, true);
    view.setInt16(offset + 6, y, true);
    view.setInt16(offset + 8, x, true);
    offset += 10;
  };
  point(0x0214, 10, 5);
  point(0x0213, 90, 45);
  view.setUint32(offset, 4, true);
  view.setUint16(offset + 4, 0x0102, true);
  offset += 8;
  view.setUint32(offset, 3, true);
  return bytes;
}

function emfFixture(): Uint8Array {
  const bytes = new Uint8Array(152);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1, true);
  view.setUint32(4, 88, true);
  view.setInt32(8, 0, true);
  view.setInt32(12, 0, true);
  view.setInt32(16, 100, true);
  view.setInt32(20, 50, true);
  view.setUint32(40, 0x464d4520, true);
  view.setUint32(48, bytes.length, true);
  view.setUint32(52, 5, true);
  let offset = 88;
  const point = (type: number, x: number, y: number) => {
    view.setUint32(offset, type, true);
    view.setUint32(offset + 4, 16, true);
    view.setInt32(offset + 8, x, true);
    view.setInt32(offset + 12, y, true);
    offset += 16;
  };
  point(27, 10, 5);
  point(54, 90, 45);
  view.setUint32(offset, 17, true);
  view.setUint32(offset + 4, 12, true);
  offset += 12;
  view.setUint32(offset, 14, true);
  view.setUint32(offset + 4, 20, true);
  return bytes;
}

describe('Windows metafile decoder', () => {
  it('renders WMF geometry and reports skipped records', () => {
    const decoded = decodeWindowsMetafile(wmfFixture());
    expect(decoded).toMatchObject({ format: 'wmf', width: 100, height: 50 });
    expect(decoded.svg).toContain('M10 5 L90 45');
    expect(decoded.warnings).toEqual(['Skipped 1 unsupported WMF record 0x0102.']);
  });

  it('renders EMF geometry and reports skipped records', () => {
    const decoded = decodeWindowsMetafile(emfFixture());
    expect(decoded).toMatchObject({ format: 'emf', width: 100, height: 50 });
    expect(decoded.svg).toContain('M10 5 L90 45');
    expect(decoded.warnings).toEqual(['Skipped 1 unsupported EMF record 0x0011.']);
  });

  it('normalizes malformed records into typed errors', async () => {
    const truncated = wmfFixture().subarray(0, 45);
    await expect(
      decodeWithTypedErrors('wmf', () => decodeWindowsMetafile(truncated)),
    ).rejects.toMatchObject({
      kind: 'decode-failed',
      format: 'wmf',
      remedy: expect.any(String),
    });
  });

  it('rejects invalid signatures and files with no supported geometry', () => {
    expect(() => decodeWindowsMetafile(new Uint8Array())).toThrow('header is truncated');
    const onlyHeader = emfFixture();
    new DataView(onlyHeader.buffer).setUint32(88, 14, true);
    expect(() => decodeWindowsMetafile(onlyHeader)).toThrow('no supported geometry');
  });
});
