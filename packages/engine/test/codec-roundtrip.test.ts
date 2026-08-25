import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

import { afterAll, describe, expect, it } from 'vitest';

const worker = new Worker(new URL('./codec-worker.mjs', import.meta.url), { type: 'module' });
let nextId = 0;

function runCodecJob(): Promise<{
  jpeg: ArrayBuffer;
  webp: ArrayBuffer;
  plainPng: ArrayBuffer;
  png: ArrayBuffer;
  apng: ArrayBuffer;
  favicon: { archive: ArrayBuffer; html: string; manifest: string; fileNames: string[] };
  losslessPng: {
    bytes: ArrayBuffer;
    changed: boolean;
    originalBytes: number;
    optimizedBytes: number;
  };
}> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      worker.off('message', onMessage);
      reject(error);
    };
    const onMessage = (message: {
      id: number;
      error?: string;
      jpeg: ArrayBuffer;
      webp: ArrayBuffer;
      plainPng: ArrayBuffer;
      png: ArrayBuffer;
      apng: ArrayBuffer;
      favicon: { archive: ArrayBuffer; html: string; manifest: string; fileNames: string[] };
      losslessPng: {
        bytes: ArrayBuffer;
        changed: boolean;
        originalBytes: number;
        optimizedBytes: number;
      };
    }) => {
      if (message.id !== id) return;
      worker.off('message', onMessage);
      worker.off('error', onError);
      if (message.error) reject(new Error(message.error));
      else resolve(message);
    };
    worker.on('message', onMessage);
    worker.once('error', onError);
    worker.postMessage({ id });
  });
}

function runCorpusJob(): Promise<{ png: number; jpeg: number; gif: number }> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once(
      'message',
      (message: { error?: string; corpus: { png: number; jpeg: number; gif: number } }) =>
        message.error ? reject(new Error(message.error)) : resolve(message.corpus),
    );
    worker.postMessage({ id, corpus: true });
  });
}

afterAll(() => worker.terminate());

describe('jSquash worker codecs', () => {
  it('decodes JPEG and re-encodes byte-stable WebP in a worker', async () => {
    const first = await runCodecJob();
    const second = await runCodecJob();

    expect(new Uint8Array(first.jpeg).subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
    expect(new TextDecoder().decode(new Uint8Array(first.webp).subarray(0, 4))).toBe('RIFF');
    expect(new Uint8Array(first.webp)).toEqual(new Uint8Array(second.webp));
    expect(new Uint8Array(first.png).subarray(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]));
    expect(first.png.byteLength).toBeLessThanOrEqual(first.plainPng.byteLength);
    expect(first.losslessPng.optimizedBytes).toBeLessThanOrEqual(first.losslessPng.originalBytes);
    expect(new Uint8Array(first.losslessPng.bytes)).toEqual(new Uint8Array(first.png));
    const faviconFiles = unzipSync(new Uint8Array(first.favicon.archive));
    expect(Object.keys(faviconFiles).sort()).toEqual(first.favicon.fileNames);
    expect([...faviconFiles['favicon-32x32.png']!.subarray(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    const digest = (bytes: ArrayBuffer) =>
      createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
    expect({
      jpeg: digest(first.jpeg),
      apng: digest(first.apng),
      png: digest(first.plainPng),
      optimizedPng: digest(first.png),
      webp: digest(first.webp),
      favicon: digest(first.favicon.archive),
    }).toEqual({
      jpeg: 'cc001fbed8797bda726fa8dc3b43f72f205f2716ad2c8c3b671d56b383938a38',
      apng: '309b339bbf13abbf6d32bbf84c3a9145dd9e60fc5965ca327a1027a9ff8beb25',
      png: 'd307f87bcaf95c4d4058338771a8fce6004b456962ca3e945470dedb828a6b1b',
      optimizedPng: '9cdf9196e8fa231160c070325b1911607b899671fad294069be2bdaaf7162061',
      webp: 'ea93240f4ce2156ec6edcd7afa471c077e44a25d4a799bb4aab4baaa45eb5390',
      favicon: '681391c04b364215677b87d3bff1cac4e22ca9e83449eaddd6be08401b30c521',
    });
  }, 30_000);

  it('returns smaller independently pixel-verified output across a 50-file corpus', async () => {
    const counts = await runCorpusJob();
    expect(counts).toEqual({ png: 17, jpeg: 17, gif: 16 });
    expect(counts.png + counts.jpeg + counts.gif).toBe(50);
  }, 60_000);
});
