import { describe, expect, it } from 'vitest';

import { decodeDds } from '../src/index.js';

function dxt1Fixture(): Uint8Array {
  const bytes = new Uint8Array(136);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('DDS '));
  view.setUint32(4, 124, true);
  view.setUint32(12, 4, true);
  view.setUint32(16, 4, true);
  view.setUint32(76, 32, true);
  bytes.set(new TextEncoder().encode('DXT1'), 84);
  view.setUint16(128, 0xf800, true); // red
  view.setUint16(130, 0x001f, true); // blue
  view.setUint32(132, 0, true);
  return bytes;
}

function dxt5Fixture(): Uint8Array {
  const bytes = new Uint8Array(144);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('DDS '));
  view.setUint32(4, 124, true);
  view.setUint32(12, 4, true);
  view.setUint32(16, 4, true);
  view.setUint32(76, 32, true);
  bytes.set(new TextEncoder().encode('DXT5'), 84);
  bytes.set([255, 0], 128);
  view.setUint16(136, 0xf800, true);
  view.setUint16(138, 0x001f, true);
  return bytes;
}

describe('DDS DXT1 codec', () => {
  it('decodes a single DXT1/BC1 block', () => {
    expect(decodeDds(dxt1Fixture()).frames[0].data.subarray(0, 4)).toEqual(
      new Uint8ClampedArray([255, 0, 0, 255]),
    );
  });

  it('decodes DXT5/BC3 alpha and colour blocks', () => {
    expect(decodeDds(dxt5Fixture()).frames[0].data.subarray(0, 4)).toEqual(
      new Uint8ClampedArray([255, 0, 0, 255]),
    );
  });

  it('rejects truncated textures and unsupported DDS compression', () => {
    expect(() => decodeDds(dxt1Fixture().subarray(0, -1))).toThrow('truncated');
    const unsupported = dxt1Fixture();
    unsupported.set(new TextEncoder().encode('BC7 '), 84);
    expect(() => decodeDds(unsupported)).toThrow('Only safe');
  });
});
