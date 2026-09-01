import { describe, expect, it } from 'vitest';
import {
  BufferTarget,
  BufferSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MATROSKA,
  ALL_FORMATS,
  MkvOutputFormat,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from 'mediabunny';

import {
  demuxMp4FirstVideoSample,
  demuxContainerFirstVideoPacket,
  extractContainerVideoFrame,
  extractVideoFrame,
  patchMp4TrackDimensions,
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

  it('demuxes a real MP4 produced by the pinned local muxer', async () => {
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const source = new EncodedVideoPacketSource('vp9');
    output.addVideoTrack(source);
    await output.start();
    const sample = new Uint8Array([0x82, 0x49, 0x83, 0x42]);
    await source.add(new EncodedPacket(sample, 'key', 0, 1), {
      decoderConfig: {
        codec: 'vp09.00.10.08',
        codedWidth: 2,
        codedHeight: 1,
      },
    });
    await output.finalize();
    expect(target.buffer).toBeInstanceOf(ArrayBuffer);

    const chunk = await demuxMp4FirstVideoSample(new Uint8Array(target.buffer!));
    expect(chunk).toMatchObject({
      config: { codec: 'vp09.00.10.08', codedWidth: 2, codedHeight: 1 },
      data: sample,
      timestamp: 0,
      key: true,
    });
  });

  it('demuxes a real WebM produced by the pinned local muxer', async () => {
    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    const source = new EncodedVideoPacketSource('vp8');
    output.addVideoTrack(source);
    await output.start();
    const sample = new Uint8Array([0x9d, 0x01, 0x2a, 0x02, 0x00, 0x01, 0x00]);
    await source.add(new EncodedPacket(sample, 'key', 0, 1), {
      decoderConfig: { codec: 'vp8', codedWidth: 2, codedHeight: 1 },
    });
    await output.finalize();
    expect(target.buffer).toBeInstanceOf(ArrayBuffer);

    const chunk = await demuxContainerFirstVideoPacket(target.buffer!);
    expect(chunk).toMatchObject({
      config: { codec: 'vp8', codedWidth: 2, codedHeight: 1 },
      data: sample,
      timestamp: 0,
      key: true,
    });

    // Independently confirm that the generated fixture is a parseable WebM track.
    const media = new Input({ formats: ALL_FORMATS, source: new BufferSource(target.buffer!) });
    const track = await media.getPrimaryVideoTrack();
    expect(track).not.toBeNull();
    expect(await new EncodedPacketSink(track!).getFirstPacket()).not.toBeNull();
    media.dispose();
  });

  it('demuxes a real Matroska file produced by the pinned local muxer', async () => {
    const target = new BufferTarget();
    const output = new Output({ format: new MkvOutputFormat(), target });
    const source = new EncodedVideoPacketSource('vp8');
    output.addVideoTrack(source);
    await output.start();
    const sample = new Uint8Array([0x9d, 0x01, 0x2a, 0x02, 0x00, 0x01, 0x00]);
    await source.add(new EncodedPacket(sample, 'key', 0, 1), {
      decoderConfig: { codec: 'vp8', codedWidth: 2, codedHeight: 1 },
    });
    await output.finalize();
    expect(target.buffer).toBeInstanceOf(ArrayBuffer);

    const chunk = await demuxContainerFirstVideoPacket(target.buffer!);
    expect(chunk).toMatchObject({
      config: { codec: 'vp8', codedWidth: 2, codedHeight: 1 },
      data: sample,
      timestamp: 0,
      key: true,
    });

    // Restrict independent format detection to Matroska, excluding the WebM subtype.
    const media = new Input({ formats: [MATROSKA], source: new BufferSource(target.buffer!) });
    const track = await media.getPrimaryVideoTrack();
    expect(track).not.toBeNull();
    expect(await new EncodedPacketSink(track!).getFirstPacket()).not.toBeNull();
    media.dispose();
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

const VIDEO_SAMPLE_ENTRY_TYPES = new Set(['avc1', 'avc3', 'hvc1', 'hev1']);
const CONTAINER_TYPES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'mvex',
  'edts',
  'dinf',
  'udta',
]);

function readMp4Dimensions(bytes: Uint8Array): {
  trackWidth: number;
  trackHeight: number;
  sampleWidth: number;
  sampleHeight: number;
  sampleEntryType: string;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset);
  const u32 = (offset: number) => view.getUint32(offset);
  const typeAt = (offset: number) =>
    String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );

  let trackWidth = 0;
  let trackHeight = 0;
  let sampleWidth = 0;
  let sampleHeight = 0;
  let sampleEntryType = '';

  const walk = (start: number, end: number): void => {
    let position = start;
    while (position + 8 <= end) {
      let size = u32(position);
      let header = 8;
      if (size === 1) {
        size = Number(view.getBigUint64(position + 8));
        header = 16;
      } else if (size === 0) {
        size = end - position;
      }
      if (size < header || position + size > end) break;
      const type = typeAt(position);
      if (type === 'tkhd') {
        const boxStart = position + 8;
        const version = bytes[boxStart];
        const is64 = version === 1;
        let offset = boxStart + 4;
        offset += is64 ? 16 : 8;
        offset += 4 + 4;
        offset += is64 ? 8 : 4;
        offset += 8 + 2 + 2 + 2 + 2 + 36;
        trackWidth = u32(offset) / 65536;
        trackHeight = u32(offset + 4) / 65536;
      } else if (type === 'stsd') {
        walk(position + 16, position + size);
      } else if (VIDEO_SAMPLE_ENTRY_TYPES.has(type)) {
        sampleEntryType = type;
        sampleWidth = u16(position + 32);
        sampleHeight = u16(position + 34);
        walk(position + 86, position + size);
      } else if (CONTAINER_TYPES.has(type)) {
        walk(position + header, position + size);
      }
      position += size;
    }
  };
  walk(0, bytes.byteLength);
  return { trackWidth, trackHeight, sampleWidth, sampleHeight, sampleEntryType };
}

