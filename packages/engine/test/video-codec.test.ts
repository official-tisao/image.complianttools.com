import { describe, expect, it } from 'vitest';

import {
  demuxMp4FirstVideoSample,
  extractContainerVideoFrame,
  extractVideoFrame,
  supportsVideoDecoder,
  type VideoDecoderConstructor,
} from '../src/index.js';

describe('platform video frame extraction', () => {
  it('turns a browser-local MP4 or WebM container frame into an engine raster', async () => {
    const frame = await extractContainerVideoFrame(
      new Blob([new Uint8Array([1])], { type: 'video/webm' }),
      2.5,
      async () => ({
        async readFirstFrame(_input, timestampSeconds) {
          expect(timestampSeconds).toBe(2.5);
          return { width: 1, height: 1, pixels: new Uint8ClampedArray([1, 2, 3, 255]) };
        },
      }),
    );
    expect(frame.frames[0]?.data).toEqual(new Uint8ClampedArray([1, 2, 3, 255]));
    await expect(extractContainerVideoFrame(new Blob(), -1)).rejects.toThrow('non-negative');
  });

  it('demuxes the first local MP4 video sample without bundling a decoder', async () => {
    let appended: (ArrayBuffer & { fileStart: number }) | undefined;
    const chunk = await demuxMp4FirstVideoSample(new Uint8Array([1, 2, 3]), async () => ({
      createFile: () => {
        const file: {
          onReady?: (info: {
            videoTracks: Array<{
              id: number;
              codec: string;
              timescale: number;
              video: { width: number; height: number };
              avcDecoderConfigRecord: ArrayBuffer;
            }>;
          }) => void;
          onSamples?: (id: number, user: unknown, samples: Array<unknown>) => void;
          setExtractionOptions(id: number): void;
          start(): void;
          appendBuffer(buffer: ArrayBuffer & { fileStart: number }): number;
          flush(): void;
        } = {
          setExtractionOptions(id) {
            expect(id).toBe(7);
          },
          start() {
            file.onSamples?.(7, undefined, [
              { cts: 90, timescale: 90, data: new Uint8Array([4, 5]), is_sync: true },
            ]);
          },
          appendBuffer(buffer) {
            appended = buffer;
            file.onReady?.({
              videoTracks: [
                {
                  id: 7,
                  codec: 'avc1.64001f',
                  timescale: 90,
                  video: { width: 2, height: 1 },
                  avcDecoderConfigRecord: new Uint8Array([1, 100]).buffer,
                },
              ],
            });
            return 3;
          },
          flush() {},
        };
        return file;
      },
    }));
    expect(appended?.fileStart).toBe(0);
    expect(chunk).toMatchObject({
      config: { codec: 'avc1.64001f', codedWidth: 2, codedHeight: 1 },
      data: new Uint8Array([4, 5]),
      timestamp: 1_000_000,
      key: true,
    });
    expect(chunk.config.description).toEqual(new Uint8Array([1, 100]).buffer);
  });

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
