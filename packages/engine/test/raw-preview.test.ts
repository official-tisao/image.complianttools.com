import { describe, expect, it } from 'vitest';

import { extractRawCameraPreview } from '../src/index.js';

function littleEndianPreviewTiff(): Uint8Array {
  const bytes = new Uint8Array(80);
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
  view.setUint32(30, 4, true);
  bytes.set([0xff, 0xd8, 0xff, 0xd9], 64);
  return bytes;
}

describe('RAW Stage 1 camera preview extraction', () => {
  it('extracts and labels an embedded JPEG preview from a TIFF IFD', () => {
    expect(extractRawCameraPreview(littleEndianPreviewTiff())).toEqual({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      label: 'camera preview',
    });
  });

  it('rejects malformed and preview-free files without attempting a RAW develop', () => {
    expect(() => extractRawCameraPreview(new Uint8Array())).toThrow('too short');
    const withoutPreview = littleEndianPreviewTiff();
    withoutPreview[64] = 0;
    expect(() => extractRawCameraPreview(withoutPreview)).toThrow('No embedded JPEG');
  });
});
