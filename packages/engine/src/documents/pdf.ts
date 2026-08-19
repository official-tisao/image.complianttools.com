import { encodeRasterAsPng } from '../codecs/jsquash.js';
import type { RasterImage } from '../types.js';

let pdfLib: Promise<typeof import('pdf-lib')> | undefined;

export interface PdfPngPage {
  readonly pngBytes: ArrayBuffer | Uint8Array;
  readonly width: number;
  readonly height: number;
}

function loadPdfLib(): Promise<typeof import('pdf-lib')> {
  pdfLib ??= import('pdf-lib');
  return pdfLib;
}

/**
 * Creates a single-page PDF containing a PNG image. Width and height are PDF
 * points, which keeps image-to-PDF output deterministic and completely local.
 */
export async function createPdfFromPng(
  pngBytes: ArrayBuffer | Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  return createPdfFromPngPages([{ pngBytes, width, height }]);
}

/** Creates a deterministic multi-page PDF from local PNG pages in the supplied order. */
export async function createPdfFromPngPages(pages: readonly PdfPngPage[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('PDF requires at least one page.');
  for (const page of pages) {
    if (
      !Number.isFinite(page.width) ||
      !Number.isFinite(page.height) ||
      page.width <= 0 ||
      page.height <= 0
    ) {
      throw new Error('PDF page dimensions must be positive finite values.');
    }
  }

  const { PDFDocument } = await loadPdfLib();
  const pdfDocument = await PDFDocument.create();
  for (const source of pages) {
    const page = pdfDocument.addPage([source.width, source.height]);
    const image = await pdfDocument.embedPng(source.pngBytes);
    page.drawImage(image, { height: source.height, width: source.width, x: 0, y: 0 });
  }
  return pdfDocument.save();
}

/** Encodes the engine raster once, then embeds that encoded image in a PDF. */
export async function createPdfFromRaster(image: RasterImage): Promise<Uint8Array> {
  return createPdfFromPng(await encodeRasterAsPng(image), image.width, image.height);
}

/** Encodes and assembles local raster frames into a PDF without a network dependency. */
export async function createPdfFromRasters(images: readonly RasterImage[]): Promise<Uint8Array> {
  return createPdfFromPngPages(
    await Promise.all(
      images.map(async (image) => ({
        pngBytes: await encodeRasterAsPng(image),
        width: image.width,
        height: image.height,
      })),
    ),
  );
}
