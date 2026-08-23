import { describe, expect, it } from 'vitest';

import { decodePsd } from '../src/index.js';

describe('PSD composite decoder', () => {
  it('reads a real flattened PSD composite through the production adapter', async () => {
    // Generated locally by pinned ag-psd 31.0.2 from two opaque RGB pixels with RLE compression.
    const bytes = Uint8Array.from(
      Buffer.from(
        'OEJQUwABAAAAAAAAAAMAAAABAAAAAgAIAAMAAAAAAAAAHDhCSU0EAgAAAAAAAgAAOEJJTQQwAAAAAAABAQAAAABYAAAAUAABAAAAAAAAAAAAAAAAAAAAAAAE//8AAAACAAAAAAACAAEAAAACAAIAAAACOEJJTW5vcm3/AAgAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAMAAwADAShGATJQATxa',
        'base64',
      ),
    );
    await expect(decodePsd(bytes)).resolves.toMatchObject({
      width: 2,
      height: 1,
      frames: [{ data: Uint8ClampedArray.of(40, 50, 60, 255, 70, 80, 90, 255) }],
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
