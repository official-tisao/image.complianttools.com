import { describe, expect, it } from 'vitest';

import {
  extractVideoFrame,
  supportsVideoDecoder,
  type VideoDecoderConstructor,
} from '../src/index.js';

describe('platform video frame extraction', () => {
  it('probes per-codec capability and turns an output frame into a raster', async () => {
    const decoder = class {
      private callbacks!: {
        output(frame: {
          displayWidth: number;
          displayHeight: number;
          copyTo(dest: Uint8Array): Promise<void>;
          close(): void;
        }): void;
      };
      constructor(callbacks: typeof this.callbacks) {
        this.callbacks = callbacks;
      }
      static async isConfigSupported(config: { codec: string }) {
        return { supported: config.codec === 'vp09.00.10.08' };
      }
      configure(): void {}
      decode(): void {
        this.callbacks.output({
          displayWidth: 1,
          displayHeight: 1,
          async copyTo(dest) {
            dest.set([9, 8, 7, 255]);
          },
          close() {},
        });
      }
      async flush(): Promise<void> {}
      close(): void {}
    } as unknown as VideoDecoderConstructor;
    await expect(
      supportsVideoDecoder({ codec: 'vp09.00.10.08' }, { VideoDecoder: decoder }),
    ).resolves.toBe(true);
    const frame = await extractVideoFrame(
      new Uint8Array([1]),
      { codec: 'vp09.00.10.08' },
      {},
      decoder,
    );
    expect(frame.frames[0].data).toEqual(new Uint8ClampedArray([9, 8, 7, 255]));
  });
});
