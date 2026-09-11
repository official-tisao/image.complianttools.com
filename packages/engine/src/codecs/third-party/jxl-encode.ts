import encodeJxl from '@jsquash/jxl/encode.js';

import type { RasterImage } from '../../types.js';

function toImageData(image: RasterImage): ImageData {
  const frame = image.frames[0];
  if (!frame)
    throw {
      kind: 'encode-failed',
      format: 'jxl',
      detail: 'The image has no frame to encode.',
      remedy: 'Choose a valid image file with at least one frame and try again.',
    };
  return { data: frame.data, width: image.width, height: image.height } as ImageData;
}

/** Browser-deliverable JPEG XL encoding without importing the decoder graph. */
export function encodeRasterAsJxl(
  image: RasterImage,
  options: { quality?: number; lossless?: boolean; effort?: number } = {},
): Promise<ArrayBuffer> {
  return encodeJxl(toImageData(image), options);
}
