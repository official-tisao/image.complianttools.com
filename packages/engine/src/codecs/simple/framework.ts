/** Small, bounds-checked primitives shared by the in-house binary codecs. */
export type HeaderField = Readonly<{
  readonly name: string;
  readonly offset: number;
  readonly type: 'u8' | 'u16' | 'u32' | 'i16' | 'i32';
  readonly littleEndian?: boolean;
}>;

/** Reads fixed-layout binary headers from a small declarative descriptor. */
export function readHeader(
  input: ArrayBuffer | Uint8Array,
  fields: readonly HeaderField[],
): Readonly<Record<string, number>> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header: Record<string, number> = {};
  for (const field of fields) {
    const size = field.type === 'u8' ? 1 : field.type.endsWith('16') ? 2 : 4;
    if (
      !Number.isInteger(field.offset) ||
      field.offset < 0 ||
      field.offset > view.byteLength - size
    )
      throw new RangeError(`Header field ${field.name} is outside the input.`);
    const littleEndian = field.littleEndian ?? false;
    header[field.name] =
      field.type === 'u8'
        ? view.getUint8(field.offset)
        : field.type === 'u16'
          ? view.getUint16(field.offset, littleEndian)
          : field.type === 'u32'
            ? view.getUint32(field.offset, littleEndian)
            : field.type === 'i16'
              ? view.getInt16(field.offset, littleEndian)
              : view.getInt32(field.offset, littleEndian);
  }
  return header;
}

/** Retrieves a required declarative header value with an explicit type guard. */
export function requiredHeaderValue(
  header: Readonly<Record<string, number>>,
  name: string,
): number {
  const value = header[name];
  if (value === undefined) throw new RangeError(`Header field ${name} is missing.`);
  return value;
}

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
