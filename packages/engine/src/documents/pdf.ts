import { encodeRasterAsPng } from '../codecs/jsquash.js';
import type { RasterImage } from '../types.js';

let pdfLib: Promise<typeof import('pdf-lib')> | undefined;

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
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('PDF page dimensions must be positive finite values.');
  }

  const { PDFDocument } = await loadPdfLib();
  const pdfDocument = await PDFDocument.create();
  const page = pdfDocument.addPage([width, height]);
  const image = await pdfDocument.embedPng(pngBytes);
  page.drawImage(image, { height, width, x: 0, y: 0 });
  return pdfDocument.save();
}

/** Encodes the engine raster once, then embeds that encoded image in a PDF. */
export async function createPdfFromRaster(image: RasterImage): Promise<Uint8Array> {
  return createPdfFromPng(await encodeRasterAsPng(image), image.width, image.height);
}
