import { describe, expect, it } from 'vitest';

import {
  decodeHeic,
  detectHeicMimeType,
  HEIC_UNSUPPORTED_MESSAGE,
  supportsHeicDecode,
  type ImageDecoderConstructor,
} from '../src/index.js';

describe('HEIC platform codec', () => {
  it('selects HEIF for generic ISO-BMFF HEIF brands and HEIC otherwise', () => {
    expect(
      detectHeicMimeType(
        new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31]),
      ),
    ).toBe('image/heif');
    expect(
      detectHeicMimeType(
        new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
      ),
    ).toBe('image/heic');
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
      new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31]),
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
});
