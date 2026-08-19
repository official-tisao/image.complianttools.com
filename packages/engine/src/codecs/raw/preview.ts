/** A Stage 1 RAW result is an embedded camera JPEG preview, never a RAW develop. */
export interface RawCameraPreview {
  readonly bytes: Uint8Array;
  readonly label: 'camera preview';
}

type Reader = {
  readonly view: DataView;
  readonly littleEndian: boolean;
  u16(offset: number): number;
  u32(offset: number): number;
};

function createReader(bytes: Uint8Array): Reader {
  if (bytes.byteLength < 8) throw new Error('RAW file is too short to contain a TIFF header.');
  const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49;
  const bigEndian = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!littleEndian && !bigEndian)
    throw new Error('RAW preview extraction requires a TIFF-based RAW file.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, littleEndian);
  const u32 = (offset: number) => view.getUint32(offset, littleEndian);
  if (u16(2) !== 42) throw new Error('RAW file has an unsupported TIFF header.');
  return { view, littleEndian, u16, u32 };
}

function offsetsForEntry(reader: Reader, entry: number, type: number, count: number): number[] {
  if (type !== 4) return [];
  const value = reader.u32(entry + 8);
  if (count === 1) return [value];
  if (value > reader.view.byteLength - count * 4) return [];
  return Array.from({ length: count }, (_, index) => reader.u32(value + index * 4));
}

/**
 * Walks TIFF IFDs (including SubIFDs) and returns the first full-size JPEG preview.
 * TIFF-based RAW families store this as tags 0x0201/0x0202, so this works without a vendor SDK.
 */
export function extractRawCameraPreview(input: ArrayBuffer | Uint8Array): RawCameraPreview {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const reader = createReader(bytes);
  const pending = [reader.u32(4)];
  const visited = new Set<number>();

  while (pending.length) {
    const ifd = pending.pop()!;
    if (visited.has(ifd) || ifd > reader.view.byteLength - 2) continue;
    visited.add(ifd);
    const entries = reader.u16(ifd);
    if (ifd + 2 + entries * 12 + 4 > reader.view.byteLength) continue;
    let jpegOffset: number | undefined;
    let jpegLength: number | undefined;
    for (let index = 0; index < entries; index += 1) {
      const entry = ifd + 2 + index * 12;
      const tag = reader.u16(entry);
      const type = reader.u16(entry + 2);
      const count = reader.u32(entry + 4);
      if (tag === 0x0201 && type === 4 && count === 1) jpegOffset = reader.u32(entry + 8);
      if (tag === 0x0202 && type === 4 && count === 1) jpegLength = reader.u32(entry + 8);
      if (tag === 0x014a) pending.push(...offsetsForEntry(reader, entry, type, count));
    }
    const nextIfd = reader.u32(ifd + 2 + entries * 12);
    if (nextIfd) pending.push(nextIfd);
    if (
      jpegOffset !== undefined &&
      jpegLength !== undefined &&
      jpegLength > 0 &&
      jpegOffset <= bytes.byteLength - jpegLength &&
      bytes[jpegOffset] === 0xff &&
      bytes[jpegOffset + 1] === 0xd8
    ) {
      return { bytes: bytes.slice(jpegOffset, jpegOffset + jpegLength), label: 'camera preview' };
    }
  }
  throw new Error('No embedded JPEG camera preview was found in this RAW file.');
}
