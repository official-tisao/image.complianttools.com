import { Worker } from 'node:worker_threads';

import { afterAll, describe, expect, it } from 'vitest';

const worker = new Worker(new URL('./codec-worker.mjs', import.meta.url), { type: 'module' });
let nextId = 0;

function runCodecJob(): Promise<{ jpeg: ArrayBuffer; webp: ArrayBuffer; png: ArrayBuffer }> {
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
      png: ArrayBuffer;
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

afterAll(() => worker.terminate());

describe('jSquash worker codecs', () => {
  it('decodes JPEG and re-encodes byte-stable WebP in a worker', async () => {
    const first = await runCodecJob();
    const second = await runCodecJob();

    expect(new Uint8Array(first.jpeg).subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
    expect(new TextDecoder().decode(new Uint8Array(first.webp).subarray(0, 4))).toBe('RIFF');
    expect(new Uint8Array(first.webp)).toEqual(new Uint8Array(second.webp));
    expect(new Uint8Array(first.png).subarray(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]));
  }, 30_000);
});
