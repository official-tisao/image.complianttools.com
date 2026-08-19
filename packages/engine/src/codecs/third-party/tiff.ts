import UTIF from 'utif';

import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

export function decodeTiff(input: ArrayBuffer | Uint8Array): RasterImage {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const [page] = UTIF.decode(buffer);
  if (!page) throw new Error('TIFF contains no image pages.');
  UTIF.decodeImage(buffer, page);
  return createRaster(page.width, page.height, new Uint8ClampedArray(UTIF.toRGBA8(page)));
}

export function encodeTiff(image: RasterImage): ArrayBuffer {
  const rgba = new Uint8Array(image.frames[0].data);
  return UTIF.encodeImage(rgba, image.width, image.height);
}
