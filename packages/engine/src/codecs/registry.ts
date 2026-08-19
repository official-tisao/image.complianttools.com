import type { FormatCapability, RuntimeCapabilities } from '../capabilities.js';
import type { FormatId } from '../types.js';

export type CodecOperation = 'decode' | 'encode';

export interface CodecDescriptor {
  readonly id: FormatId;
  readonly animation: boolean;
  readonly lazyBytes: number;
  readonly supports: readonly CodecOperation[];
  readonly load?: () => Promise<unknown>;
  readonly unavailableReason?: string;
}

export const codecRegistry: readonly CodecDescriptor[] = [
  {
    id: 'heic',
    animation: true,
    lazyBytes: 0,
    supports: ['decode'],
    load: () => import('./platform/heic.js'),
    unavailableReason:
      'This browser does not provide an HEIC decoder. Open the file on a device with HEIC support or export it as JPEG.',
  },
  {
    id: 'jpeg',
    animation: false,
    lazyBytes: 195_000,
    supports: ['decode', 'encode'],
    load: () => import('./jsquash.js'),
  },
  {
    id: 'ico',
    animation: false,
    lazyBytes: 5_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/ico.js'),
    unavailableReason: 'PNG-backed ICO entries are not implemented.',
  },
  {
    id: 'cur',
    animation: false,
    lazyBytes: 5_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/ico.js'),
    unavailableReason: 'PNG-backed CUR entries are not implemented.',
  },
  {
    id: 'qoi',
    animation: false,
    lazyBytes: 12_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/qoi.js'),
  },
  {
    id: 'pnm',
    animation: false,
    lazyBytes: 8_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/pnm.js'),
  },
  {
    id: 'pcx',
    animation: false,
    lazyBytes: 8_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/pcx.js'),
  },
  {
    id: 'pfm',
    animation: false,
    lazyBytes: 5_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/pfm.js'),
  },
  {
    id: 'wbmp',
    animation: false,
    lazyBytes: 4_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/wbmp.js'),
  },
  {
    id: 'xbm',
    animation: false,
    lazyBytes: 4_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/xbm.js'),
  },
  {
    id: 'tga',
    animation: false,
    lazyBytes: 18_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/tga.js'),
  },
  {
    id: 'sun-raster',
    animation: false,
    lazyBytes: 6_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/sun-raster.js'),
  },
  {
    id: 'sgi',
    animation: false,
    lazyBytes: 7_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/sgi.js'),
    unavailableReason: 'SGI RLE decoding is not implemented.',
  },
  {
    id: 'exr',
    animation: false,
    lazyBytes: 72_000,
    supports: ['decode'],
    load: () => import('./third-party/exr.js'),
    unavailableReason: 'OpenEXR encoding is not implemented.',
  },
  {
    id: 'fits',
    animation: false,
    lazyBytes: 7_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/fits.js'),
  },
  {
    id: 'hdr',
    animation: false,
    lazyBytes: 7_000,
    supports: ['decode'],
    load: () => import('./simple/hdr.js'),
    unavailableReason: 'Radiance HDR encoding is not implemented.',
  },
  {
    id: 'png',
    animation: false,
    lazyBytes: 165_000,
    supports: ['decode', 'encode'],
    load: () => import('./jsquash.js'),
  },
  {
    id: 'webp',
    animation: true,
    lazyBytes: 210_000,
    supports: ['decode', 'encode'],
    load: () => import('./jsquash.js'),
  },
  {
    id: 'gif',
    animation: true,
    lazyBytes: 180_000,
    supports: ['decode', 'encode'],
    load: () => import('./third-party/gif.js'),
  },
  {
    id: 'avif',
    animation: true,
    lazyBytes: 1_900_000,
    supports: ['decode', 'encode'],
    load: () => import('./third-party/avif.js'),
  },
  {
    id: 'bmp',
    animation: false,
    lazyBytes: 45_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/bmp.js'),
  },
  {
    id: 'tiff',
    animation: true,
    lazyBytes: 620_000,
    supports: ['decode', 'encode'],
    load: () => import('./third-party/tiff.js'),
  },
  {
    id: 'jxl',
    animation: true,
    lazyBytes: 1_200_000,
    supports: ['decode', 'encode'],
    unavailableReason: 'JPEG XL is awaiting a Vite-compatible lazy WASM wrapper.',
  },
];

export function getCodec(id: FormatId): CodecDescriptor {
  const codec = codecRegistry.find((entry) => entry.id === id);
  if (!codec) throw new Error(`No codec registry entry exists for ${id}.`);
  return codec;
}

export function codecCapabilities(runtime: RuntimeCapabilities): FormatCapability[] {
  return codecRegistry.map((codec) => {
    const browserDecode = runtime.webCodecs && ['jpeg', 'png', 'webp', 'avif'].includes(codec.id);
    return {
      id: codec.id,
      decode: codec.supports.includes('decode')
        ? browserDecode
          ? 'ready'
          : codec.load
            ? 'lazy'
            : 'unavailable'
        : 'unavailable',
      encode: codec.supports.includes('encode')
        ? codec.load
          ? 'lazy'
          : 'unavailable'
        : 'unavailable',
      animation: codec.animation,
      lazyBytes: codec.lazyBytes,
      ...(codec.unavailableReason
        ? { unavailableReason: codec.unavailableReason }
        : codec.load
          ? {}
          : { unavailableReason: 'Codec implementation is not installed yet.' }),
    };
  });
}

export async function loadCodec(id: FormatId, consentLargeDownload = false): Promise<unknown> {
  const codec = getCodec(id);
  if (!codec.load) throw new Error(`${id} is unavailable: ${codec.unavailableReason}`);
  if (codec.lazyBytes > 5_000_000 && !consentLargeDownload) {
    throw new Error(
      `${id} requires a ${(codec.lazyBytes / 1_000_000).toFixed(1)} MB download; explicit consent is required.`,
    );
  }
  return codec.load();
}
