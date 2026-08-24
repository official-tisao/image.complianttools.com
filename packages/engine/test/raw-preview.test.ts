import { describe, expect, it } from 'vitest';

import { decodeWithTypedErrors, extractRawCameraPreview, isEngineError } from '../src/index.js';

function jpeg(width = 1, height = 1, padding = 0): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    ...new Array(padding).fill(0),
    0xff,
    0xd9,
  ]);
}

function littleEndianPreviewTiff(): Uint8Array {
  const preview = jpeg();
  const bytes = new Uint8Array(64 + preview.length);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 2, true);
  view.setUint16(10, 0x0201, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 64, true);
  view.setUint16(22, 0x0202, true);
  view.setUint16(24, 4, true);
  view.setUint32(26, 1, true);
  view.setUint32(30, preview.length, true);
  bytes.set(preview, 64);
  return bytes;
}

function subIfdPreviewTiff(): Uint8Array {
  const preview = jpeg();
  const bytes = new Uint8Array(80 + preview.length);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x014a, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 40, true);
  view.setUint16(40, 2, true);
  view.setUint16(42, 0x0201, true);
  view.setUint16(44, 4, true);
  view.setUint32(46, 1, true);
  view.setUint32(50, 80, true);
  view.setUint16(54, 0x0202, true);
  view.setUint16(56, 4, true);
  view.setUint32(58, 1, true);
  view.setUint32(62, preview.length, true);
  bytes.set(preview, 80);
  return bytes;
}

describe('RAW Stage 1 camera preview extraction', () => {
  it('extracts and labels an embedded JPEG preview from a TIFF IFD', () => {
    expect(extractRawCameraPreview(littleEndianPreviewTiff())).toEqual({
      bytes: jpeg(),
      label: 'camera preview',
    });
  });

  it('reuses the EXIF walker to find a preview in a TIFF SubIFD', () => {
    expect(extractRawCameraPreview(subIfdPreviewTiff())).toEqual({
      bytes: jpeg(),
      label: 'camera preview',
    });
  });

  it('rejects malformed and preview-free files without attempting a RAW develop', () => {
    expect(() => extractRawCameraPreview(new Uint8Array())).toThrow('too short');
    const withoutPreview = littleEndianPreviewTiff();
    withoutPreview[64] = 0;
    expect(() => extractRawCameraPreview(withoutPreview)).toThrow('No embedded JPEG');
  });

  it('finds the largest embedded JPEG in a non-TIFF vendor container', () => {
    const small = jpeg(16, 16);
    const large = jpeg(640, 480, 12);
    const container = new Uint8Array(96);
    container.set([0x46, 0x55, 0x4a, 0x49], 0); // representative opaque vendor header
    container.set(small, 8);
    container.set(large, 48);
    expect(extractRawCameraPreview(container)).toEqual({
      bytes: large,
      label: 'camera preview',
    });
  });

  it('does not mistake arbitrary SOI/EOI byte sequences for embedded previews', () => {
    expect(() =>
      extractRawCameraPreview(new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 0xff, 0xd9])),
    ).toThrow('No embedded JPEG');
  });

  it('normalizes missing-preview failures into a typed remediable error', async () => {
    try {
      await decodeWithTypedErrors('raw', () => extractRawCameraPreview(new Uint8Array(16)));
      throw new Error('RAW unexpectedly produced a preview.');
    } catch (error) {
      expect(isEngineError(error)).toBe(true);
      expect(error).toMatchObject({
        kind: 'decode-failed',
        format: 'raw',
        remedy: expect.any(String),
      });
    }
  });
});