async function muxAvcMp4(
  codedWidth: number,
  codedHeight: number,
  description: Uint8Array,
): Promise<Uint8Array> {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(source);
  await output.start();
  const sample = new Uint8Array([0x65, 0x88, 0x84, 0x00]);
  await source.add(new EncodedPacket(sample, 'key', 0, 120), {
    decoderConfig: {
      codec: 'avc1.64000a',
      codedWidth,
      codedHeight,
      description: description.slice().buffer,
    },
  });
  await output.finalize();
  return new Uint8Array(target.buffer!);
}

describe('MP4 track/sample dimension correction (P2-05a)', () => {
  // A trivially-parseable AVC decoder configuration record so the muxer accepts the AVC track. The
  // SPS payload is not decoded here; only the container boxes are inspected.
  const avcDescription = new Uint8Array([
    0x01, 0x64, 0x00, 0x0a, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x64, 0x00, 0x0a, 0xac, 0xd9, 0x40, 0x78,
    0x01, 0x00, 0x04, 0x68, 0xee, 0x3c, 0x80,
  ]);

  it('forces the track and sample dimensions from a misreported encode', async () => {
    // Simulate a browser encoder (Firefox) that reports 16x160 coded dimensions for a 32x32 output.
    const bytes = await muxAvcMp4(16, 160, avcDescription);
    const before = readMp4Dimensions(bytes);
    expect(before.sampleEntryType).toBe('avc1');
    expect(before.sampleWidth).toBe(16);
    expect(before.sampleHeight).toBe(160);

    const patched = patchMp4TrackDimensions(bytes, 32, 32);
    const after = readMp4Dimensions(patched);
    expect(after).toMatchObject({
      trackWidth: 32,
      trackHeight: 32,
      sampleEntryType: 'avc1',
      sampleWidth: 32,
      sampleHeight: 32,
    });
  });

  it('is a no-op when the encoder already reports the requested dimensions', async () => {
    const bytes = await muxAvcMp4(32, 32, avcDescription);
    const patched = patchMp4TrackDimensions(bytes, 32, 32);
    expect(readMp4Dimensions(patched)).toMatchObject({
      trackWidth: 32,
      trackHeight: 32,
      sampleWidth: 32,
      sampleHeight: 32,
    });
  });

  it('rejects non-positive or non-integer dimensions', async () => {
    const bytes = await muxAvcMp4(32, 32, avcDescription);
    expect(() => patchMp4TrackDimensions(bytes, 0, 32)).toThrow(/positive integers/);
    expect(() => patchMp4TrackDimensions(bytes, 1.5, 32)).toThrow(/positive integers/);
    expect(() => patchMp4TrackDimensions(bytes, 33, 32)).toThrow(/must be even/);
  });
});
