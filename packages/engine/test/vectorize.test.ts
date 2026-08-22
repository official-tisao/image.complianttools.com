import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  createRaster,
  initializeSvgRenderer,
  rasterizeSvg,
  vectorizeRaster,
} from '../src/index.js';

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

  it('round-trips a fixture through the shipped ImageTracer and Resvg implementations', async () => {
    const wasm = await readFile(
      new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url),
    );
    await initializeSvgRenderer(wasm);
    const source = createRaster(
      2,
      2,
      new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]),
    );
    const decoded = await rasterizeSvg(vectorizeRaster(source));
    expect([decoded.width, decoded.height]).toEqual([2, 2]);
    expect(decoded.frames[0].data).toEqual(source.frames[0].data);
  });
});
