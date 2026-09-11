import type { BayerPattern } from './demosaic.js';

export interface DngMosaic {
  readonly width: number;
  readonly height: number;
  readonly samples: Uint16Array;
  readonly bitDepth: 8 | 16;
  readonly pattern: BayerPattern;
  readonly blackLevel: number;
  readonly whiteLevel: number;
  readonly asShotGains?: readonly [number, number, number];
  readonly colorMatrix?: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
}

type Entry = { readonly type: number; readonly count: number; readonly valueOffset: number };

const typeBytes: Readonly<Record<number, number>> = { 1: 1, 3: 2, 4: 4, 5: 8, 10: 8 };

/** Reads the baseline uncompressed, single-plane CFA subset needed for local DNG development. */
export function parseDngMosaic(input: ArrayBuffer | Uint8Array): DngMosaic {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 8)
    throw {
      kind: 'decode-failed',
      format: 'raw',
      detail: 'DNG file is too short (needs at least 8 bytes).',
      remedy: 'Choose a complete DNG file from a supported camera.',
    };
  const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!littleEndian && !(bytes[0] === 0x4d && bytes[1] === 0x4d))
    throw {
      kind: 'decode-failed',
      format: 'raw',
      detail: 'DNG has an invalid TIFF byte order (expected little or big endian).',
      remedy:
        'Convert the file to DNG using Adobe DNG Converter or export it from your camera software.',
    };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, littleEndian);
  const u32 = (offset: number) => view.getUint32(offset, littleEndian);
  if (u16(2) !== 42)
    throw {
      kind: 'decode-failed',
      format: 'raw',
      detail: 'DNG TIFF magic value is invalid (expected 42).',
      remedy: 'Use a valid DNG produced by Adobe DNG Converter or your camera software.',
    };
  const ifd = u32(4);
  if (ifd > bytes.length - 2) throw new Error('DNG IFD offset is outside the file.');
  const count = u16(ifd);
  if (count > 4096 || ifd + 2 + count * 12 + 4 > bytes.length)
    throw new Error('DNG IFD is truncated or exceeds the safe entry limit.');
  const entries = new Map<number, Entry>();
  for (let index = 0; index < count; index += 1) {
    const offset = ifd + 2 + index * 12;
    entries.set(u16(offset), {
      type: u16(offset + 2),
      count: u32(offset + 4),
      valueOffset: offset + 8,
    });
  }

  const values = (tag: number): number[] => {
    const entry = entries.get(tag);
    if (!entry) return [];
    const size = typeBytes[entry.type];
    if (!size || entry.count > 1_000_000)
      throw new Error(`DNG tag ${tag} has an unsupported type.`);
    const byteLength = size * entry.count;
    const start = byteLength <= 4 ? entry.valueOffset : u32(entry.valueOffset);
    if (start > bytes.length - byteLength)
      throw new Error(`DNG tag ${tag} points outside the file.`);
    return Array.from({ length: entry.count }, (_, index) => {
      const offset = start + index * size;
      if (entry.type === 1) return bytes[offset]!;
      if (entry.type === 3) return u16(offset);
      if (entry.type === 4) return u32(offset);
      const numerator =
        entry.type === 10
          ? view.getInt32(offset, littleEndian)
          : view.getUint32(offset, littleEndian);
      const denominator = u32(offset + 4);
      if (denominator === 0) throw new Error(`DNG tag ${tag} contains a zero denominator.`);
      return numerator / denominator;
    });
  };
  const required = (tag: number, name: string): number => {
    const value = values(tag)[0];
    if (value === undefined) throw new Error(`DNG is missing required ${name} tag ${tag}.`);
    return value;
  };

  const width = required(256, 'ImageWidth');
  const height = required(257, 'ImageLength');
  const bitDepth = required(258, 'BitsPerSample');
  const compression = required(259, 'Compression');
  const photometric = required(262, 'PhotometricInterpretation');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('DNG dimensions are invalid.');
  if (width * height > 100_000_000) throw new Error('DNG dimensions exceed the safe decode limit.');
  if (bitDepth !== 8 && bitDepth !== 16)
    throw new Error('Only 8-bit and 16-bit integer DNG mosaics are supported.');
  if (compression !== 1) throw new Error('Only uncompressed DNG CFA strips are supported.');
  if (photometric !== 32803) throw new Error('Only CFA DNG images are supported.');
  const repeat = values(33421);
  const cfa = values(33422);
  if (repeat[0] !== 2 || repeat[1] !== 2 || cfa.length < 4)
    throw new Error('Only 2×2 Bayer CFA patterns are supported.');
  const pattern = cfa
    .slice(0, 4)
    .map((value) => ['R', 'G', 'B'][value] ?? '?')
    .join('') as BayerPattern;
  if (!['RGGB', 'BGGR', 'GRBG', 'GBRG'].includes(pattern))
    throw new Error('DNG CFA pattern is not a supported Bayer layout.');

  const stripOffsets = values(273);
  const stripByteCounts = values(279);
  if (stripOffsets.length === 0 || stripOffsets.length !== stripByteCounts.length)
    throw new Error('DNG strip offsets and byte counts are missing or inconsistent.');
  const packed = new Uint8Array(stripByteCounts.reduce((sum, value) => sum + value, 0));
  let target = 0;
  for (let index = 0; index < stripOffsets.length; index += 1) {
    const offset = stripOffsets[index]!;
    const length = stripByteCounts[index]!;
    if (offset > bytes.length - length) throw new Error('DNG strip points outside the file.');
    packed.set(bytes.subarray(offset, offset + length), target);
    target += length;
  }
  const expectedBytes = width * height * (bitDepth / 8);
  if (packed.length < expectedBytes) throw new Error('DNG pixel strips are truncated.');
  const samples = new Uint16Array(width * height);
  if (bitDepth === 8) samples.set(packed.subarray(0, samples.length));
  else {
    const packedView = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    for (let index = 0; index < samples.length; index += 1)
      samples[index] = packedView.getUint16(index * 2, littleEndian);
  }

  const neutral = values(50728);
  const gains =
    neutral.length >= 3 && neutral.every((value) => value > 0)
      ? ([1 / neutral[0]!, 1 / neutral[1]!, 1 / neutral[2]!] as const)
      : undefined;
  const matrix = values(50721);
  const colorMatrix =
    matrix.length >= 9
      ? ([
          matrix[0]!,
          matrix[1]!,
          matrix[2]!,
          matrix[3]!,
          matrix[4]!,
          matrix[5]!,
          matrix[6]!,
          matrix[7]!,
          matrix[8]!,
        ] as const)
      : undefined;
  return {
    width,
    height,
    samples,
    bitDepth,
    pattern,
    blackLevel: values(50714)[0] ?? 0,
    whiteLevel: values(50717)[0] ?? 2 ** bitDepth - 1,
    ...(gains ? { asShotGains: gains } : {}),
    ...(colorMatrix ? { colorMatrix } : {}),
  };
}
