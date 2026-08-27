import type { RasterImage } from '../../types.js';

export const HEIC_UNSUPPORTED_MESSAGE =
  'This browser does not provide an HEIC decoder. Open the file on a device with HEIC support or export it as JPEG.';

type DecodedFrame = {
  readonly displayWidth: number;
  readonly displayHeight: number;
  copyTo(destination: Uint8Array, options: { format: 'RGBA' }): Promise<void>;
  close(): void;
};

type ImageDecoder = { decode(): Promise<{ image: DecodedFrame }>; close(): void };

export type ImageDecoderConstructor = {
  new (options: { data: ArrayBuffer; type: 'image/heic' | 'image/heif' }): ImageDecoder;
  isTypeSupported?(config: { type: 'image/heic' | 'image/heif' }): Promise<boolean>;
};

type ImageDecoderEnvironment = { readonly ImageDecoder?: ImageDecoderConstructor };
const platform = globalThis as unknown as ImageDecoderEnvironment;

export type HeicMimeType = 'image/heic' | 'image/heif';

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const HEIF_BRANDS = new Set(['mif1', 'msf1']);

function readBrands(bytes: Uint8Array): string[] {
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(4, 8)) !== 'ftyp') return [];
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (size < 16 || size > bytes.length) return [];
  const brands = [String.fromCharCode(...bytes.subarray(8, 12))];
  for (let offset = 16; offset <= size - 4; offset += 4) {
    brands.push(String.fromCharCode(...bytes.subarray(offset, offset + 4)));
  }
  return brands;
}

/** Rejects malformed ISO-BMFF and non-HEIF containers before invoking a platform decoder. */
export function isHeicContainer(input: ArrayBuffer | Uint8Array): boolean {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return readBrands(bytes).some((brand) => HEIC_BRANDS.has(brand) || HEIF_BRANDS.has(brand));
}

/**
 * Selects the platform MIME type from an ISO-BMFF `ftyp` brand. `mif1` and
 * `msf1` are HEIF brands; HEVC-specific brands are HEIC. Unknown input stays
 * HEIC so an installed platform decoder can still provide its own diagnosis.
 */
export function detectHeicMimeType(input: ArrayBuffer | Uint8Array): HeicMimeType {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const brands = readBrands(bytes);
  return brands.some((brand) => HEIC_BRANDS.has(brand)) ? 'image/heic' : 'image/heif';
}

/** Returns whether this browser's installed platform decoder accepts HEIC or HEIF. */
export async function supportsHeicDecode(
  environment: ImageDecoderEnvironment = platform,
): Promise<boolean> {
  const decoder = environment.ImageDecoder;
  if (!decoder) return false;
  if (!decoder.isTypeSupported) return true;
  return (
    (await decoder.isTypeSupported({ type: 'image/heic' })) ||
    (await decoder.isTypeSupported({ type: 'image/heif' }))
  );
}

/** Decodes HEIC through WebCodecs; HEIC encoding is intentionally absent. */
export async function decodeHeic(
  input: ArrayBuffer | Uint8Array,
  decoderConstructor: ImageDecoderConstructor | undefined = platform.ImageDecoder,
): Promise<RasterImage> {
  if (!decoderConstructor) throw new Error(HEIC_UNSUPPORTED_MESSAGE);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!isHeicContainer(bytes)) {
    throw new Error('The selected file is not a valid HEIC or HEIF container.');
  }
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const decoder = new decoderConstructor({ data, type: detectHeicMimeType(bytes) });
  try {
    const { image } = await decoder.decode();
    try {
      const pixels = new Uint8Array(image.displayWidth * image.displayHeight * 4);
      await image.copyTo(pixels, { format: 'RGBA' });
      return {
        width: image.displayWidth,
        height: image.displayHeight,
        colorSpace: 'srgb',
        bitDepth: 8,
        premultipliedAlpha: false,
        frames: [{ data: new Uint8ClampedArray(pixels.buffer), durationMs: 0 }],
      };
    } finally {
      image.close();
    }
  } finally {
    decoder.close();
  }
}
