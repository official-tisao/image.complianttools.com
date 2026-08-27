import { describe, expect, it } from 'vitest';

import { decodeWithTypedErrors, decodeXcf } from '../src/index.js';

function xcfFixture(compression: 0 | 1 = 0): Uint8Array {
  const topTile =
    compression === 0
      ? new Uint8Array([255, 0, 0, 128, 0, 0, 0, 0])
      : new Uint8Array([254, 255, 0, 1, 0, 1, 0, 254, 128, 0]);
  const bottomTile =
    compression === 0
      ? new Uint8Array([0, 0, 255, 0, 0, 255])
      : new Uint8Array([1, 0, 1, 0, 1, 255]);
  const topTileOffset = 307;
  const bottomTileOffset = topTileOffset + topTile.length;
  const bytes = new Uint8Array(bottomTileOffset + bottomTile.length);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('gimp xcf file'));
  bytes[13] = 0;
  view.setUint32(14, 2);
  view.setUint32(18, 1);
  view.setUint32(22, 0);
  view.setUint32(26, 17);
  view.setUint32(30, 1);
  bytes[34] = compression;
  view.setUint32(35, 0);
  view.setUint32(39, 0);
  view.setUint32(43, 59);
  view.setUint32(47, 147);
  view.setUint32(51, 0);
  view.setUint32(55, 0);

  const layer = (offset: number, name: string, type: 0 | 1, hierarchy: number) => {
    view.setUint32(offset, 2);
    view.setUint32(offset + 4, 1);
    view.setUint32(offset + 8, type);
    view.setUint32(offset + 12, 4);
    bytes.set(new TextEncoder().encode(`${name}\0`), offset + 16);
    let property = offset + 20;
    view.setUint32(property, 15);
    view.setUint32(property + 4, 8);
    property += 16;
    view.setUint32(property, 6);
    view.setUint32(property + 4, 4);
    view.setUint32(property + 8, 255);
    property += 12;
    view.setUint32(property, 8);
    view.setUint32(property + 4, 4);
    view.setUint32(property + 8, 1);
    property += 12;
    view.setUint32(property, 7);
    view.setUint32(property + 4, 4);
    view.setUint32(property + 8, 0);
    property += 12;
    view.setUint32(property, 0);
    view.setUint32(property + 4, 0);
    view.setUint32(property + 8, hierarchy);
    view.setUint32(property + 12, 0);
  };
  layer(59, 'Top', 1, 235);
  layer(147, 'Bot', 0, 255);

  const hierarchy = (offset: number, bpp: number, level: number) => {
    view.setUint32(offset, 2);
    view.setUint32(offset + 4, 1);
    view.setUint32(offset + 8, bpp);
    view.setUint32(offset + 12, level);
    view.setUint32(offset + 16, 0);
  };
  hierarchy(235, 4, 275);
  hierarchy(255, 3, 291);
  const level = (offset: number, tile: number) => {
    view.setUint32(offset, 2);
    view.setUint32(offset + 4, 1);
    view.setUint32(offset + 8, tile);
    view.setUint32(offset + 12, 0);
  };
  level(275, topTileOffset);
  level(291, bottomTileOffset);
  bytes.set(topTile, topTileOffset);
  bytes.set(bottomTile, bottomTileOffset);
  return bytes;
}

describe('XCF composite reader', () => {
  for (const compression of [0, 1] as const)
    it(`reads named layers and composites compression mode ${compression}`, () => {
      const decoded = decodeXcf(xcfFixture(compression));
      expect(decoded.layers.map((layer) => layer.name)).toEqual(['Top', 'Bot']);
      expect(decoded.layers[0]?.image.frames[0].data).toEqual(
        new Uint8ClampedArray([255, 0, 0, 128, 0, 0, 0, 0]),
      );
      expect(decoded.image.frames[0].data).toEqual(
        new Uint8ClampedArray([128, 0, 127, 255, 0, 0, 255, 255]),
      );
    });

  it('refuses unsupported blend modes instead of flattening inaccurately', async () => {
    const bytes = xcfFixture();
    new DataView(bytes.buffer).setUint32(127, 1);
    await expect(decodeWithTypedErrors('xcf', () => decodeXcf(bytes))).rejects.toMatchObject({
      kind: 'decode-failed',
      format: 'xcf',
      detail: expect.stringContaining('unsupported blend mode'),
      remedy: expect.any(String),
    });
  });

  it('rejects invalid versions and hostile tile offsets', () => {
    const version = xcfFixture();
    version.set(new TextEncoder().encode('v013'), 9);
    expect(() => decodeXcf(version)).toThrow('versions 0 through 3');
    const offset = xcfFixture();
    new DataView(offset.buffer).setUint32(283, 0xfffffff0);
    expect(() => decodeXcf(offset)).toThrow('tile range is invalid');
  });
});
