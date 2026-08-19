import { describe, expect, it, vi } from 'vitest';

import { rasterizeSvg, SVG_EXTERNAL_REFERENCE_MESSAGE } from '../src/index.js';

describe('local SVG rasterization', () => {
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
});
