import { encodeRasterAsPng } from '../codecs/jsquash.js';
import type { RasterImage } from '../types.js';

let pdfLib: Promise<typeof import('pdf-lib')> | undefined;

export interface PdfPngPage {
  readonly pngBytes: ArrayBuffer | Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface PdfImagePage extends PdfPngPage {
  readonly encoding: 'png' | 'jpeg';
}

export interface PdfPageLayoutOptions {
  readonly pageSize?: 'image' | 'a4' | 'letter';
  readonly orientation?: 'auto' | 'portrait' | 'landscape';
  readonly marginPoints?: number;
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
  return createPdfFromImagePages(pages.map((page) => ({ ...page, encoding: 'png' })));
}

const fixedPageSizes = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;

function pageLayout(source: PdfImagePage, options: PdfPageLayoutOptions) {
  const margin = options.marginPoints ?? 0;
  if (!Number.isFinite(margin) || margin < 0 || margin > 144)
    throw new Error('PDF margin must be between 0 and 144 points.');
  let [pageWidth, pageHeight] =
    (options.pageSize ?? 'image') === 'image'
      ? [source.width + margin * 2, source.height + margin * 2]
      : [...fixedPageSizes[options.pageSize as 'a4' | 'letter']];
  const orientation = options.orientation ?? 'auto';
  const landscape =
    orientation === 'landscape' || (orientation === 'auto' && source.width > source.height);
  if ((landscape && pageWidth < pageHeight) || (!landscape && pageWidth > pageHeight))
    [pageWidth, pageHeight] = [pageHeight, pageWidth];
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;
  if (availableWidth <= 0 || availableHeight <= 0)
    throw new Error('PDF margin leaves no room for the image.');
  const scale = Math.min(availableWidth / source.width, availableHeight / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    pageWidth,
    pageHeight,
    width,
    height,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
  };
}

/** Creates a deterministic PDF from locally encoded PNG or JPEG pages. */
export async function createPdfFromImagePages(
  pages: readonly PdfImagePage[],
  options: PdfPageLayoutOptions = {},
): Promise<Uint8Array> {
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
  const deterministicDate = new Date(0);
  pdfDocument.setCreationDate(deterministicDate);
  pdfDocument.setModificationDate(deterministicDate);
  for (const source of pages) {
    const layout = pageLayout(source, options);
    const page = pdfDocument.addPage([layout.pageWidth, layout.pageHeight]);
    const image =
      source.encoding === 'jpeg'
        ? await pdfDocument.embedJpg(source.pngBytes)
        : await pdfDocument.embedPng(source.pngBytes);
    page.drawImage(image, {
      height: layout.height,
      width: layout.width,
      x: layout.x,
      y: layout.y,
    });
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
