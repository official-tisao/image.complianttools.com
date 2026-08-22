import { describe, expect, it } from 'vitest';

import {
  createRaster,
  decodeDds,
  decodeWithTypedErrors,
  encodeDds,
  encodeDdsBc1,
  isEngineError,
} from '../src/index.js';

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

function bc4Fixture(): Uint8Array {
  const bytes = new Uint8Array(136);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('DDS '));
  view.setUint32(4, 124, true);
  view.setUint32(12, 4, true);
  view.setUint32(16, 4, true);
  view.setUint32(76, 32, true);
  bytes.set(new TextEncoder().encode('ATI1'), 84);
  // Endpoint 0 is selected for every pixel because the six index bytes stay zero.
  bytes.set([200, 0], 128);
  return bytes;
}

function bc5Fixture(): Uint8Array {
  const bytes = new Uint8Array(144);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('DDS '));
  view.setUint32(4, 124, true);
  view.setUint32(12, 4, true);
  view.setUint32(16, 4, true);
  view.setUint32(76, 32, true);
  bytes.set(new TextEncoder().encode('ATI2'), 84);
  // The first two BC4 blocks encode red=200 and green=100 at selector zero.
  bytes.set([200, 0, 0, 0, 0, 0, 0, 0, 100, 0], 128);
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

  it('decodes BC4 values as grayscale RGBA', () => {
    expect(decodeDds(bc4Fixture()).frames[0].data.subarray(0, 4)).toEqual(
      new Uint8ClampedArray([200, 200, 200, 255]),
    );
  });

  it('decodes BC5 channels as red-green RGBA', () => {
    expect(decodeDds(bc5Fixture()).frames[0].data.subarray(0, 4)).toEqual(
      new Uint8ClampedArray([200, 100, 0, 255]),
    );
  });

  it('rejects truncated textures and unsupported DDS compression', () => {
    expect(() => decodeDds(dxt1Fixture().subarray(0, -1))).toThrow('truncated');
    const unsupported = dxt1Fixture();
    unsupported.set(new TextEncoder().encode('BC7 '), 84);
    expect(() => decodeDds(unsupported)).toThrow('Only safe');
  });

  it('normalizes malformed DDS input into a typed remediable error', async () => {
    try {
      await decodeWithTypedErrors('dds', () => decodeDds(new Uint8Array([0x44, 0x44, 0x53])));
      throw new Error('DDS unexpectedly accepted malformed input.');
    } catch (error) {
      expect(isEngineError(error)).toBe(true);
      expect(error).toMatchObject({
        kind: 'decode-failed',
        format: 'dds',
        remedy: expect.any(String),
      });
    }
  });

  it('encodes an opaque BC1 texture that decodes to its quantized colours', () => {
    const red = new Uint8ClampedArray(4 * 4 * 4);
    for (let offset = 0; offset < red.length; offset += 4) red.set([255, 0, 0, 255], offset);
    const encoded = encodeDdsBc1(createRaster(4, 4, red));
    const bytes = new Uint8Array(encoded);
    expect(new TextDecoder().decode(bytes.subarray(84, 88))).toBe('DXT1');
    expect(decodeDds(encoded).frames[0].data).toEqual(red);
  });

  it('preserves binary transparency through BC1 encoding', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4)
      pixels.set(offset === 0 ? [0, 0, 0, 0] : [0, 255, 0, 255], offset);
    const decoded = decodeDds(encodeDdsBc1(createRaster(4, 4, pixels)));
    expect(decoded.frames[0].data.subarray(0, 4)).toEqual(new Uint8ClampedArray([0, 0, 0, 0]));
    expect(decoded.frames[0].data.subarray(4, 8)).toEqual(new Uint8ClampedArray([0, 255, 0, 255]));
  });

  it.each([
    ['bc2', 'DXT3'],
    ['bc3', 'DXT5'],
    ['bc4', 'ATI1'],
    ['bc5', 'ATI2'],
  ] as const)('encodes and decodes %s blocks', (variant, fourCc) => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (let index = 0; index < 16; index += 1)
      pixels.set([index * 17, 255 - index * 17, 0, index * 17], index * 4);
    const encoded = encodeDds(createRaster(4, 4, pixels), variant);
    expect(new TextDecoder().decode(new Uint8Array(encoded, 84, 4))).toBe(fourCc);
    const decoded = decodeDds(encoded).frames[0].data;
    expect(decoded).toHaveLength(pixels.length);
    expect(decoded[0]).toBeLessThanOrEqual(36);
    if (variant === 'bc2' || variant === 'bc3') {
      expect(decoded[3]).toBe(0);
      expect(decoded[63]).toBe(255);
    } else expect(decoded[3]).toBe(255);
    if (variant === 'bc5') expect(decoded[1]).toBeGreaterThanOrEqual(219);
  });
});
