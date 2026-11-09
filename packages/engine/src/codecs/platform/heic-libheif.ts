/**
 * libheif-js HEIC/HEIF decode fallback.
 *
 * libheif-js (LGPL-3.0, © Kiril Vatev) is an Emscripten port of libheif that runs
 * entirely in the browser via WebAssembly. It does not require any native browser
 * HEIC support and has no worker/CSP dependencies.
 *
 * This module provides a self-contained decoder that:
 * - Loads the WASM bundle dynamically (code-split by Vite)
 * - Decodes HEIC/HEIF binary data to RGBA pixels
 * - Returns a RasterImage compatible with the engine pipeline
 */

import type { EngineError, RasterImage } from '../../types.js';
import { isHeicContainer } from './heic.js';

// Note: HEIC_UNSUPPORTED_MESSAGE and detectHeicMimeType are not used in
// this standalone libheif-js decoder. They are available via ./heic.ts if needed.

// Internal types matching the libheif-js WASM module structure
interface HeifDecoder {
  decode(input: Uint8Array): HeifImage[];
  decoder: { delete(): void };
}

interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(
    buffer: { data: Uint8ClampedArray; width: number; height: number },
    callback: (result: unknown) => void,
  ): void;
  free(): void;
}

interface LibheifModule {
  HeifDecoder: new () => HeifDecoder;
  [key: string]: unknown;
}

/**
 * Loads the libheif-js WASM bundle.
 * Uses the 'wasm-bundle' entry which inlines the WASM binary for zero-fetch initialization.
 * The module returns a factory function that creates the libheif Module.
 */
async function loadLibheifModule(): Promise<LibheifModule> {
  // Dynamic import for code-splitting - Vite will create a separate chunk
  // The wasm-bundle.js inlines the WASM binary so there's no separate .wasm file request
  const libheif = await import('libheif-js/wasm-bundle.js');
  // libheif-js default export varies by version; fall back to namespace
  const factory = libheif.default ?? libheif;
  if (typeof factory !== 'function') {
    throw new Error('libheif-js wasm-bundle did not export a factory function');
  }
  return factory();
}

export async function decodeHeicWithLibheifJs(
  bytes: ArrayBuffer | Uint8Array,
): Promise<RasterImage> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!isHeicContainer(input)) {
    throw createDecodeError('The selected file is not a valid HEIC or HEIF container.');
  }

  const Module = await loadLibheifModule();
  let heifModule: LibheifModule;

  try {
    heifModule = Module;
  } catch (error) {
    throw createDecodeError(
      `The HEIC/HEIF WASM module failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const decoder = new heifModule.HeifDecoder();
  let heifImages: HeifImage[] | undefined;

  try {
    heifImages = decoder.decode(input);
  } catch (error: unknown) {
    decoder.decoder.delete();
    throw createDecodeError(
      `The HEIC/HEIF decoder failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!heifImages || heifImages.length === 0) {
    decoder.decoder.delete();
    throw createDecodeError('The HEIC/HEIF decoder found no images in the container.');
  }

  // Decode the first image (primary image)
  const heifImage = heifImages[0];
  if (!heifImage) {
    decoder.decoder.delete();
    throw createDecodeError('The HEIC/HEIF decoder returned an undefined primary image.');
  }

  const width = heifImage.get_width();
  const height = heifImage.get_height();

  if (!width || !height) {
    for (const img of heifImages) img.free();
    decoder.decoder.delete();
    throw createDecodeError('The HEIC/HEIF decoder returned invalid image dimensions.');
  }

  // Display the image into an RGBA buffer
  const rgbaData = new Uint8ClampedArray(width * height * 4);
  try {
    await new Promise<void>((resolve, reject) => {
      heifImage.display({ data: rgbaData, width, height }, (result: unknown) => {
        if (!result) {
          reject(new Error('HEIF display callback returned no data'));
          return;
        }
        resolve();
      });
    });
  } catch (error: unknown) {
    heifImage.free();
    heifImages.slice(1).forEach((img) => img.free());
    decoder.decoder.delete();
    throw createDecodeError(
      `The HEIC/HEIF decoder failed to render pixels: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Clean up
  heifImage.free();
  heifImages.slice(1).forEach((img) => img.free());
  decoder.decoder.delete();

  return {
    width,
    height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: rgbaData, durationMs: 0 }],
  };
}

function createDecodeError(detail: string): EngineError {
  return {
    kind: 'decode-failed',
    format: 'heic',
    detail,
    remedy: 'Convert the file with a trusted application to JPEG or PNG, then try again.',
  };
}
