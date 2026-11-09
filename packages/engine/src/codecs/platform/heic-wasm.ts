/**
 * heic2any HEIC/HEIF decode fallback.
 *
 * heic2any (MIT, © 2017 Yahoo Inc.) bundles the libheif WASM decoder and runs it
 * inside a blob worker, so HEIC/HEIF files decode with no external API call and no
 * remote WASM fetch: everything ships with the application. This module is the
 * application-controlled fallback for browsers whose platform decoders decline HEIC
 * (Chromium/Firefox without a licensed HEVC decoder, older Safari, etc.).
 *
 * heic2any resolves with a PNG-encoded Blob, which this module verifies against the
 * PNG signature before trusting its IHDR dimensions, then draws through a canvas to
 * produce RGBA pixels for the engine's RasterImage shape.
 */

import type { EngineError, RasterImage } from '../../types.js';
import { createCanvasFromRgba } from '../../capabilities.js';
import {
  HEIC_UNSUPPORTED_MESSAGE,
  decodeHeic,
  detectHeicMimeType,
  isHeicContainer,
  supportsHeicDecode,
} from './heic.js';

export {
  HEIC_UNSUPPORTED_MESSAGE,
  decodeHeic,
  detectHeicMimeType,
  isHeicContainer,
  supportsHeicDecode,
};

/**
 * Decodes HEIC/HEIF data with the bundled heic2any (libheif) decoder.
 *
 * @param bytes - The HEIC/HEIF file data as ArrayBuffer or Uint8Array
 * @returns A single-frame RasterImage with decoded RGBA pixels
 * @throws {EngineError} kind 'decode-failed' for a non-HEIF container or failed decode
 */
export async function decodeHeicWithLibHeicJs(
  bytes: ArrayBuffer | Uint8Array,
): Promise<RasterImage> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!isHeicContainer(input)) {
    throw createDecodeError('The selected file is not a valid HEIC or HEIF container.');
  }
  const blob = new Blob([input]);
  let decodedBlob: Blob | undefined;
  try {
    const { default: decode } = await import('heic2any');
    // heic2any spins up a blob worker at module load; if that worker fails
    // (CSP, asm.js error, OOM), the returned promise never settles. Bound it.
    const global = globalThis;
    const output = await Promise.race([
      decode({ blob, toType: 'image/png' }),
      new Promise<never>((_, reject) =>
        global.setTimeout(() => reject(new Error('HEIC WASM decoder timed out')), 60_000),
      ),
    ]);
    decodedBlob = Array.isArray(output) ? output[0] : (output as Blob | undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timed out/i.test(message)) {
      throw createDecodeError(
        'The local HEIC/HEIF decoder did not respond in time. The file may be too large or the decoder failed to initialize.',
      );
    }
    throw createDecodeError(`The HEIC/HEIF decoder failed: ${message}`);
  }
  if (!decodedBlob) {
    throw createDecodeError('The HEIC/HEIF decoder returned no image data.');
  }
  return rasterFromDecodedPng(decodedBlob);
}

/** Verifies the libheif output is a real PNG, then reads it into RGBA pixels. */
async function rasterFromDecodedPng(png: Blob): Promise<RasterImage> {
  const arrayBuffer = await png.arrayBuffer();
  verifyPngOutput(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!width || !height) {
    throw createDecodeError('The HEIC/HEIF decoder returned invalid image dimensions.');
  }
  return drawDecodedPng(new Uint8Array(arrayBuffer), width, height);
}

/** Rejects non-PNG libheif output before dimension parsing and the canvas draw. */
function verifyPngOutput(arrayBuffer: ArrayBuffer): void {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    arrayBuffer.byteLength < signature.length ||
    Array.from(new Uint8Array(arrayBuffer, 0, signature.length)).some(
      (byte, index) => byte !== signature[index],
    )
  ) {
    throw createDecodeError('The HEIC/HEIF decoder produced an invalid PNG output.');
  }
}

/** Draws the verified PNG through a canvas to produce an RGBA RasterImage. */
async function drawDecodedPng(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<RasterImage> {
  const url = URL.createObjectURL(new Blob([bytes]));
  try {
    const image = new Image();
    image.src = url;
    await waitForImageDecode(image);
    const canvas = createCanvasFromRgba(width, height, new Uint8ClampedArray(width * height * 4));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser cannot create a local canvas.');
    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    return {
      width,
      height,
      colorSpace: 'srgb',
      bitDepth: 8,
      premultipliedAlpha: false,
      frames: [{ data: imageData.data, durationMs: 0 }],
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Resolves when an Image element has decoded; rejects so a broken draw surfaces. */
function waitForImageDecode(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('The decoded HEIC output cannot be drawn.'));
  });
}

function createDecodeError(detail: string): EngineError {
  return {
    kind: 'decode-failed',
    format: 'heic',
    detail,
    remedy: 'Convert the file with a trusted application to JPEG or PNG, then try again.',
  };
}
