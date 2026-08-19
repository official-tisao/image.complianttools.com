export type MetadataTag = {
  readonly namespace: string;
  readonly name: string;
  readonly value: string;
};
export type ReadableMetadata = {
  readonly format: 'png' | 'gif' | 'jpeg';
  readonly tags: readonly MetadataTag[];
};

const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const metadataChunks = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'iCCP']);
const latin1 = new TextDecoder('latin1');

function matches(input: Uint8Array, signature: Uint8Array): boolean {
  return signature.every((value, index) => input[index] === value);
}

function pngChunks(
  input: Uint8Array,
): { type: string; data: Uint8Array; start: number; end: number }[] {
  if (!matches(input, pngSignature))
    throw new Error('PNG metadata requires a valid PNG signature.');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const chunks: { type: string; data: Uint8Array; start: number; end: number }[] = [];
  for (let offset = 8; offset < input.length;) {
    if (offset > input.length - 12) throw new Error('PNG contains a truncated chunk header.');
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > input.length) throw new Error('PNG contains a truncated chunk payload.');
    const type = latin1.decode(input.subarray(offset + 4, offset + 8));
    chunks.push({
      type,
      data: input.subarray(offset + 8, offset + 8 + length),
      start: offset,
      end,
    });
    offset = end;
  }
  return chunks;
}

function readPng(input: Uint8Array): ReadableMetadata {
  const tags: MetadataTag[] = [];
  for (const chunk of pngChunks(input)) {
    if (chunk.type === 'tEXt') {
      const split = chunk.data.indexOf(0);
      if (split > 0)
        tags.push({
          namespace: 'PNG',
          name: latin1.decode(chunk.data.subarray(0, split)),
          value: latin1.decode(chunk.data.subarray(split + 1)),
        });
    }
    if (chunk.type === 'iTXt') {
      const split = chunk.data.indexOf(0);
      if (split > 0)
        tags.push({
          namespace: 'PNG',
          name: latin1.decode(chunk.data.subarray(0, split)),
          value: new TextDecoder().decode(chunk.data.subarray(split + 5)),
        });
    }
    if (chunk.type === 'eXIf')
      tags.push({ namespace: 'EXIF', name: 'embedded', value: `${chunk.data.length} bytes` });
    if (chunk.type === 'iCCP')
      tags.push({ namespace: 'ICC', name: 'embedded', value: `${chunk.data.length} bytes` });
  }
  return { format: 'png', tags };
}

function readGif(input: Uint8Array): ReadableMetadata {
  if (
    latin1.decode(input.subarray(0, 6)) !== 'GIF87a' &&
    latin1.decode(input.subarray(0, 6)) !== 'GIF89a'
  )
    throw new Error('GIF metadata requires a valid GIF signature.');
  const tags: MetadataTag[] = [];
  for (let offset = 13; offset < input.length - 1; offset += 1) {
    if (input[offset] !== 0x21 || input[offset + 1] !== 0xfe) continue;
    offset += 2;
    const parts: Uint8Array[] = [];
    while (input[offset]) {
      const size = input[offset++]!;
      if (offset + size > input.length)
        throw new Error('GIF contains a truncated comment extension.');
      parts.push(input.subarray(offset, offset + size));
      offset += size;
    }
    tags.push({
      namespace: 'GIF',
      name: 'comment',
      value: latin1.decode(Uint8Array.from(parts.flatMap((part) => [...part]))),
    });
  }
  return { format: 'gif', tags };
}

function readJpeg(input: Uint8Array): ReadableMetadata {
  if (input[0] !== 0xff || input[1] !== 0xd8)
    throw new Error('JPEG metadata requires a valid JPEG signature.');
  const tags: MetadataTag[] = [];
  for (let offset = 2; offset + 4 <= input.length;) {
    if (input[offset] !== 0xff) throw new Error('JPEG contains an invalid marker.');
    const marker = input[offset + 1]!;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (input[offset + 2]! << 8) | input[offset + 3]!;
    if (length < 2 || offset + 2 + length > input.length)
      throw new Error('JPEG contains a truncated metadata segment.');
    const data = input.subarray(offset + 4, offset + 2 + length);
    if (marker === 0xe0 && latin1.decode(data.subarray(0, 5)) === 'JFIF\0' && data.length >= 12) {
      const unit = data[7] === 1 ? 'dpi' : data[7] === 2 ? 'dpcm' : 'aspect';
      const horizontal = (data[8]! << 8) | data[9]!;
      const vertical = (data[10]! << 8) | data[11]!;
      tags.push({ namespace: 'JFIF', name: 'density', value: `${horizontal}×${vertical} ${unit}` });
    }
    if (marker === 0xe1 && latin1.decode(data.subarray(0, 6)) === 'Exif\0\0') {
      for (const field of readExifIfd0(data.subarray(6)))
        tags.push({ namespace: 'EXIF', name: field.name, value: String(field.value) });
    }
    if (marker === 0xe2 && latin1.decode(data.subarray(0, 11)) === 'ICC_PROFILE\0')
      tags.push({ namespace: 'ICC', name: 'embedded', value: `${data.length} bytes` });
    offset += length + 2;
  }
  return { format: 'jpeg', tags };
}

export function readContainerMetadata(input: ArrayBuffer | Uint8Array): ReadableMetadata {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (matches(bytes, pngSignature)) return readPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes);
  return readGif(bytes);
}

/** Removes only ancillary metadata chunks; image data and mandatory PNG chunks are copied verbatim. */
export function stripPngMetadata(input: ArrayBuffer | Uint8Array): Uint8Array {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const chunks = pngChunks(bytes);
  const retained = [
    bytes.subarray(0, 8),
    ...chunks
      .filter((chunk) => !metadataChunks.has(chunk.type))
      .map((chunk) => bytes.subarray(chunk.start, chunk.end)),
  ];
  return Uint8Array.from(retained.flatMap((part) => [...part]));
}

/** Removes APP1 (EXIF/XMP), APP2 (ICC/FlashPix), and APP13 (IPTC) JPEG metadata segments. */
export function stripJpegMetadata(input: ArrayBuffer | Uint8Array): Uint8Array {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error('JPEG metadata requires a valid JPEG signature.');
  const retained: Uint8Array[] = [bytes.subarray(0, 2)];
  for (let offset = 2; offset < bytes.length;) {
    if (bytes[offset] !== 0xff) {
      retained.push(bytes.subarray(offset));
      break;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined) throw new Error('JPEG contains a truncated marker.');
    if (marker === 0xd9 || marker === 0xda) {
      retained.push(bytes.subarray(offset));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      retained.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) throw new Error('JPEG contains a truncated metadata segment.');
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length)
      throw new Error('JPEG contains a truncated metadata segment.');
    if (![0xe1, 0xe2, 0xed].includes(marker))
      retained.push(bytes.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  return Uint8Array.from(retained.flatMap((part) => [...part]));
}
import { readExifIfd0 } from './exif.js';
