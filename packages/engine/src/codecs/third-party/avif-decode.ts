import decodeAvif from '@jsquash/avif/decode.js';

import type { RasterImage } from '../../types.js';

/** Browser-deliverable AVIF decoding without importing the encoder worker graph. */
export async function decodeAvifToRaster(bytes: ArrayBuffer): Promise<RasterImage> {
  const decoded = await decodeAvif(bytes);
  if (!decoded)
    throw {
      kind: 'decode-failed',
      format: 'avif',
      detail: 'The AVIF decoder returned no image (file may be truncated or unsupported). ',
      remedy: 'Convert the file to PNG or JPEG using a trusted application, then try again.',
    };
  return {
    width: decoded.width,
    height: decoded.height,
    colorSpace: decoded.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: decoded.data, durationMs: 0 }],
  };
}
