export type ExifField = {
  readonly tag: number;
  readonly name: 'orientation' | 'copyright';
  readonly value: string | number;
};

export type ExifGps = {
  readonly latitude: number;
  readonly longitude: number;
  readonly latitudeDms: string;
  readonly longitudeDms: string;
  readonly geoUri: string;
};

export type ExifMakerNote = {
  readonly byteLength: number;
  readonly previewHex: string;
};

function tiffReader(bytes: Uint8Array) {
  if (bytes.length < 8) throw new Error('EXIF TIFF header is truncated.');
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!little && !(bytes[0] === 0x4d && bytes[1] === 0x4d))
    throw new Error('EXIF does not contain a TIFF header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, little);
  const u32 = (offset: number) => view.getUint32(offset, little);
  if (u16(2) !== 42) throw new Error('EXIF TIFF header is unsupported.');
  return { view, little, u16, u32 };
}

function ascii(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).replace(/\0+$/u, '');
}

function dms(value: number, positive: string, negative: string): string {
  const hemisphere = value < 0 ? negative : positive;
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60_000) / 1_000;
  return `${degrees}° ${minutes}′ ${seconds}″ ${hemisphere}`;
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

/** Reads GPS latitude/longitude from standard EXIF fields without loading map tiles or MakerNotes. */
export function readExifGps(input: ArrayBuffer | Uint8Array): ExifGps | undefined {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 8) throw new Error('EXIF TIFF header is truncated.');
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!little && !(bytes[0] === 0x4d && bytes[1] === 0x4d))
    throw new Error('EXIF does not contain a TIFF header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, little);
  const u32 = (offset: number) => view.getUint32(offset, little);
  if (u16(2) !== 42) throw new Error('EXIF TIFF header is unsupported.');
  const root = u32(4);
  if (root > bytes.length - 2) throw new Error('EXIF IFD offset is outside the file.');
  const rootCount = u16(root);
  if (root + 2 + rootCount * 12 > bytes.length) throw new Error('EXIF IFD entries are truncated.');
  let gpsOffset: number | undefined;
  for (let index = 0; index < rootCount; index += 1) {
    const entry = root + 2 + index * 12;
    if (u16(entry) === 0x8825 && u16(entry + 2) === 4 && u32(entry + 4) === 1)
      gpsOffset = u32(entry + 8);
  }
  if (gpsOffset === undefined) return undefined;
  if (gpsOffset > bytes.length - 2) throw new Error('EXIF GPS offset is outside the file.');
  const count = u16(gpsOffset);
  if (gpsOffset + 2 + count * 12 > bytes.length) throw new Error('EXIF GPS entries are truncated.');
  let latitude: number | undefined, longitude: number | undefined;
  let latitudeRef = 'N',
    longitudeRef = 'E';
  const coordinate = (offset: number) => {
    if (offset > bytes.length - 24)
      throw new Error('EXIF GPS coordinate offset is outside the file.');
    const rational = (index: number) => {
      const denominator = u32(offset + index * 8 + 4);
      if (denominator === 0) throw new Error('EXIF GPS coordinate denominator is zero.');
      return u32(offset + index * 8) / denominator;
    };
    return rational(0) + rational(1) / 60 + rational(2) / 3600;
  };
  for (let index = 0; index < count; index += 1) {
    const entry = gpsOffset + 2 + index * 12;
    const tag = u16(entry),
      type = u16(entry + 2),
      values = u32(entry + 4),
      value = entry + 8;
    if (tag === 1 && type === 2 && values === 2) latitudeRef = String.fromCharCode(bytes[value]!);
    if (tag === 3 && type === 2 && values === 2) longitudeRef = String.fromCharCode(bytes[value]!);
    if (tag === 2 && type === 5 && values === 3) latitude = coordinate(u32(value));
    if (tag === 4 && type === 5 && values === 3) longitude = coordinate(u32(value));
  }
  if (latitude === undefined || longitude === undefined) return undefined;
  if (latitudeRef === 'S') latitude = -latitude;
  if (longitudeRef === 'W') longitude = -longitude;
  return {
    latitude,
    longitude,
    latitudeDms: dms(latitude, 'N', 'S'),
    longitudeDms: dms(longitude, 'E', 'W'),
    geoUri: `geo:${latitude},${longitude}`,
  };
}

