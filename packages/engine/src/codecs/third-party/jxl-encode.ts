import encodeJxl from '@jsquash/jxl/encode.js';

import type { RasterImage } from '../../types.js';

function toImageData(image: RasterImage): ImageData {
  const frame = image.frames[0];
  if (!frame) throw new Error('The image has no frame to encode.');
  return { data: frame.data, width: image.width, height: image.height } as ImageData;
}

/** Browser-deliverable JPEG XL encoding without importing the decoder graph. */
export function encodeRasterAsJxl(
  image: RasterImage,
  options: { quality?: number; lossless?: boolean } = {},
): Promise<ArrayBuffer> {
  return encodeJxl(toImageData(image), options);
}
