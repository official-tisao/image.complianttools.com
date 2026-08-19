import { describe, expect, it } from 'vitest';

import { decodePsd } from '../src/index.js';

describe('PSD composite decoder', () => {
  it('reads a flattened RGBA composite through the lazy local adapter', async () => {
    const header = new Uint8Array(26);
    header.set(new TextEncoder().encode('8BPS'));
    await expect(
      decodePsd(header, async () => ({
        readPsd: () => ({ width: 1, height: 1, imageData: { data: Uint8Array.of(4, 5, 6, 255) } }),
      })),
    ).resolves.toMatchObject({
      width: 1,
      height: 1,
      frames: [{ data: Uint8ClampedArray.of(4, 5, 6, 255) }],
    });
  });

  it('refuses non-PSD inputs and documents without a flattened RGBA composite', async () => {
    await expect(decodePsd(new Uint8Array())).rejects.toThrow('invalid header');
    const header = new Uint8Array(26);
    header.set(new TextEncoder().encode('8BPS'));
    await expect(
      decodePsd(header, async () => ({ readPsd: () => ({ width: 1, height: 1 }) })),
    ).rejects.toThrow('flattened');
  });
});
