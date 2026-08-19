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
    id: 'jpeg',
    animation: false,
    lazyBytes: 195_000,
    supports: ['decode', 'encode'],
    load: () => import('./jsquash.js'),
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
    id: 'tga',
    animation: false,
    lazyBytes: 18_000,
    supports: ['decode', 'encode'],
    load: () => import('./simple/tga.js'),
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
    supports: ['decode'],
    load: () => import('./third-party/gif.js'),
    unavailableReason: 'GIF encoding is scheduled separately in P2-05.',
  },
  {
    id: 'avif',
    animation: true,
    lazyBytes: 1_900_000,
    supports: ['decode', 'encode'],
    unavailableReason: 'AVIF is awaiting a Vite-compatible lazy WASM wrapper.',
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
