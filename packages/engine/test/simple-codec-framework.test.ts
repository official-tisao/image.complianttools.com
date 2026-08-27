import { describe, expect, it } from 'vitest';

import {
  BitReader,
  BitWriter,
  decodeRle,
  encodeRle,
  readHeader,
  requiredHeaderValue,
} from '../src/codecs/simple/framework.js';

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

  it('reads declarative big- and little-endian fixed headers safely', () => {
    const bytes = new Uint8Array([0x12, 0x34, 0xfe, 0xff, 0, 0, 0, 4]);
    expect(
      readHeader(bytes, [
        { name: 'big', offset: 0, type: 'u16' },
        { name: 'littleSigned', offset: 2, type: 'i16', littleEndian: true },
        { name: 'length', offset: 4, type: 'u32' },
      ]),
    ).toEqual({ big: 0x1234, littleSigned: -2, length: 4 });
    expect(() => readHeader(bytes, [{ name: 'bad', offset: 7, type: 'u16' }])).toThrow('outside');
    expect(() => requiredHeaderValue({}, 'missing')).toThrow('missing');
  });
});
