import { zipSync } from 'fflate';

import { encodeRasterAsPng } from '../codecs/jsquash.js';
import { resizeRaster } from '../ops/resize.js';
import type { RasterImage } from '../types.js';
import { encodeMultiIco } from './ico.js';

export const FAVICON_ICO_SIZES = [16, 32, 48, 256] as const;
export const FAVICON_PNG_SIZES = [16, 32, 180, 192, 512] as const;

export interface FaviconPackage {
  readonly archive: ArrayBuffer;
  readonly html: string;
  readonly manifest: string;
  readonly fileNames: readonly string[];
  /** Exact favicon-32x32.png bytes included in the archive, for faithful preview. */
  readonly previewPng: ArrayBuffer;
}

type PngEncoder = (image: RasterImage) => Promise<ArrayBuffer>;

function squareRaster(image: RasterImage, size: number): RasterImage {
  return resizeRaster(image, {
    mode: 'pixels',
    width: size,
    height: size,
    lockAspect: false,
    fitMode: 'fill',
    padColor: '#00000000',
    padAnchor: 'center',
    algorithm: 'lanczos3',
    sharpenAfterResize: 0,
    allowUpscale: true,
    roundTo: 1,
    maxPixels: 512 * 512,
  });
}

/** Builds the complete deterministic favicon artifact set from one square local raster. */
export async function createFaviconPackage(
  source: RasterImage,
  siteName = 'Site',
  pngEncoder: PngEncoder = encodeRasterAsPng,
): Promise<FaviconPackage> {
  if (source.width !== source.height || source.width < 1)
    throw new Error('Favicon source must be a non-empty square raster.');
  const trimmedName = siteName.trim();
  if (trimmedName.length < 1 || trimmedName.length > 128)
    throw new Error('Favicon site name must contain between 1 and 128 characters.');

  const ico = encodeMultiIco(FAVICON_ICO_SIZES.map((size) => squareRaster(source, size)));
  const pngFiles = await Promise.all(
    FAVICON_PNG_SIZES.map(async (size) => ({
      name:
        size === 180
          ? 'apple-touch-icon.png'
          : size === 192 || size === 512
            ? `android-chrome-${size}x${size}.png`
            : `favicon-${size}x${size}.png`,
      bytes: new Uint8Array(await pngEncoder(squareRaster(source, size))),
      size,
    })),
  );
  const manifest = `${JSON.stringify(
    {
      name: trimmedName,
      short_name: trimmedName,
      icons: pngFiles
        .filter(({ size }) => size === 192 || size === 512)
        .map(({ name, size }) => ({
          src: `/${name}`,
          sizes: `${size}x${size}`,
          type: 'image/png',
        })),
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
    },
    null,
    2,
  )}\n`;
  const html = [
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ].join('\n');
  const archive: Record<string, Uint8Array> = {
    'favicon.ico': new Uint8Array(ico),
    'site.webmanifest': new TextEncoder().encode(manifest),
    'favicon.html': new TextEncoder().encode(`${html}\n`),
  };
  for (const file of pngFiles) archive[file.name] = file.bytes;
  const zipped = zipSync(archive, { level: 0, mtime: new Date(1980, 0, 1) });
  const preview = archive['favicon-32x32.png']!;
  return {
    archive: zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength),
    html,
    manifest,
    fileNames: Object.keys(archive).sort(),
    previewPng: preview.buffer.slice(
      preview.byteOffset,
      preview.byteOffset + preview.byteLength,
    ) as ArrayBuffer,
  };
}
