import decodeAvif from '@jsquash/avif/decode.js';
import encodeAvif from '@jsquash/avif/encode.js';

import type { RasterImage } from '../../types.js';

function toImageData(image: RasterImage): ImageData {
  const frame = image.frames[0];
  if (!frame) throw new Error('The image has no frame to encode.');
  return { data: frame.data, width: image.width, height: image.height } as ImageData;
}

/** Decodes a local AVIF with the cleared jSquash WASM codec. */
export async function decodeAvifToRaster(bytes: ArrayBuffer): Promise<RasterImage> {
  const decoded = await decodeAvif(bytes);
  if (!decoded) throw new Error('The AVIF decoder returned no image.');
  return {
    width: decoded.width,
    height: decoded.height,
    colorSpace: decoded.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: decoded.data, durationMs: 0 }],
  };
}

/** Encodes the first local raster frame as AVIF. */
export function encodeRasterAsAvif(
  image: RasterImage,
  options: { quality?: number; lossless?: boolean } = {},
): Promise<ArrayBuffer> {
  return encodeAvif(toImageData(image), options);
}
