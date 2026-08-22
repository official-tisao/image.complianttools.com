import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';

import {
  readContainerMetadata,
  stripGifMetadata,
  stripJpegMetadata,
  stripJpegGpsMetadata,
  stripJpegMakerNotes,
  stripJpegMetadataExceptOrientationCopyright,
  stripPngMetadata,
  stripWebpMetadata,
} from '../src/index.js';

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

function webpChunk(type: string, data: readonly number[]): number[] {
  return [
    ...[...type].map((value) => value.charCodeAt(0)),
    data.length,
    0,
    0,
    0,
    ...data,
    ...(data.length & 1 ? [0] : []),
  ];
}

function bmffBox(type: string, data: readonly number[]): number[] {
  const size = data.length + 8;
  return [
    size >>> 24,
    size >>> 16,
    size >>> 8,
    size,
    ...[...type].map((value) => value.charCodeAt(0)),
    ...data,
  ];
}

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

  it("reads international and compressed PNG text using each chunk's documented layout", () => {
    const itxt = new TextEncoder().encode('Title\0\0\0en\0Title\0Hello ✓');
    const ztext = [
      ...new TextEncoder().encode('Comment\0'),
      0,
      ...zlibSync(new TextEncoder().encode('compressed local text')),
    ];
    const image = new Uint8Array([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
      ...pngChunk('iTXt', [...itxt]),
      ...pngChunk('zTXt', ztext),
      ...pngChunk('IEND', []),
    ]);
    expect(readContainerMetadata(image).tags).toEqual([
      { namespace: 'PNG', name: 'Title', value: 'Hello ✓' },
      { namespace: 'PNG', name: 'Comment', value: 'compressed local text' },
    ]);
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

  it('strips GIF comments while retaining the image trailer and control blocks', () => {
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
      0x21,
      0xf9,
      4,
      0,
      0,
      0,
      0,
      0,
      0x3b,
    ]);
    const stripped = stripGifMetadata(gif);
    expect(readContainerMetadata(stripped).tags).toEqual([]);
    expect([...stripped]).toContain(0xf9);
    expect(stripped.at(-1)).toBe(0x3b);
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

  it('applies selective JPEG EXIF presets without changing retained fields', () => {
    const tiff = new Uint8Array(72);
    const view = new DataView(tiff.buffer);
    tiff.set([0x49, 0x49, 42, 0]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 2, true);
    view.setUint16(10, 0x0112, true);
    view.setUint16(12, 3, true);
    view.setUint32(14, 1, true);
    view.setUint16(18, 6, true);
    view.setUint16(22, 0x8769, true);
    view.setUint16(24, 4, true);
    view.setUint32(26, 1, true);
    view.setUint32(30, 40, true);
    view.setUint16(40, 1, true);
    view.setUint16(42, 0x927c, true);
    view.setUint16(44, 7, true);
    view.setUint32(46, 5, true);
    view.setUint32(50, 64, true);
    tiff.set([1, 2, 3, 4, 5], 64);
    const exif = new Uint8Array([...new TextEncoder().encode('Exif\0\0'), ...tiff]);
    const xmp = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0<x/>');
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      (exif.length + 2) >>> 8,
      (exif.length + 2) & 255,
      ...exif,
      0xff,
      0xe1,
      (xmp.length + 2) >>> 8,
      (xmp.length + 2) & 255,
      ...xmp,
      0xff,
      0xd9,
    ]);
    const noMakerNotes = stripJpegMakerNotes(jpeg);
    const noMakerTags = readContainerMetadata(noMakerNotes).tags;
    expect(noMakerTags).toContainEqual({ namespace: 'EXIF', name: 'orientation', value: '6' });
    expect(noMakerTags.some((tag) => tag.namespace === 'MakerNote')).toBe(false);
    expect(noMakerNotes).toHaveLength(jpeg.length);
    const retained = stripJpegMetadataExceptOrientationCopyright(jpeg);
    expect(readContainerMetadata(retained).tags).toEqual([
      { namespace: 'EXIF', name: 'orientation', value: '6' },
    ]);
    expect(new TextDecoder('latin1').decode(retained)).not.toContain('xap/1.0');
  });

  it('wipes JPEG EXIF GPS storage while preserving the container length and non-GPS bytes', () => {
    const tiff = new Uint8Array(96);
    const view = new DataView(tiff.buffer);
    tiff.set([0x49, 0x49, 42, 0]);
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
    tiff.fill(0xaa, 64, 88);
    const payload = new Uint8Array([...new TextEncoder().encode('Exif\0\0'), ...tiff]);
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      (payload.length + 2) >>> 8,
      (payload.length + 2) & 255,
      ...payload,
      0xff,
      0xd9,
    ]);
    const stripped = stripJpegGpsMetadata(jpeg);
    expect(stripped).toHaveLength(jpeg.length);
    expect(stripped.subarray(22, 34)).toEqual(new Uint8Array(12));
    expect(stripped.subarray(76, 100)).toEqual(new Uint8Array(24));
    expect(jpeg[76]).toBe(0xaa);
  });

  it('refuses GPS-only claims when opaque JPEG XMP may also contain location fields', () => {
    const prefix = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0');
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      0,
      prefix.length + 2,
      ...prefix,
      0xff,
      0xd9,
    ]);
    expect(() => stripJpegGpsMetadata(jpeg)).toThrow('Remove all metadata');
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

  it('reports an embedded JPEG XMP packet without interpreting its XML', () => {
    const prefix = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0');
    const packet = new TextEncoder().encode('<x:xmpmeta/>');
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      0,
      prefix.length + packet.length + 2,
      ...prefix,
      ...packet,
      0xff,
      0xd9,
    ]);
    expect(readContainerMetadata(jpeg).tags).toEqual([
      { namespace: 'XMP', name: 'packet', value: `${packet.length} bytes` },
    ]);
  });

  it('reports JPEG IPTC resource blocks and C2PA JUMBF packets without executing either', () => {
    const iptc = new TextEncoder().encode('Photoshop 3.0\0IPTC');
    const c2pa = new TextEncoder().encode('JUMBmanifest');
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xed,
      0,
      iptc.length + 2,
      ...iptc,
      0xff,
      0xeb,
      0,
      c2pa.length + 2,
      ...c2pa,
      0xff,
      0xd9,
    ]);
    expect(readContainerMetadata(jpeg).tags).toEqual([
      { namespace: 'IPTC', name: 'resource-blocks', value: '4 bytes' },
      { namespace: 'C2PA', name: 'jumbf', value: `${c2pa.length} bytes` },
    ]);
  });

  it('reads and strips WebP EXIF, XMP, and ICC chunks without changing image chunks', () => {
    const chunks = [
      ...webpChunk('VP8 ', [1, 2, 3]),
      ...webpChunk('EXIF', [4, 5]),
      ...webpChunk('XMP ', [6]),
      ...webpChunk('ICCP', [7, 8, 9]),
    ];
    const webp = new Uint8Array([
      ...new TextEncoder().encode('RIFF'),
      chunks.length + 4,
      0,
      0,
      0,
      ...new TextEncoder().encode('WEBP'),
      ...chunks,
    ]);
    expect(readContainerMetadata(webp)).toEqual({
      format: 'webp',
      tags: [
        { namespace: 'EXIF', name: 'embedded', value: '2 bytes' },
        { namespace: 'XMP', name: 'packet', value: '1 bytes' },
        { namespace: 'ICC', name: 'embedded', value: '3 bytes' },
      ],
    });
    const stripped = stripWebpMetadata(webp);
    expect(readContainerMetadata(stripped)).toEqual({ format: 'webp', tags: [] });
    expect(new TextDecoder('latin1').decode(stripped)).toContain('VP8 ');
  });

  it('reads AVIF/HEIF EXIF, XMP, ICC, and C2PA boxes with bounded nesting', () => {
    const metadata = [
      0,
      0,
      0,
      0, // meta full-box version/flags
      ...bmffBox('Exif', [1, 2]),
      ...bmffBox('xml ', [3, 4, 5]),
      ...bmffBox('colr', [...new TextEncoder().encode('prof'), 6, 7]),
      ...bmffBox('jumb', [8, 9, 10, 11]),
    ];
    const avif = new Uint8Array([
      ...bmffBox('ftyp', [
        ...new TextEncoder().encode('avif'),
        0,
        0,
        0,
        0,
        ...new TextEncoder().encode('mif1'),
      ]),
      ...bmffBox('meta', metadata),
    ]);
    expect(readContainerMetadata(avif)).toEqual({
      format: 'avif',
      tags: [
        { namespace: 'EXIF', name: 'embedded', value: '2 bytes' },
        { namespace: 'XMP', name: 'packet', value: '3 bytes' },
        { namespace: 'ICC', name: 'embedded', value: '2 bytes' },
        { namespace: 'C2PA', name: 'jumbf', value: '4 bytes' },
      ],
    });
    const heif = new Uint8Array([
      ...bmffBox('ftyp', [
        ...new TextEncoder().encode('heic'),
        0,
        0,
        0,
        0,
        ...new TextEncoder().encode('mif1'),
      ]),
      ...bmffBox('meta', metadata),
    ]);
    expect(readContainerMetadata(heif)).toMatchObject({ format: 'heif' });
  });

  it('rejects truncated and non-image ISO-BMFF metadata containers', () => {
    const invalidBrand = new Uint8Array(
      bmffBox('ftyp', [...new TextEncoder().encode('isom'), 0, 0, 0, 0]),
    );
    expect(() => readContainerMetadata(invalidBrand)).toThrow('AVIF or HEIF');
    const truncated = new Uint8Array(
      bmffBox('ftyp', [...new TextEncoder().encode('avif'), 0, 0, 0, 0]),
    );
    truncated[truncated.length - 1] = 0;
    truncated.set([0, 0, 0, 20], 0);
    expect(() => readContainerMetadata(truncated)).toThrow('truncated');
  });
});
