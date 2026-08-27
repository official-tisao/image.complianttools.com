import encodeAvif from '@jsquash/avif/encode.js';

import type { RasterImage } from '../../types.js';

type AvifEncodeOptions = {
  quality?: number;
  lossless?: boolean;
  speed?: number;
  subsample?: number;
  bitDepth?: 8 | 10 | 12;
};

function toImageData(image: RasterImage, bitDepth: 8): ImageData;
function toImageData(
  image: RasterImage,
  bitDepth: 10 | 12,
): { data: Uint16Array; width: number; height: number };
function toImageData(image: RasterImage, bitDepth: 8 | 10 | 12) {
  const frame = image.frames[0];
  if (!frame) throw new Error('The image has no frame to encode.');
  const maxSample = (1 << bitDepth) - 1;
  const data =
    bitDepth === 8
      ? frame.data
      : Uint16Array.from(frame.data, (sample) => Math.round((sample * maxSample) / 255));
  return { data, width: image.width, height: image.height };
}

/** Browser-deliverable AVIF encoding without importing the decoder graph. */
export function encodeRasterAsAvif(
  image: RasterImage,
  options: AvifEncodeOptions = {},
): Promise<ArrayBuffer> {
  const bitDepth = options.bitDepth ?? 8;
  return bitDepth === 8
    ? encodeAvif(toImageData(image, bitDepth), { ...options, bitDepth })
    : encodeAvif(toImageData(image, bitDepth), { ...options, bitDepth });
}
