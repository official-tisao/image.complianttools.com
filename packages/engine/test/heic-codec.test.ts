import { describe, expect, it } from 'vitest';

import {
  decodeHeic,
  HEIC_UNSUPPORTED_MESSAGE,
  supportsHeicDecode,
  type ImageDecoderConstructor,
} from '../src/index.js';

describe('HEIC platform codec', () => {
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
    const decoder = class {
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
    const decoded = await decodeHeic(new Uint8Array([1]), decoder);
    expect(decoded.frames[0].data).toEqual(new Uint8ClampedArray([4, 5, 6, 255]));
    expect(closed).toBe(2);
  });

  it('names the platform limitation when ImageDecoder is unavailable', async () => {
    await expect(decodeHeic(new Uint8Array([1]), undefined)).rejects.toThrow(
      HEIC_UNSUPPORTED_MESSAGE,
    );
  });
});
