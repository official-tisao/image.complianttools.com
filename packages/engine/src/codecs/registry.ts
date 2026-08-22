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
  readonly decodeUnavailableReason?: string;
  readonly encodeUnavailableReason?: string;
  readonly requiresWebCodecsDecode?: boolean;
}

export const codecRegistry: readonly CodecDescriptor[] = [
  {
    id: 'heic',
    animation: true,
    lazyBytes: 0,
    supports: ['decode'],
    load: () => import('./platform/heic.js'),
    requiresWebCodecsDecode: true,
    decodeUnavailableReason:
      'This browser does not provide an HEIC decoder. Open the file on a device with HEIC support or export it as JPEG.',
    encodeUnavailableReason:
      'HEIC encoding is deliberately excluded because HEVC has active patent pools and available browser encoders are GPL or commercial.',
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
    supports: ['decode'],
    load: () => import('./simple/ico.js'),
    unavailableReason: 'PNG-backed ICO entries are not implemented.',
    encodeUnavailableReason: 'ICO encoding is not available in the production browser export path.',
  },
  {
    id: 'cur',
    animation: false,
    lazyBytes: 5_000,
    supports: ['decode'],
    load: () => import('./simple/ico.js'),
    unavailableReason: 'PNG-backed CUR entries are not implemented.',
    encodeUnavailableReason: 'CUR encoding is not available in the production browser export path.',
  },
  {
    id: 'dds',
    animation: false,
    lazyBytes: 8_000,
    supports: ['decode'],
    load: () => import('./simple/dds.js'),
    unavailableReason: 'DDS encoding and BC6H/BC7 variants are not implemented.',
    encodeUnavailableReason: 'DDS encoding and BC6H/BC7 variants are not implemented.',
  },
  {
    id: 'qoi',
    animation: false,
    lazyBytes: 12_000,
    supports: ['decode'],
    load: () => import('./simple/qoi.js'),
    encodeUnavailableReason: 'QOI encoding is not available in the production browser export path.',
  },
  {
    id: 'pnm',
    animation: false,
    lazyBytes: 8_000,
    supports: ['decode'],
    load: () => import('./simple/pnm.js'),
    encodeUnavailableReason: 'PNM encoding is not available in the production browser export path.',
  },
  {
    id: 'pcx',
    animation: false,
    lazyBytes: 8_000,
    supports: ['decode'],
    load: () => import('./simple/pcx.js'),
    encodeUnavailableReason: 'PCX encoding is not available in the production browser export path.',
  },
  {
    id: 'pfm',
    animation: false,
    lazyBytes: 5_000,
    supports: ['decode'],
    load: () => import('./simple/pfm.js'),
    encodeUnavailableReason: 'PFM encoding is not available in the production browser export path.',
  },
  {
    id: 'psd',
    animation: false,
    lazyBytes: 350_000,
    supports: ['decode'],
    load: () => import('../documents/psd.js'),
    unavailableReason:
      'PSD/PSB export is not implemented; the flattened local composite can be read.',
    encodeUnavailableReason:
      'PSD/PSB export is not implemented; the flattened local composite can be read.',
  },
  {
    id: 'svg',
    animation: false,
    lazyBytes: 2_400_000,
    supports: ['decode'],
    load: () => import('./svg/rasterize.js'),
  },
  {
    id: 'wbmp',
    animation: false,
    lazyBytes: 4_000,
    supports: ['decode'],
    load: () => import('./simple/wbmp.js'),
    encodeUnavailableReason:
      'WBMP encoding is not available in the production browser export path.',
  },
  {
    id: 'xbm',
    animation: false,
    lazyBytes: 4_000,
    supports: ['decode'],
    load: () => import('./simple/xbm.js'),
    encodeUnavailableReason: 'XBM encoding is not available in the production browser export path.',
  },
  {
    id: 'tga',
    animation: false,
    lazyBytes: 18_000,
    supports: ['decode'],
    load: () => import('./simple/tga.js'),
    encodeUnavailableReason: 'TGA encoding is not available in the production browser export path.',
  },
  {
    id: 'sun-raster',
    animation: false,
    lazyBytes: 6_000,
    supports: ['decode'],
    load: () => import('./simple/sun-raster.js'),
    encodeUnavailableReason:
      'Sun Raster encoding is not available in the production browser export path.',
  },
  {
    id: 'sgi',
    animation: false,
    lazyBytes: 7_000,
    supports: ['decode'],
    load: () => import('./simple/sgi.js'),
    unavailableReason: 'SGI RLE decoding is not implemented.',
    encodeUnavailableReason: 'SGI encoding is not available in the production browser export path.',
  },
  {
    id: 'exr',
    animation: false,
    lazyBytes: 72_000,
    supports: ['decode'],
    load: () => import('./third-party/exr.js'),
    unavailableReason: 'OpenEXR encoding is not implemented.',
    encodeUnavailableReason:
      'OpenEXR encoding is unavailable in v1 because no maintained permissive browser WASM distribution is available; a vendored TinyEXR build has not been produced and verified.',
  },
  {
    id: 'fits',
    animation: false,
    lazyBytes: 7_000,
    supports: ['decode'],
    load: () => import('./simple/fits.js'),
    encodeUnavailableReason:
      'FITS encoding is not available in the production browser export path.',
  },
  {
    id: 'hdr',
    animation: false,
    lazyBytes: 7_000,
    supports: ['decode'],
    load: () => import('./simple/hdr.js'),
    encodeUnavailableReason: 'HDR encoding is not available in the production browser export path.',
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
    encodeUnavailableReason: 'GIF encoding is not available in the production browser export path.',
  },
  {
    id: 'avif',
    animation: true,
    lazyBytes: 1_900_000,
    supports: ['decode'],
    load: () => import('./third-party/avif-decode.js'),
    unavailableReason:
      'AVIF encoding is not offered until its worker build can be delivered and verified in production.',
    encodeUnavailableReason:
      'AVIF encoding is not offered until its worker build can be delivered and verified in production.',
  },
  {
    id: 'bmp',
    animation: false,
    lazyBytes: 45_000,
    supports: ['decode'],
    load: () => import('./simple/bmp.js'),
    encodeUnavailableReason: 'BMP encoding is not available in the production browser export path.',
  },
  {
    id: 'tiff',
    animation: true,
    lazyBytes: 620_000,
    supports: ['decode'],
    load: () => import('./third-party/tiff.js'),
    encodeUnavailableReason:
      'TIFF encoding is not available in the production browser export path.',
  },
  {
    id: 'jxl',
    animation: true,
    lazyBytes: 1_200_000,
    supports: ['decode'],
    load: () => import('./third-party/jxl-decode.js'),
    unavailableReason:
      'JPEG XL encoding is not offered until its worker build can be delivered and verified in production.',
    encodeUnavailableReason:
      'JPEG XL encoding is not offered until its worker build can be delivered and verified in production.',
  },
];

