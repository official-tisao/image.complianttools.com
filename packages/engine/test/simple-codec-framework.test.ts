import { describe, expect, it } from 'vitest';

import { BitReader, BitWriter, decodeRle, encodeRle } from '../src/codecs/simple/framework.js';

describe('P2 simple codec framework', () => {
  it('round-trips packed bits and RLE data', () => {
    const writer = new BitWriter();
    writer.writeBits(5, 3);
    writer.writeBits(17, 5);
    const reader = new BitReader(writer.finish());
    expect(reader.readBits(3)).toBe(5);
    expect(reader.readBits(5)).toBe(17);

    const source = Uint8Array.from([7, 7, 7, 2, 2, 9]);
    expect(decodeRle(encodeRle(source))).toEqual(source);
  });

  it('rejects malformed input', () => {
    expect(() => new BitReader(new Uint8Array()).readBits(1)).toThrow('end of input');
    expect(() => decodeRle(Uint8Array.from([1]))).toThrow('Malformed');
  });
});
