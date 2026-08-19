import decodeAvif from '@jsquash/avif/decode.js';

import type { RasterImage } from '../../types.js';

/** Browser-deliverable AVIF decoding without importing the encoder worker graph. */
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
