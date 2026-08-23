import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createPdfFromPng, createPdfFromPngPages } from '../src/index.js';

const onePixelPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1,
  255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

describe('PDF export', () => {
  it('creates a one-page PDF containing a PNG without a network dependency', async () => {
    const bytes = await createPdfFromPng(onePixelPng, 72, 36);
    const pdf = await PDFDocument.load(bytes);

    expect(bytes.subarray(0, 5)).toEqual(new Uint8Array([37, 80, 68, 70, 45]));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({ height: 36, width: 72 });
    expect(await createPdfFromPng(onePixelPng, 72, 36)).toEqual(bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'bd7bbb2fc53b57797776b1a15853d0d5af6b59c241e39f67d23c3d22cf72e173',
    );
  });

  it('rejects invalid page dimensions before creating a document', async () => {
    await expect(createPdfFromPng(onePixelPng, 0, 10)).rejects.toThrow('positive finite');
  });

  it('creates ordered local PNG pages in one multi-page PDF', async () => {
    const bytes = await createPdfFromPngPages([
      { pngBytes: onePixelPng, width: 72, height: 36 },
      { pngBytes: onePixelPng, width: 36, height: 72 },
    ]);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize()).toEqual({ height: 36, width: 72 });
    expect(pdf.getPage(1).getSize()).toEqual({ height: 72, width: 36 });
    await expect(createPdfFromPngPages([])).rejects.toThrow('at least one page');
  });
});
