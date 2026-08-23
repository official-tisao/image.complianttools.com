import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  SvgRasterizeToolOptionsSchema,
  initializeSvgRenderer,
  rasterizeSvg,
  SVG_EXTERNAL_REFERENCE_MESSAGE,
} from '../src/index.js';

describe('local SVG rasterization', () => {
  it('defines intrinsic no-op sizing and bounds explicit dimensions and scale', () => {
    expect(SvgRasterizeToolOptionsSchema.parse({})).toEqual({ mode: 'original', value: 1 });
    expect(SvgRasterizeToolOptionsSchema.parse({ mode: 'width', value: 320 })).toEqual({
      mode: 'width',
      value: 320,
    });
    expect(() => SvgRasterizeToolOptionsSchema.parse({ mode: 'width', value: 1.5 })).toThrow(
      'whole pixels',
    );
    expect(() => SvgRasterizeToolOptionsSchema.parse({ mode: 'scale', value: 101 })).toThrow(
      'must not exceed 100',
    );
  });

  it('renders a real self-contained fixture through the pinned Resvg WASM bytes', async () => {
    const wasm = await readFile(
      new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url),
    );
    await initializeSvgRenderer(wasm);
    const raster = await rasterizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"><rect width="1" height="1" fill="#ff0000"/><rect x="1" width="1" height="1" fill="#00ff00"/></svg>',
    );
    expect(raster.frames[0].data).toEqual(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]));
  });

  it('turns a self-contained SVG into an RGBA raster and releases renderer resources', async () => {
    const renderedFree = vi.fn();
    const rendererFree = vi.fn();
    const raster = await rasterizeSvg(
      '<svg width="2" height="1"><rect width="2" height="1" fill="red"/></svg>',
      {},
      () => ({
        render: () => ({
          width: 2,
          height: 1,
          pixels: new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255]),
          free: renderedFree,
        }),
        free: rendererFree,
      }),
    );
    expect(raster.width).toBe(2);
    expect(raster.height).toBe(1);
    expect(raster.frames[0].data).toEqual(new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]));
    expect(renderedFree).toHaveBeenCalledOnce();
    expect(rendererFree).toHaveBeenCalledOnce();
  });

  it('refuses an external SVG reference before loading a renderer', async () => {
    await expect(
      rasterizeSvg('<svg><image href="https://example.test/image.png"/></svg>'),
    ).rejects.toThrow(SVG_EXTERNAL_REFERENCE_MESSAGE);
  });

  it('refuses hostile raster dimensions before loading a renderer', async () => {
    await expect(rasterizeSvg('<svg/>', { width: 32_769 })).rejects.toThrow('32768');
    await expect(rasterizeSvg('<svg/>', { height: 1.5 })).rejects.toThrow('whole number');
    await expect(rasterizeSvg('<svg/>', { zoom: 101 })).rejects.toThrow('no more than 100');
  });
});
