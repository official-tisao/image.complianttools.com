import { describe, expect, it } from 'vitest';

import { readContainerMetadata, stripJpegMetadata, stripPngMetadata } from '../src/index.js';

function pngChunk(type: string, data: readonly number[]): number[] {
  const length = data.length;
  return [
    length >>> 24,
    length >>> 16,
    length >>> 8,
    length,
    ...[...type].map((value) => value.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0,
  ];
}

const png = new Uint8Array([
  137,
  80,
  78,
  71,
  13,
  10,
  26,
  10,
  ...pngChunk(
    'tEXt',
    [...'Author\0Ada'].map((value) => value.charCodeAt(0)),
  ),
  ...pngChunk('IDAT', [1, 2, 3]),
  ...pngChunk('IEND', []),
]);

describe('container metadata', () => {
  it('reads PNG text and strips metadata without touching image chunks', () => {
    expect(readContainerMetadata(png)).toEqual({
      format: 'png',
      tags: [{ namespace: 'PNG', name: 'Author', value: 'Ada' }],
    });
    const stripped = stripPngMetadata(png);
    expect(readContainerMetadata(stripped)).toEqual({ format: 'png', tags: [] });
    expect([...stripped]).toContain(73);
  });

  it('reads GIF comment extensions and rejects malformed containers', () => {
    const gif = new Uint8Array([
      ...new TextEncoder().encode('GIF89a'),
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0x21,
      0xfe,
      2,
      79,
      75,
      0,
      0x3b,
    ]);
    expect(readContainerMetadata(gif).tags).toEqual([
      { namespace: 'GIF', name: 'comment', value: 'OK' },
    ]);
    expect(() => readContainerMetadata(new Uint8Array([0]))).toThrow('GIF metadata');
  });

  it('reads selected EXIF fields from a JPEG APP1 segment', () => {
    const tiff = new Uint8Array(26);
    const view = new DataView(tiff.buffer);
    tiff.set([0x49, 0x49, 42, 0]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 0x0112, true);
    view.setUint16(12, 3, true);
    view.setUint32(14, 1, true);
    view.setUint16(18, 6, true);
    const payload = new Uint8Array(6 + tiff.length);
    payload.set(new TextEncoder().encode('Exif\0\0'));
    payload.set(tiff, 6);
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      0,
      payload.length + 2,
      ...payload,
      0xff,
      0xd9,
    ]);
    expect(readContainerMetadata(jpeg)).toEqual({
      format: 'jpeg',
      tags: [{ namespace: 'EXIF', name: 'orientation', value: '6' }],
    });
  });

  it('removes JPEG APP metadata while preserving image markers', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0, 4, 1, 2, 0xff, 0xdb, 0, 3, 9, 0xff, 0xd9,
    ]);
    expect(stripJpegMetadata(jpeg)).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 3, 9, 0xff, 0xd9]),
    );
  });

  it('reads JFIF pixel density units and values', () => {
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0,
      16,
      ...new TextEncoder().encode('JFIF\0'),
      1,
      2,
      1,
      0,
      72,
      0,
      36,
      0,
      0,
      0xff,
      0xd9,
    ]);
    expect(readContainerMetadata(jpeg).tags).toEqual([
      { namespace: 'JFIF', name: 'density', value: '72×36 dpi' },
    ]);
  });
});
