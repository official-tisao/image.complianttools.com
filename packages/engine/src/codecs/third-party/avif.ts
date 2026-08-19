import type { RasterImage } from '../../types.js';

function toRaster(image: ImageData): RasterImage {
  return {
    width: image.width,
    height: image.height,
    colorSpace: image.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: image.data, durationMs: 0 }],
  };
}

/** Lazily loads the permissive libavif WASM wrapper only when AVIF is used. */
export async function decodeAvifToRaster(bytes: ArrayBuffer): Promise<RasterImage> {
  const { default: decode } = await import('@jsquash/avif/decode.js');
  const decoded = await decode(bytes);
  if (!decoded) throw new Error('The AVIF file could not be decoded.');
  return toRaster(decoded);
}

export async function encodeRasterAsAvif(
  image: RasterImage,
  options: { readonly speed?: number } = {},
): Promise<ArrayBuffer> {
  const { default: encode } = await import('@jsquash/avif/encode.js');
  const frame = image.frames[0];
  if (!frame) throw new Error('Cannot encode an image without a frame.');
  return encode({ data: frame.data, width: image.width, height: image.height } as ImageData, {
    ...options,
    bitDepth: 8,
  });
}
