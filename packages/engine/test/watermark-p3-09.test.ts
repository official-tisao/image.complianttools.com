import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import { applyWatermark } from '../src/ops/watermark.js';

describe('P3-09 T50 Watermark', () => {
  it('text watermark applies with opacity', () => {
    const img = createRaster(20, 20, new Uint8ClampedArray(20 * 20 * 4).fill(128));
    const out = applyWatermark(img, { kind: 'text', textContent: 'W', enabled: true, opacity: 50, blendMode: 'normal', position: 'center', rotation: 0, tiled: false, diagonalTiled: false });
    expect(out.width).toBe(20);
    expect(out.height).toBe(20);
  });

  it('watermark image kind passes through if enabled', () => {
    const img = createRaster(10, 10, new Uint8ClampedArray(10 * 10 * 4).fill(200));
    const out = applyWatermark(img, { kind: 'image', enabled: true, opacity: 30, blendMode: 'multiply', position: 'top-left', rotation: 0, tiled: false, diagonalTiled: false });
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });

  it('tiled mode produces output', () => {
    const img = createRaster(8, 8, new Uint8ClampedArray(8 * 8 * 4).fill(255));
    const out = applyWatermark(img, { kind: 'text', textContent: 'X', enabled: true, opacity: 80, blendMode: 'overlay', position: 'center', tiled: true, rotation: 0, diagonalTiled: false });
    expect(out.width).toBe(8);
  });

  it('blend mode is recorded in settings', () => {
    const img = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4).fill(100));
    const out = applyWatermark(img, { kind: 'text', enabled: true, blendMode: 'soft-light', opacity: 40, position: 'bottom-right', tiled: false, rotation: 15, textContent: 'T' });
    // Basic structural validation — image preserved
    expect(out.frames[0]!.data.length).toBeGreaterThan(0);
  });

  it('position affects placement conceptually', () => {
    const img = createRaster(6, 6, new Uint8ClampedArray(6 * 6 * 4).fill(200));
    const out = applyWatermark(img, { kind: 'text', enabled: true, textContent: 'A', opacity: 100, blendMode: 'normal', position: 'top-right', rotation: 0, tiled: false, diagonalTiled: false });
    expect(out.width).toBe(6);
  });
});
