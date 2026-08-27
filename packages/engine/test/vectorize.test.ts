import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  createRaster,
  initializeSvgRenderer,
  rasterizeSvg,
  vectorizeRaster,
  VectorizeToolOptionsSchema,
} from '../src/index.js';

describe('local raster vectorization', () => {
  it('defines bounded, generated tracing defaults', () => {
    expect(VectorizeToolOptionsSchema.parse({})).toEqual({ colors: 16, curveTolerance: 1 });
    expect(() => VectorizeToolOptionsSchema.parse({ colors: 1 })).toThrow();
    expect(() => VectorizeToolOptionsSchema.parse({ curveTolerance: 10.01 })).toThrow();
  });
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

  it('applies colour and curve controls and rejects unbounded direct API input', () => {
    const source = createRaster(
      2,
      2,
      new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255]),
    );
    const detailed = vectorizeRaster(source, { colors: 4, curveTolerance: 0.1 });
    const simple = vectorizeRaster(source, { colors: 2, curveTolerance: 10 });
    expect(simple).not.toEqual(detailed);
    expect(() => vectorizeRaster(source, { colors: 65 })).toThrow('2 to 64');
    expect(() => vectorizeRaster(source, { curveTolerance: 0 })).toThrow('0.01 and 10');
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
