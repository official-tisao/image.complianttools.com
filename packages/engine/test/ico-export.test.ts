import { describe, expect, it } from 'vitest';

import { createRaster, decodeCur, decodeIco, encodeCur, encodeIco } from '../src/index.js';

describe('ICO exporter', () => {
  it('writes a one-image 32-bit ICO with an alpha AND mask', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([255, 0, 0, 0]));
    const bytes = new Uint8Array(encodeIco(image));
    const view = new DataView(bytes.buffer);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([
      0, 1, 1,
    ]);
    expect([bytes[6], bytes[7], view.getUint16(12, true)]).toEqual([1, 1, 32]);
    expect(bytes[22 + 40 + 4]).toBe(0x80);
  });

  it('rejects icon dimensions outside the ICO range', () => {
    expect(() => encodeIco(createRaster(257, 1))).toThrow('between 1 and 256');
  });

  it('round-trips its own 32-bit BMP-backed icon payload', () => {
    const image = createRaster(2, 1, new Uint8ClampedArray([12, 34, 56, 255, 78, 90, 123, 0]));
    expect(decodeIco(encodeIco(image)).frames[0].data).toEqual(image.frames[0].data);
  });

  it('decodes the bitmap payload of a cursor without treating hotspots as planes', () => {
    const bytes = new Uint8Array(
      encodeIco(createRaster(1, 1, new Uint8ClampedArray([1, 2, 3, 255]))),
    );
    const view = new DataView(bytes.buffer);
    view.setUint16(2, 2, true);
    view.setUint16(10, 7, true);
    view.setUint16(12, 9, true);
    expect(decodeCur(bytes).frames[0].data).toEqual(new Uint8ClampedArray([1, 2, 3, 255]));
  });

  it('writes a cursor with its hotspot in the CUR directory fields', () => {
    const image = createRaster(2, 2, new Uint8ClampedArray(16).fill(255));
    const bytes = new Uint8Array(encodeCur(image, { x: 1, y: 0 }));
    const view = new DataView(bytes.buffer);
    expect([view.getUint16(2, true), view.getUint16(10, true), view.getUint16(12, true)]).toEqual([
      2, 1, 0,
    ]);
    expect(decodeCur(bytes).frames[0].data).toEqual(image.frames[0].data);
  });

  it('rejects cursor hotspots outside the image', () => {
    expect(() => encodeCur(createRaster(1, 1), { x: 1 })).toThrow('hotspot');
  });
});
