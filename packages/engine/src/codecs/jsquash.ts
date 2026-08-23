import decodeJpeg from '@jsquash/jpeg/decode.js';
import encodeJpeg from '@jsquash/jpeg/encode.js';
import optimisePng from '@jsquash/oxipng/optimise.js';
import decodePng from '@jsquash/png/decode.js';
import encodePng from '@jsquash/png/encode.js';
import decodeWebp from '@jsquash/webp/decode.js';
import encodeWebp from '@jsquash/webp/encode.js';

import type { RasterImage } from '../types.js';
import { preserveContainerMetadata } from '../metadata/container.js';

function toImageData(image: RasterImage): ImageData {
  const frame = image.frames[0];
  return {
    data: frame.data,
    width: image.width,
    height: image.height,
    colorSpace: image.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
  } as ImageData;
}

function retainedMetadata(bytes: ArrayBuffer) {
  const encodedMetadata = preserveContainerMetadata(bytes);
  return encodedMetadata ? { encodedMetadata } : {};
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
    ...retainedMetadata(bytes),
  };
}

export async function decodePngToRaster(bytes: ArrayBuffer): Promise<RasterImage> {
  const header = new Uint8Array(bytes);
  if (
    header.length >= 24 &&
    header[0] === 137 &&
    header[1] === 80 &&
    header[2] === 78 &&
    header[3] === 71
  ) {
    const view = new DataView(bytes);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width < 1 || height < 1 || width * height > 100_000_000)
      throw new Error('PNG dimensions exceed the safe decode limit.');
  }
  const decoded = await decodePng(bytes);
  return {
    width: decoded.width,
    height: decoded.height,
    colorSpace: decoded.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: decoded.data, durationMs: 0 }],
    ...retainedMetadata(bytes),
  };
}

export async function decodeWebpToRaster(bytes: ArrayBuffer): Promise<RasterImage> {
  const decoded = await decodeWebp(bytes);
  return {
    width: decoded.width,
    height: decoded.height,
    colorSpace: decoded.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: decoded.data, durationMs: 0 }],
    ...retainedMetadata(bytes),
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
