import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

import { assertSafeSvg } from './safety.js';

export interface SvgRasterizeOptions {
  readonly width?: number;
  readonly height?: number;
  readonly zoom?: number;
  readonly background?: string;
}

interface RenderedSvg {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  free(): void;
}

interface SvgRenderer {
  render(): RenderedSvg;
  free(): void;
}

type SvgRendererFactory = (svg: string, options: Readonly<Record<string, unknown>>) => SvgRenderer;

let rendererFactory: SvgRendererFactory | undefined;
let initializeRenderer: Promise<void> | undefined;

/** Loads the unmodified MPL-2.0 renderer only when SVG rasterization is requested. */
async function loadRenderer(): Promise<SvgRendererFactory> {
  if (rendererFactory) return rendererFactory;
  initializeRenderer ??= (async () => {
    const { Resvg, initWasm } = await import('@resvg/resvg-wasm');
    // Vite rewrites this package asset URL at build time; no SVG input can cause a network request.
    await initWasm(new URL('@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
    rendererFactory = (svg, options) => new Resvg(svg, options);
  })();
  await initializeRenderer;
  if (!rendererFactory) throw new Error('SVG renderer did not initialize.');
  return rendererFactory;
}

/** Rasterizes a self-contained SVG locally. External references and active content are refused first. */
export async function rasterizeSvg(
  input: string | Uint8Array,
  options: SvgRasterizeOptions = {},
  factory?: SvgRendererFactory,
): Promise<RasterImage> {
  const svg = assertSafeSvg(input);
  const renderer = (factory ?? (await loadRenderer()))(svg, {
    fitTo: options.width
      ? { mode: 'width', value: options.width }
      : options.height
        ? { mode: 'height', value: options.height }
        : options.zoom
          ? { mode: 'zoom', value: options.zoom }
          : { mode: 'original' },
    ...(options.background ? { background: options.background } : {}),
  });
  try {
    const rendered = renderer.render();
    try {
      if (rendered.width < 1 || rendered.height < 1)
        throw new Error('SVG rendered at an invalid size.');
      return createRaster(rendered.width, rendered.height, new Uint8ClampedArray(rendered.pixels));
    } finally {
      rendered.free();
    }
  } finally {
    renderer.free();
  }
}
