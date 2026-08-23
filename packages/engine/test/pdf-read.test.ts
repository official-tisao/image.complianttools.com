import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

import {
  renderIllustratorPage,
  renderPdfPage,
  readPdfDocumentInfo,
  type PdfCanvasFactory,
  type PdfDocumentLoader,
} from '../src/index.js';

describe('browser-local PDF page rendering', () => {
  it('parses real multi-page PDF bytes through the production PDF.js loader', async () => {
    const document = await PDFDocument.create();
    document.addPage([72, 36]);
    document.addPage([144, 216]);
    const fixture = await document.save();
    await expect(readPdfDocumentInfo(fixture)).resolves.toEqual({
      pageCount: 2,
      pages: [
        { pageNumber: 1, widthPoints: 72, heightPoints: 36 },
        { pageNumber: 2, widthPoints: 144, heightPoints: 216 },
      ],
    });
  });

  it('rejects malformed bytes through the production PDF.js loader', async () => {
    await expect(
      readPdfDocumentInfo(new TextEncoder().encode('%PDF-not-a-document')),
    ).rejects.toThrow();
  });

  it('renders a chosen PDF page through the injected local renderer and destroys the document', async () => {
    const destroy = vi.fn(async () => undefined);
    const loader: PdfDocumentLoader = async () => ({
      numPages: 2,
      destroy,
      getPage: async (number) => {
        expect(number).toBe(2);
        return {
          getViewport: ({ scale }) => ({ width: 2 * scale, height: scale }),
          render: () => ({ promise: Promise.resolve() }),
        };
      },
    });
    const canvas: PdfCanvasFactory = () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) }),
      }),
    });
    const image = await renderPdfPage(
      new Uint8Array([37, 80, 68, 70]),
      { pageNumber: 2 },
      loader,
      canvas,
    );
    expect(image.width).toBe(2);
    expect(image.height).toBe(1);
    expect(image.frames[0].data).toEqual(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]));
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('refuses unavailable pages and invalid page choices with a useful local error', async () => {
    const loader: PdfDocumentLoader = async () => ({
      numPages: 1,
      destroy: async () => undefined,
      getPage: async () => {
        throw new Error('unreachable');
      },
    });
    const canvas: PdfCanvasFactory = () => {
      throw new Error('unreachable');
    };
    await expect(
      renderPdfPage(new Uint8Array(), { pageNumber: 2 }, loader, canvas),
    ).rejects.toThrow('page 2 is unavailable');
    await expect(
      renderPdfPage(new Uint8Array(), { pageNumber: 0 }, loader, canvas),
    ).rejects.toThrow('page number must be positive');
  });

  it('routes a real PDF-compatible AI fixture to PDF rendering and refuses legacy AI', async () => {
    const fixture = await (await PDFDocument.create()).save();
    const loader: PdfDocumentLoader = async (input) => {
      expect(new TextDecoder('latin1').decode(input.subarray(0, 5))).toBe('%PDF-');
      return {
        numPages: 1,
        destroy: async () => undefined,
        getPage: async () => ({
          getViewport: () => ({ width: 1, height: 1 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      };
    };
    const canvas: PdfCanvasFactory = () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        getImageData: () => ({ data: Uint8ClampedArray.of(10, 20, 30, 255) }),
      }),
    });
    await expect(renderIllustratorPage(fixture, {}, loader, canvas)).resolves.toMatchObject({
      frames: [{ data: Uint8ClampedArray.of(10, 20, 30, 255) }],
    });
    await expect(
      renderIllustratorPage(new TextEncoder().encode('%!PS-Adobe-3.0'), {}, loader, canvas),
    ).rejects.toThrow('legacy pre-PDF Illustrator');
  });
});
