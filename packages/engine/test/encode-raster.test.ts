import { Worker } from 'node:worker_threads';
import { afterAll, describe, expect, it } from 'vitest';
import { createRaster, encodeRaster, productionEncoderFormats } from '../src/index.js';

const worker = new Worker(new URL('./encode-raster-worker.mjs', import.meta.url), {
  type: 'module',
});
afterAll(() => worker.terminate());

function encodeInWorker(): Promise<Record<'jpeg' | 'png' | 'webp', ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once('message', (message) =>
      message.error ? reject(new Error(message.error)) : resolve(message),
    );
    worker.postMessage('encode');
  });
}

describe('production raster encoder', () => {
  it('executes JPEG, PNG, and WebP through the central dispatcher', async () => {
    const output = await encodeInWorker();
    expect(new Uint8Array(output.jpeg).subarray(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(new Uint8Array(output.png).subarray(0, 8)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(new TextDecoder().decode(new Uint8Array(output.webp).subarray(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(new Uint8Array(output.webp).subarray(8, 12))).toBe('WEBP');
  });

  it('rejects unavailable formats with the registry reason', async () => {
    await expect(encodeRaster(createRaster(1, 1), 'qoi')).rejects.toMatchObject({
      kind: 'codec-unavailable',
      format: 'qoi',
      reason: 'The QOI encoder is not wired to the generic production browser exporter.',
      remedy: expect.any(String),
    });
  });

  it('keeps the advertised encoder set equal to the dispatcher set', () => {
    expect(productionEncoderFormats()).toEqual(['jpeg', 'png', 'webp']);
  });
});