/** Finds a proprietary MakerNote payload without attempting vendor-specific interpretation. */
export function readExifMakerNote(input: ArrayBuffer | Uint8Array): ExifMakerNote | undefined {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const { u16, u32 } = tiffReader(bytes);
  const root = u32(4);
  if (root > bytes.length - 2) throw new Error('EXIF IFD offset is outside the file.');
  const rootCount = u16(root);
  if (root + 2 + rootCount * 12 > bytes.length) throw new Error('EXIF IFD entries are truncated.');
  let exifIfd: number | undefined;
  for (let index = 0; index < rootCount; index += 1) {
    const entry = root + 2 + index * 12;
    if (u16(entry) === 0x8769 && u16(entry + 2) === 4 && u32(entry + 4) === 1)
      exifIfd = u32(entry + 8);
  }
  if (exifIfd === undefined) return undefined;
  if (exifIfd > bytes.length - 2) throw new Error('EXIF sub-IFD offset is outside the file.');
  const count = u16(exifIfd);
  if (exifIfd + 2 + count * 12 > bytes.length)
    throw new Error('EXIF sub-IFD entries are truncated.');
  for (let index = 0; index < count; index += 1) {
    const entry = exifIfd + 2 + index * 12;
    if (u16(entry) !== 0x927c) continue;
    const byteLength = u32(entry + 4);
    const start = byteLength <= 4 ? entry + 8 : u32(entry + 8);
    if (start > bytes.length - byteLength)
      throw new Error('EXIF MakerNote offset is outside the file.');
    return {
      byteLength,
      previewHex: [...bytes.subarray(start, start + Math.min(byteLength, 16))]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join(''),
    };
  }
  return undefined;
}

/** Wipes the GPS IFD and referenced values in-place on a copy, leaving pixel/container data untouched. */
export function stripExifGps(input: ArrayBuffer | Uint8Array): Uint8Array {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bytes = source.slice();
  const { u16, u32 } = tiffReader(bytes);
  const root = u32(4);
  if (root > bytes.length - 2) throw new Error('EXIF IFD offset is outside the file.');
  const rootCount = u16(root);
  if (root + 2 + rootCount * 12 > bytes.length) throw new Error('EXIF IFD entries are truncated.');
  const typeBytes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  for (let index = 0; index < rootCount; index += 1) {
    const rootEntry = root + 2 + index * 12;
    if (u16(rootEntry) !== 0x8825 || u16(rootEntry + 2) !== 4 || u32(rootEntry + 4) !== 1) continue;
    const gps = u32(rootEntry + 8);
    if (gps > bytes.length - 2) throw new Error('EXIF GPS offset is outside the file.');
    const count = u16(gps);
    const ifdEnd = gps + 2 + count * 12 + 4;
    if (ifdEnd > bytes.length) throw new Error('EXIF GPS entries are truncated.');
    for (let gpsIndex = 0; gpsIndex < count; gpsIndex += 1) {
      const entry = gps + 2 + gpsIndex * 12;
      const unit = typeBytes[u16(entry + 2)] ?? 0;
      const valueBytes = unit * u32(entry + 4);
      if (valueBytes > 4) {
        const start = u32(entry + 8);
        if (start > bytes.length - valueBytes)
          throw new Error('EXIF GPS value offset is outside the file.');
        bytes.fill(0, start, start + valueBytes);
      }
    }
    bytes.fill(0, gps, ifdEnd);
    bytes.fill(0, rootEntry, rootEntry + 12);
  }
  return bytes;
}
