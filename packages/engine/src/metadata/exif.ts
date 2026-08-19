export type ExifField = {
  readonly tag: number;
  readonly name: 'orientation' | 'copyright';
  readonly value: string | number;
};

function ascii(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).replace(/\0+$/u, '');
}

/** Reads selected safe EXIF IFD0 fields without following arbitrary MakerNote pointers. */
export function readExifIfd0(input: ArrayBuffer | Uint8Array): readonly ExifField[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 8) throw new Error('EXIF TIFF header is truncated.');
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!little && !(bytes[0] === 0x4d && bytes[1] === 0x4d))
    throw new Error('EXIF does not contain a TIFF header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, little);
  const u32 = (offset: number) => view.getUint32(offset, little);
  if (u16(2) !== 42) throw new Error('EXIF TIFF header is unsupported.');
  const ifd = u32(4);
  if (ifd > bytes.length - 2) throw new Error('EXIF IFD offset is outside the file.');
  const count = u16(ifd);
  if (ifd + 2 + count * 12 > bytes.length) throw new Error('EXIF IFD entries are truncated.');
  const fields: ExifField[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = ifd + 2 + index * 12;
    const tag = u16(offset),
      type = u16(offset + 2),
      values = u32(offset + 4),
      valueOffset = offset + 8;
    if (tag === 0x0112 && type === 3 && values === 1)
      fields.push({ tag, name: 'orientation', value: u16(valueOffset) });
    if (tag === 0x8298 && type === 2 && values > 0) {
      const start = values <= 4 ? valueOffset : u32(valueOffset);
      if (start > bytes.length - values)
        throw new Error('EXIF copyright offset is outside the file.');
      fields.push({ tag, name: 'copyright', value: ascii(bytes.subarray(start, start + values)) });
    }
  }
  return fields;
}
