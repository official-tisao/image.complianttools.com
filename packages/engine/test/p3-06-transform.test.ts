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
