import decodeJpeg from '@jsquash/jpeg/decode.js';
import encodeJpeg from '@jsquash/jpeg/encode.js';
import optimisePng from '@jsquash/oxipng/optimise.js';
import encodePng from '@jsquash/png/encode.js';
import encodeWebp from '@jsquash/webp/encode.js';

import type { RasterImage } from '../types.js';

function toImageData(image: RasterImage): ImageData {
  const frame = image.frames[0];
  return {
    data: frame.data,
    width: image.width,
    height: image.height,
    colorSpace: image.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
  } as ImageData;
}

export async function decodeJpegToRaster(bytes: ArrayBuffer): Promise<RasterImage> {
  const decoded = await decodeJpeg(bytes);
  return {
    width: decoded.width,
    height: decoded.height,
    colorSpace: decoded.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: decoded.data, durationMs: 0 }],
  };
}

export function encodeRasterAsJpeg(
  image: RasterImage,
  options: { quality?: number; progressive?: boolean } = {},
): Promise<ArrayBuffer> {
  return encodeJpeg(toImageData(image), options);
}

export function encodeRasterAsPng(image: RasterImage): Promise<ArrayBuffer> {
  return encodePng(toImageData(image));
}

export async function encodeRasterAsOptimisedPng(image: RasterImage): Promise<ArrayBuffer> {
  return optimisePng(await encodeRasterAsPng(image));
}

export function encodeRasterAsWebp(
  image: RasterImage,
  options: { quality?: number; lossless?: number } = {},
): Promise<ArrayBuffer> {
  return encodeWebp(toImageData(image), options);
}

export async function transcodeJpegToWebp(
  bytes: ArrayBuffer,
  options: { quality?: number } = {},
): Promise<ArrayBuffer> {
  return encodeRasterAsWebp(await decodeJpegToRaster(bytes), options);
}
