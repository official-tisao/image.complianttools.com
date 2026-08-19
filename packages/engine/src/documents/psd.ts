import { createRaster } from '../ops/raster.js';
import type { RasterImage } from '../types.js';

type PsdDocument = {
  readonly width: number;
  readonly height: number;
  readonly imageData?: { readonly data: Uint8ClampedArray | Uint8Array };
};
type PsdModule = {
  readPsd(input: ArrayBuffer | Uint8Array, options: { useImageData: true }): PsdDocument;
};

async function loadPsd(): Promise<PsdModule> {
  return import('ag-psd') as Promise<PsdModule>;
}

/** Decodes the flattened PSD/PSB composite locally; layer data remains in the source document. */
export async function decodePsd(
  input: ArrayBuffer | Uint8Array,
  loader: () => Promise<PsdModule> = loadPsd,
): Promise<RasterImage> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 26 || new TextDecoder('latin1').decode(bytes.subarray(0, 4)) !== '8BPS')
    throw new Error('PSD image has an invalid header.');
  const psd = (await loader()).readPsd(bytes, { useImageData: true });
  const pixels = psd.imageData?.data;
  if (!pixels || pixels.length !== psd.width * psd.height * 4)
    throw new Error('PSD does not contain a readable flattened RGBA composite.');
  return createRaster(psd.width, psd.height, new Uint8ClampedArray(pixels));
}
