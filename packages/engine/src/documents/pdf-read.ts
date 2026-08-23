import { createRaster } from '../ops/raster.js';
import type { RasterImage } from '../types.js';

export interface PdfPageRenderOptions {
  /** One-based page number. */
  readonly pageNumber?: number;
  /** Output scale relative to PDF's 72 DPI coordinate system. */
  readonly scale?: number;
}

interface PdfViewport {
  readonly width: number;
  readonly height: number;
}

interface PdfCanvasContext {
  getImageData(
    x: number,
    y: number,
    width: number,
    height: number,
  ): { readonly data: Uint8ClampedArray };
}

interface PdfCanvas {
  width: number;
  height: number;
  getContext(
    type: '2d',
    settings?: { readonly willReadFrequently?: boolean },
  ): PdfCanvasContext | null;
}

interface PdfPage {
  getViewport(options: { readonly scale: number }): PdfViewport;
  render(options: {
    readonly canvas: PdfCanvas;
    readonly canvasContext: PdfCanvasContext;
    readonly viewport: PdfViewport;
  }): {
    readonly promise: Promise<void>;
  };
}

interface PdfDocument {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

export type PdfDocumentLoader = (input: Uint8Array) => Promise<PdfDocument>;
export type PdfCanvasFactory = () => PdfCanvas;

export interface PdfDocumentInfo {
  readonly pageCount: number;
  readonly pages: readonly {
    readonly pageNumber: number;
    readonly widthPoints: number;
    readonly heightPoints: number;
  }[];
}

let pdfJsLoader: Promise<PdfDocumentLoader> | undefined;

async function loadPdfJs(): Promise<PdfDocumentLoader> {
  pdfJsLoader ??= (async () => {
    // The legacy entry installs PDF.js's supported Node canvas/DOMMatrix shims;
    // browsers use the smaller standard entry.
    const nodeEnvironment = typeof DOMMatrix === 'undefined';
    const pdfjs = nodeEnvironment
      ? await import('pdfjs-dist/legacy/build/pdf.mjs')
      : await import('pdfjs-dist');
    // Vite emits this worker as a local asset. PDF.js controls its own worker request; engine code
    // never contacts an arbitrary document-provided URL.
    pdfjs.GlobalWorkerOptions.workerSrc = nodeEnvironment
      ? import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
      : new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    return async (input) =>
      (await pdfjs.getDocument({ data: new Uint8Array(input) }).promise) as unknown as PdfDocument;
  })();
  return pdfJsLoader!;
}

/** Parses a real PDF locally and reports its page geometry without rasterizing it. */
export async function readPdfDocumentInfo(
  input: ArrayBuffer | Uint8Array,
  loader?: PdfDocumentLoader,
): Promise<PdfDocumentInfo> {
  const source = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input);
  const pdf = await (loader ?? (await loadPdfJs()))(source);
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const viewport = (await pdf.getPage(pageNumber)).getViewport({ scale: 1 });
      if (
        !Number.isFinite(viewport.width) ||
        !Number.isFinite(viewport.height) ||
        viewport.width < 1 ||
        viewport.height < 1
      )
        throw new Error(`PDF page ${pageNumber} has invalid dimensions.`);
      pages.push({
        pageNumber,
        widthPoints: viewport.width,
        heightPoints: viewport.height,
      });
    }
    return { pageCount: pdf.numPages, pages };
  } finally {
    await pdf.destroy();
  }
}

/** Renders one PDF page to an RGBA raster through a caller-provided browser canvas. */
export async function renderPdfPage(
  input: ArrayBuffer | Uint8Array,
  options: PdfPageRenderOptions = {},
  loader: PdfDocumentLoader | undefined,
  canvasFactory: PdfCanvasFactory,
): Promise<RasterImage> {
  const pageNumber = options.pageNumber ?? 1;
  const scale = options.scale ?? 1;
  if (!Number.isInteger(pageNumber) || pageNumber < 1)
    throw new Error('PDF page number must be positive.');
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('PDF render scale must be positive.');
  const source = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input);
  const documentLoader = loader ?? (await loadPdfJs());
  const pdf = await documentLoader(source);
  try {
    if (pageNumber > pdf.numPages) {
      throw new Error(
        `PDF has ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}; page ${pageNumber} is unavailable.`,
      );
    }
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    if (
      !Number.isFinite(viewport.width) ||
      !Number.isFinite(viewport.height) ||
      viewport.width < 1 ||
      viewport.height < 1
    ) {
      throw new Error('PDF page has invalid render dimensions.');
    }
    const canvas = canvasFactory();
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Your browser cannot create a local canvas for PDF rendering.');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return createRaster(
      canvas.width,
      canvas.height,
      new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data),
    );
  } finally {
    await pdf.destroy();
  }
}

/** Renders modern PDF-compatible Illustrator files and explicitly refuses legacy PostScript AI. */
export async function renderIllustratorPage(
  input: ArrayBuffer | Uint8Array,
  options: PdfPageRenderOptions = {},
  loader?: PdfDocumentLoader,
  canvasFactory?: PdfCanvasFactory,
): Promise<RasterImage> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (new TextDecoder('latin1').decode(bytes.subarray(0, 5)) !== '%PDF-')
    throw new Error(
      'This is a legacy pre-PDF Illustrator file. Only modern PDF-compatible .ai files are supported; export it as PDF or SVG in Illustrator first.',
    );
  if (!canvasFactory) throw new Error('Illustrator rendering requires a browser canvas factory.');
  return renderPdfPage(bytes, options, loader, canvasFactory);
}
