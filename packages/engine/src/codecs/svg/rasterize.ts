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

/** Initializes the pinned unmodified Resvg WASM module from a caller-provided local asset. */
export async function initializeSvgRenderer(
  wasm: ArrayBuffer | Uint8Array | WebAssembly.Module | URL | string,
): Promise<void> {
  if (rendererFactory) return;
  const { Resvg, initWasm } = await import('@resvg/resvg-wasm');
  await initWasm(wasm);
  rendererFactory = (svg, options) => new Resvg(svg, options);
}

/** Loads the unmodified MPL-2.0 renderer only when SVG rasterization is requested. */
async function loadRenderer(): Promise<SvgRendererFactory> {
  if (rendererFactory) return rendererFactory;
  initializeRenderer ??= (async () => {
    const { default: wasmUrl } = await import('@resvg/resvg-wasm/index_bg.wasm?url');
    // Vite emits this exact pinned package asset locally; no SVG input controls the URL.
    await initializeSvgRenderer(wasmUrl);
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
  if (
    options.width !== undefined &&
    (!Number.isInteger(options.width) || options.width < 1 || options.width > 32_768)
  )
    throw new Error('SVG output width must be a whole number from 1 through 32768 pixels.');
  if (
    options.height !== undefined &&
    (!Number.isInteger(options.height) || options.height < 1 || options.height > 32_768)
  )
    throw new Error('SVG output height must be a whole number from 1 through 32768 pixels.');
  if (
    options.zoom !== undefined &&
    (!Number.isFinite(options.zoom) || options.zoom <= 0 || options.zoom > 100)
  )
    throw new Error('SVG scale factor must be greater than 0 and no more than 100.');
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
