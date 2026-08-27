import { describe, expect, it } from 'vitest';

import { createRaster, optimizeJpegLossless, stripJpegMetadataMarkers } from '../src/index.js';

function jpegWithMetadata(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xe1, 0, 6, 3, 4, 5, 6, 0xff, 0xee, 0, 4, 7, 8, 0xff,
    0xfe, 0, 5, 9, 10, 11, 0xff, 0xda, 0, 2, 12, 13, 0xff, 0xd9,
  ]);
}

describe('lossless JPEG marker optimization', () => {
  it('removes metadata while preserving JFIF, Adobe, and scan bytes', () => {
    expect([...stripJpegMetadataMarkers(jpegWithMetadata())]).toEqual([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xee, 0, 4, 7, 8, 0xff, 0xda, 0, 2, 12, 13, 0xff,
      0xd9,
    ]);
  });

  it('returns stripped bytes only when independent pixel verification passes', async () => {
    const raster = createRaster(1, 1, new Uint8ClampedArray([1, 2, 3, 255]));
    const accepted = await optimizeJpegLossless(jpegWithMetadata(), async () => raster);
    expect(accepted.changed).toBe(true);
    expect(accepted.optimizedBytes).toBeLessThan(accepted.originalBytes);
    let calls = 0;
    const rejected = await optimizeJpegLossless(jpegWithMetadata(), async () => {
      calls += 1;
      return createRaster(1, 1, new Uint8ClampedArray([calls, 2, 3, 255]));
    });
    expect(rejected.changed).toBe(false);
    expect(new Uint8Array(rejected.bytes)).toEqual(jpegWithMetadata());
  });

  it('rejects malformed marker lengths without scanning out of bounds', () => {
    expect(() => stripJpegMetadataMarkers(new Uint8Array())).toThrow('start-of-image');
    expect(() =>
      stripJpegMetadataMarkers(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])),
    ).toThrow('invalid length');
  });
});
