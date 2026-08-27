import decodeJxl from '@jsquash/jxl/decode.js';

import type { RasterImage } from '../../types.js';

/** Browser-deliverable JPEG XL decoding without importing the encoder worker graph. */
export async function decodeJxlToRaster(bytes: ArrayBuffer): Promise<RasterImage> {
  const decoded = await decodeJxl(bytes);
  if (!decoded) throw new Error('The JPEG XL decoder returned no image.');
  return {
    width: decoded.width,
    height: decoded.height,
    colorSpace: decoded.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: decoded.data, durationMs: 0 }],
  };
}
