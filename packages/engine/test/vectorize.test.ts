import { describe, expect, it } from 'vitest';

import { createRaster, vectorizeRaster } from '../src/index.js';

describe('local raster vectorization', () => {
  it('creates a self-contained SVG from a local raster', () => {
    const svg = vectorizeRaster(
      createRaster(
        2,
        2,
        new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 0, 255]),
      ),
    );
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
    expect(svg).not.toMatch(/(?:href|xlink:href)=["']https?:/u);
  });
});
