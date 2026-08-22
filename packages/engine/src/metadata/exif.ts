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

export type TiffIfdEntry = {
  readonly offset: number;
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  readonly value: number;
  readonly longValues: readonly number[];
};

export type TiffIfd = {
  readonly offset: number;
  readonly entries: readonly TiffIfdEntry[];
};

/** Bounded TIFF/EXIF IFD traversal shared by metadata and TIFF-based RAW readers. */
export function walkExifIfds(
  input: ArrayBuffer | Uint8Array,
  followPointerTags: readonly number[] = [0x014a, 0x8769, 0x8825],
): readonly TiffIfd[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const { view, u16, u32 } = tiffReader(bytes);
  const pointers = new Set(followPointerTags);
  const pending = [u32(4)];
  const visited = new Set<number>();
  const ifds: TiffIfd[] = [];

  while (pending.length && ifds.length < 4096) {
    const offset = pending.pop()!;
    if (visited.has(offset) || offset > view.byteLength - 2) continue;
    visited.add(offset);
    const count = u16(offset);
    const end = offset + 2 + count * 12;
    if (count > 4096 || end + 4 > view.byteLength) continue;
    const entries: TiffIfdEntry[] = [];
    for (let index = 0; index < count; index += 1) {
      const entryOffset = offset + 2 + index * 12;
      const tag = u16(entryOffset);
      const type = u16(entryOffset + 2);
      const values = u32(entryOffset + 4);
      const value = u32(entryOffset + 8);
      const longValues =
        type !== 4 || values === 0 || values > 4096
          ? []
          : values === 1
            ? [value]
            : value <= view.byteLength - values * 4
              ? Array.from({ length: values }, (_, valueIndex) => u32(value + valueIndex * 4))
              : [];
      entries.push({ offset: entryOffset, tag, type, count: values, value, longValues });
      if (pointers.has(tag)) pending.push(...longValues);
    }
    const next = u32(end);
    if (next) pending.push(next);
    ifds.push({ offset, entries });
  }
  return ifds;
}

export type ExifDirectoryField = {
  readonly ifdOffset: number;
  readonly tag: number;
  readonly name: string;
  readonly type: number;
  readonly count: number;
  readonly value: string;
};

const exifTagNames: Readonly<Record<number, string>> = {
  0x010e: 'image-description',
  0x010f: 'make',
  0x0110: 'model',
  0x0112: 'orientation',
  0x0131: 'software',
  0x0132: 'date-time',
  0x013b: 'artist',
  0x8298: 'copyright',
  0x8769: 'exif-ifd-pointer',
  0x8825: 'gps-ifd-pointer',
  0x927c: 'maker-note',
};

/** Reads every entry in every reachable standard EXIF IFD with bounded, non-executing values. */
export function readExifAllIfds(input: ArrayBuffer | Uint8Array): readonly ExifDirectoryField[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const { view, little } = tiffReader(bytes);
  const typeSize: Readonly<Record<number, number>> = {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
    5: 8,
    7: 1,
    9: 4,
    10: 8,
  };
  const fields: ExifDirectoryField[] = [];
  for (const ifd of walkExifIfds(bytes))
    for (const entry of ifd.entries) {
      if (entry.tag === 0 && entry.type === 0 && entry.count === 0) continue;
      const unit = typeSize[entry.type];
      if (!unit || entry.count > 1_000_000)
        throw new Error(`EXIF tag 0x${entry.tag.toString(16)} has an unsupported type or count.`);
      const byteLength = unit * entry.count;
      const start = byteLength <= 4 ? entry.offset + 8 : entry.value;
      if (!Number.isSafeInteger(byteLength) || start > bytes.length - byteLength)
        throw new Error(`EXIF tag 0x${entry.tag.toString(16)} points outside the file.`);
      const shown = Math.min(entry.count, 64);
      let values: string;
      if (entry.type === 2) values = ascii(bytes.subarray(start, start + byteLength));
      else if (entry.type === 7)
        values = `${byteLength} opaque bytes (${[
          ...bytes.subarray(start, start + Math.min(16, byteLength)),
        ]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('')})`;
      else {
        const decoded: number[] = [];
        for (let index = 0; index < shown; index += 1) {
          const offset = start + index * unit;
          if (entry.type === 1) decoded.push(view.getUint8(offset));
          if (entry.type === 3) decoded.push(view.getUint16(offset, little));
          if (entry.type === 4) decoded.push(view.getUint32(offset, little));
          if (entry.type === 9) decoded.push(view.getInt32(offset, little));
          if (entry.type === 5 || entry.type === 10) {
            const numerator =
              entry.type === 5 ? view.getUint32(offset, little) : view.getInt32(offset, little);
            const denominator =
              entry.type === 5
                ? view.getUint32(offset + 4, little)
                : view.getInt32(offset + 4, little);
            decoded.push(denominator === 0 ? Number.NaN : numerator / denominator);
          }
        }
        values = `${decoded.join(', ')}${entry.count > shown ? ', …' : ''}`;
      }
      fields.push({
        ifdOffset: ifd.offset,
        tag: entry.tag,
        name: exifTagNames[entry.tag] ?? `tag-0x${entry.tag.toString(16).padStart(4, '0')}`,
        type: entry.type,
        count: entry.count,
        value: values,
      });
    }
  return fields;
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

const exifTypeBytes: Readonly<Record<number, number>> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8,
};

