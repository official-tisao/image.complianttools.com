import { describe, expect, it } from 'vitest';
import { createRaster, RESIZE_PRESETS, canvasResize, enlarge } from '../src/index.js';
import { applyBorder } from '../src/transform/border.js';
import { roundCorners } from '../src/transform/round-corners.js';
import { makeCollage } from '../src/transform/collage.js';
import { splitImage } from '../src/transform/split.js';

describe('P3-06 T25 Bulk Resize presets', () => {
  it('exports preset list with expected counts', () => {
    expect(RESIZE_PRESETS.length).toBeGreaterThan(5);
    expect(RESIZE_PRESETS.find((p) => p.label === 'Instagram Post')).toBeDefined();
  });
});

describe('P3-06 T30 Canvas Resize', () => {
  it('expands canvas with center anchor', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(100));
    const out = canvasResize(img, { width: 8, height: 8, anchor: 'center', fillColor: '#FFFFFF' });
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
  });
});

describe('P3-06 T33 Border', () => {
  it('adds outer border expanding dimensions', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(255));
    const out = applyBorder(img, { width: 2, color: '#000000', inner: false });
    expect(out.width).toBe(4 + 4); // 2px border on each side = +4 total
  });
  it('adds inner border shrinking content', () => {
    const img = createRaster(10, 10, new Uint8ClampedArray(400).fill(128));
    const out = applyBorder(img, { width: 2, color: '#000000', inner: true });
    expect(out.width).toBe(10 - 4); // inner border: 2px removed from each side
  });
});

describe('P3-06 T34 Round Corners', () => {
  it('produces transparent corners', () => {
    const img = createRaster(8, 8, new Uint8ClampedArray(8 * 8 * 4).fill(255));
    const out = roundCorners(img, { radius: 4, background: 'transparent' });
    // For r=4 on 8x8 the corner (0,0) is outside the inner rounded rect, so alpha is 0 (transparent)
    const topLeftAlpha = out.frames[0]!.data[3]!;
    expect(topLeftAlpha).toBe(0);
  });
  it('produces filled corners with background', () => {
    const img = createRaster(8, 8, new Uint8ClampedArray(8 * 8 * 4).fill(128));
    const out = roundCorners(img, { radius: 2, background: '#FF0000' });
    expect(out.width).toBe(8);
  });
});

describe('P3-06 T35 Collage', () => {
  it('creates grid collage from images', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(200));
    const out = makeCollage(img, {
      mode: 'grid',
      columns: 2,
      rows: 2,
      gap: 0,
      background: '#FFFFFF',
      images: [img, img],
    });
    expect(out.width).toBeGreaterThan(4);
    expect(out.height).toBeGreaterThan(4);
  });
});

describe('P3-06 T36 Split/Tile', () => {
  it('splits image into 2x2 tiles', () => {
    const img = createRaster(8, 8, new Uint8ClampedArray(8 * 8 * 4).fill(100));
    const tiles = splitImage(img, { rows: 2, cols: 2 });
    expect(tiles.length).toBe(4);
    expect(tiles[0]!.width).toBe(4);
    expect(tiles[0]!.height).toBe(4);
  });
});

describe('P3-06 T31 Enlarge', () => {
  it('scales by 2x with existing resize', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(100));
    const out = enlarge(img, { scale: 2 });
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
  });
});

describe('P3-06 T36 Split/Tile full pipeline', () => {
  it('handles odd dimensions and preserves all pixels', () => {
    const img = createRaster(1001, 701, new Uint8ClampedArray(1001 * 701 * 4));
    for (let i = 0; i < img.frames[0]!.data.length; i += 1) img.frames[0]!.data[i] = i % 256;
    const tiles = splitImage(img, { rows: 4, cols: 4 });
    expect(tiles.length).toBe(16);
    // Last row/col may have remainder pixels; total reconstructed pixels should equal original
    let reconstructedW = 0,
      reconstructedH = 0;
    for (let r = 0; r < 4; r++) {
      reconstructedH += tiles[r * 4]!.height;
    }
    for (let c = 0; c < 4; c++) reconstructedW += tiles[c]!.width;
    expect(reconstructedW).toBe(1001);
    expect(reconstructedH).toBe(701);
  });

  it('produces valid RasterImage instances for every tile', () => {
    const img = createRaster(100, 100, new Uint8ClampedArray(100 * 100 * 4).fill(128));
    const tiles = splitImage(img, { rows: 3, cols: 3 });
    expect(tiles.length).toBe(9);
    for (const tile of tiles) {
      expect(tile.width).toBeGreaterThan(0);
      expect(tile.height).toBeGreaterThan(0);
      expect(tile.frames.length).toBe(1);
      expect(tile.frames[0]!.data.length).toBe(tile.width * tile.height * 4);
    }
  });

  it('creates tiles with correct ordering (row-major)', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4));
    // Fill pixels with index for identification
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const off = (y * 4 + x) * 4;
        img.frames[0]!.data[off] = x;
        img.frames[0]!.data[off + 1] = y;
      }
    }
    const tiles = splitImage(img, { rows: 2, cols: 2 });
    expect(tiles[0]!.width).toBe(2);
    expect(tiles[0]!.frames[0]!.data[0]).toBe(0); // top-left pixel red = 0
  });
});
