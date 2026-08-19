import decodeJxl from '@jsquash/jxl/decode.js';
import encodeJxl from '@jsquash/jxl/encode.js';

import type { RasterImage } from '../../types.js';

function toImageData(image: RasterImage): ImageData {
  const frame = image.frames[0];
  if (!frame) throw new Error('The image has no frame to encode.');
  return { data: frame.data, width: image.width, height: image.height } as ImageData;
}

/** Decodes a local JPEG XL file with the cleared jSquash WASM codec. */
export async function decodeJxlToRaster(bytes: ArrayBuffer): Promise<RasterImage> {
  const decoded = await decodeJxl(bytes);
  return {
    width: decoded.width,
    height: decoded.height,
    colorSpace: decoded.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: decoded.data, durationMs: 0 }],
  };
}

/** Encodes the first local raster frame as JPEG XL. */
export function encodeRasterAsJxl(
  image: RasterImage,
  options: { quality?: number; lossless?: boolean } = {},
): Promise<ArrayBuffer> {
  return encodeJxl(toImageData(image), options);
}
