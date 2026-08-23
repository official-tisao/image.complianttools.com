import { describe, expect, it } from 'vitest';

import { decodePsd } from '../src/index.js';

function uncompressedPsbFixture(): Uint8Array {
  const bytes = new Uint8Array(50);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('8BPS'));
  view.setUint16(4, 2); // PSB version
  view.setUint16(12, 3); // RGB channels
  view.setUint32(14, 1); // height
  view.setUint32(18, 2); // width
  view.setUint16(22, 8);
  view.setUint16(24, 3); // RGB colour mode
  // Empty colour-mode and image-resource sections use 32-bit lengths; PSB layer data is 64-bit.
  view.setBigUint64(34, 0n);
  view.setUint16(42, 0); // raw planar composite
  bytes.set([40, 70, 50, 80, 60, 90], 44);
  return bytes;
}

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

  it('reads a standards-structured PSB v2 planar composite through the production adapter', async () => {
    await expect(decodePsd(uncompressedPsbFixture())).resolves.toMatchObject({
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
