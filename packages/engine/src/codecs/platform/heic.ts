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
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const decoder = new decoderConstructor({ data, type: 'image/heic' });
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
