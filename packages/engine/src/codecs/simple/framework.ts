/** Small, bounds-checked primitives shared by the in-house binary codecs. */
export class BitReader {
  private offset = 0;
  private bitOffset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readBits(count: number): number {
    if (!Number.isInteger(count) || count < 0 || count > 24)
      throw new RangeError('Invalid bit count.');
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      if (this.offset >= this.bytes.length) throw new RangeError('Unexpected end of input.');
      value |= ((this.bytes[this.offset]! >> this.bitOffset) & 1) << index;
      this.bitOffset += 1;
      if (this.bitOffset === 8) {
        this.bitOffset = 0;
        this.offset += 1;
      }
    }
    return value;
  }
}

export class BitWriter {
  private readonly bytes: number[] = [];
  private current = 0;
  private bitOffset = 0;

  writeBits(value: number, count: number): void {
    if (!Number.isInteger(count) || count < 0 || count > 24 || value < 0 || value >= 2 ** count)
      throw new RangeError('Value does not fit in the requested bit count.');
    for (let index = 0; index < count; index += 1) {
      this.current |= ((value >> index) & 1) << this.bitOffset;
      this.bitOffset += 1;
      if (this.bitOffset === 8) {
        this.bytes.push(this.current);
        this.current = 0;
        this.bitOffset = 0;
      }
    }
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bitOffset === 0 ? this.bytes : [...this.bytes, this.current]);
  }
}

export function encodeRle(bytes: Uint8Array): Uint8Array {
  const output: number[] = [];
  for (let offset = 0; offset < bytes.length;) {
    const value = bytes[offset]!;
    let count = 1;
    while (count < 255 && offset + count < bytes.length && bytes[offset + count] === value)
      count += 1;
    output.push(count, value);
    offset += count;
  }
  return Uint8Array.from(output);
}

export function decodeRle(bytes: Uint8Array): Uint8Array {
  if (bytes.length % 2 !== 0) throw new RangeError('Malformed RLE stream.');
  const output: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += 2) {
    const count = bytes[offset]!;
    const value = bytes[offset + 1]!;
    if (count === 0) throw new RangeError('RLE runs may not be empty.');
    output.push(...Array<number>(count).fill(value));
  }
  return Uint8Array.from(output);
}
