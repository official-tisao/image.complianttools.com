import { describe, expect, it } from 'vitest';

import {
  decodeHeic,
  detectHeicMimeType,
  HEIC_UNSUPPORTED_MESSAGE,
  isHeicContainer,
  supportsHeicDecode,
  type ImageDecoderConstructor,
} from '../src/index.js';

describe('HEIC platform codec', () => {
  it('selects HEIF for generic ISO-BMFF HEIF brands and HEIC otherwise', () => {
    expect(
      detectHeicMimeType(
        new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0, 0, 0, 0]),
      ),
    ).toBe('image/heif');
    expect(
      detectHeicMimeType(
        new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]),
      ),
    ).toBe('image/heic');
  });

  it('accepts HEIF-compatible brands and rejects malformed or AVIF containers', () => {
    expect(
      isHeicContainer(
        new Uint8Array([
          0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0, 0, 0, 0, 0x68, 0x65, 0x69,
          0x63,
        ]),
      ),
    ).toBe(true);
    expect(
      isHeicContainer(
        new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0]),
      ),
    ).toBe(false);
    expect(isHeicContainer(new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it('probes supported HEIC and HEIF platform decoders', async () => {
    const decoder = class {
      static async isTypeSupported({ type }: { type: string }): Promise<boolean> {
        return type === 'image/heif';
      }
      close(): void {}
      async decode(): Promise<never> {
        throw new Error('not reached');
      }
    } as unknown as ImageDecoderConstructor;
    await expect(supportsHeicDecode({ ImageDecoder: decoder })).resolves.toBe(true);
    await expect(supportsHeicDecode({})).resolves.toBe(false);
  });

  it('treats the presence of an ImageDecoder constructor as proof of support when isTypeSupported is missing', async () => {
    const decoder = class {
      close(): void {}
      async decode(): Promise<never> {
        throw new Error('not reached');
      }
    } as unknown as ImageDecoderConstructor;
    await expect(supportsHeicDecode({ ImageDecoder: decoder })).resolves.toBe(true);
  });

  it('reports both HEIC and HEIF as unsupported when isTypeSupported rejects both', async () => {
    const decoder = class {
      static async isTypeSupported(): Promise<boolean> {
        return false;
      }
      close(): void {}
      async decode(): Promise<never> {
        throw new Error('not reached');
      }
    } as unknown as ImageDecoderConstructor;
    await expect(supportsHeicDecode({ ImageDecoder: decoder })).resolves.toBe(false);
  });

  it('copies decoded platform pixels into a raster and closes resources', async () => {
    let closed = 0;
    let type = '';
    const decoder = class {
      constructor(options: { type: string }) {
        type = options.type;
      }
      close(): void {
        closed += 1;
      }
      async decode() {
        return {
          image: {
            displayWidth: 1,
            displayHeight: 1,
            async copyTo(destination: Uint8Array): Promise<void> {
              destination.set([4, 5, 6, 255]);
            },
            close(): void {
              closed += 1;
            },
          },
        };
      }
    } as unknown as ImageDecoderConstructor;
    const decoded = await decodeHeic(
      new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0, 0, 0, 0]),
      decoder,
    );
    expect(decoded.frames[0].data).toEqual(new Uint8ClampedArray([4, 5, 6, 255]));
    expect(closed).toBe(2);
    expect(type).toBe('image/heif');
  });

  it('names the platform limitation when ImageDecoder is unavailable', async () => {
    await expect(decodeHeic(new Uint8Array([1]), undefined)).rejects.toThrow(
      HEIC_UNSUPPORTED_MESSAGE,
    );
  });

  it('rejects a non-HEIF container before constructing the platform decoder', async () => {
    let constructed = false;
    const decoder = class {
      constructor() {
        constructed = true;
      }
      close(): void {}
      async decode(): Promise<never> {
        throw new Error('not reached');
      }
    } as unknown as ImageDecoderConstructor;
    await expect(decodeHeic(new Uint8Array([1, 2, 3]), decoder)).rejects.toThrow(
      'not a valid HEIC or HEIF container',
    );
    expect(constructed).toBe(false);
  });
});