function stripExifEntries(
  input: ArrayBuffer | Uint8Array,
  remove: (entry: TiffIfdEntry) => boolean,
): Uint8Array {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bytes = source.slice();
  for (const ifd of walkExifIfds(source))
    for (const entry of ifd.entries) {
      if (!remove(entry)) continue;
      const unit = exifTypeBytes[entry.type] ?? 0;
      const byteLength = unit * entry.count;
      if (unit && byteLength > 4 && Number.isSafeInteger(byteLength)) {
        const start = entry.value;
        if (start > source.length - byteLength)
          throw new Error(`EXIF tag 0x${entry.tag.toString(16)} points outside the file.`);
        bytes.fill(0, start, start + byteLength);
      }
      bytes.fill(0, entry.offset, entry.offset + 12);
    }
  return bytes;
}

/** Removes proprietary MakerNote entries and payloads while preserving all other EXIF bytes. */
export function stripExifMakerNotes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return stripExifEntries(input, (entry) => entry.tag === 0x927c);
}

/** Retains only Orientation and Copyright entries; every other reachable EXIF entry is wiped. */
export function stripExifExceptOrientationCopyright(input: ArrayBuffer | Uint8Array): Uint8Array {
  return stripExifEntries(input, (entry) => entry.tag !== 0x0112 && entry.tag !== 0x8298);
}

/** Rewrites an existing IFD0 copyright field without relocating any EXIF structures. */
export function editExifCopyright(input: ArrayBuffer | Uint8Array, copyright: string): Uint8Array {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bytes = source.slice();
  const { view, little, u16, u32 } = tiffReader(bytes);
  const encoded = new TextEncoder().encode(`${copyright}\0`);
  if (encoded.some((value) => value > 0x7f))
    throw new Error('EXIF copyright editing currently accepts ASCII text only.');
  const root = u32(4);
  if (root > bytes.length - 2) throw new Error('EXIF IFD offset is outside the file.');
  const count = u16(root);
  if (root + 2 + count * 12 > bytes.length) throw new Error('EXIF IFD entries are truncated.');
  for (let index = 0; index < count; index += 1) {
    const entry = root + 2 + index * 12;
    if (u16(entry) !== 0x8298 || u16(entry + 2) !== 2) continue;
    const capacity = u32(entry + 4);
    if (encoded.length > capacity)
      throw new Error(
        `Edited EXIF copyright requires ${encoded.length} bytes but the existing field has ${capacity}; shortening is safe, growing requires a metadata rebuild.`,
      );
    const start = capacity <= 4 ? entry + 8 : u32(entry + 8);
    if (start > bytes.length - capacity)
      throw new Error('EXIF copyright offset is outside the file.');
    bytes.fill(0, start, start + capacity);
    bytes.set(encoded, start);
    view.setUint32(entry + 4, encoded.length, little);
    return bytes;
  }
  throw new Error('EXIF does not contain an editable copyright field.');
}