export function getCodec(id: FormatId): CodecDescriptor {
  const codec = codecRegistry.find((entry) => entry.id === id);
  if (!codec) throw new Error(`No codec registry entry exists for ${id}.`);
  return codec;
}

export function productionEncoderFormats(): FormatId[] {
  return codecRegistry
    .filter((codec) => codec.supports.includes('encode'))
    .map((codec) => codec.id);
}

export function codecCapabilities(runtime: RuntimeCapabilities): FormatCapability[] {
  return codecRegistry.map((codec) => {
    const browserDecode = runtime.webCodecs && ['jpeg', 'png', 'webp', 'avif'].includes(codec.id);
    const platformDecodeUnavailable = codec.requiresWebCodecsDecode && !runtime.webCodecs;
    const decode = codec.supports.includes('decode')
      ? platformDecodeUnavailable
        ? 'unavailable'
        : browserDecode
          ? 'ready'
          : codec.load
            ? 'lazy'
            : 'unavailable'
      : 'unavailable';
    const encode = codec.supports.includes('encode')
      ? codec.load
        ? 'lazy'
        : 'unavailable'
      : 'unavailable';
    return {
      id: codec.id,
      decode,
      encode,
      animation: codec.animation,
      lazyBytes: codec.lazyBytes,
      ...(decode === 'unavailable' && codec.decodeUnavailableReason
        ? { decodeUnavailableReason: codec.decodeUnavailableReason }
        : {}),
      ...(encode === 'unavailable' && codec.encodeUnavailableReason
        ? { encodeUnavailableReason: codec.encodeUnavailableReason }
        : {}),
      ...(decode === 'unavailable' && codec.decodeUnavailableReason
        ? { unavailableReason: codec.decodeUnavailableReason }
        : encode === 'unavailable' && codec.encodeUnavailableReason
          ? { unavailableReason: codec.encodeUnavailableReason }
          : codec.unavailableReason
            ? { unavailableReason: codec.unavailableReason }
            : !codec.load
              ? { unavailableReason: 'Codec implementation is not installed yet.' }
              : {}),
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
