export interface MetafileSvgResult {
  readonly format: 'wmf' | 'emf';
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly warnings: readonly string[];
}

type Bounds = { left: number; top: number; right: number; bottom: number };

function finish(
  format: 'wmf' | 'emf',
  elements: string[],
  bounds: Bounds,
  skipped: Map<number, number>,
): MetafileSvgResult {
  if (elements.length === 0)
    throw new Error(`${format.toUpperCase()} contains no supported geometry records.`);
  const rawWidth = bounds.right - bounds.left;
  const rawHeight = bounds.bottom - bounds.top;
  if (rawWidth < 0 || rawHeight < 0)
    throw new Error(`${format.toUpperCase()} has invalid drawing bounds.`);
  const width = Math.max(1, rawWidth);
  const height = Math.max(1, rawHeight);
  if (!(Number.isFinite(width) && Number.isFinite(height)) || width * height > 1_000_000_000_000)
    throw new Error(`${format.toUpperCase()} bounds exceed the safe render limit.`);
  const warnings = [...skipped].map(
    ([record, count]) =>
      `Skipped ${count} unsupported ${format.toUpperCase()} record 0x${record.toString(16).padStart(4, '0')}.`,
  );
  return {
    format,
    width,
    height,
    warnings,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" color="black"><g transform="translate(${-bounds.left} ${-bounds.top})">${elements.join('')}</g></svg>`,
  };
}

function include(bounds: Bounds, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error('Metafile contains non-finite coordinates.');
  bounds.left = Math.min(bounds.left, x);
  bounds.top = Math.min(bounds.top, y);
  bounds.right = Math.max(bounds.right, x);
  bounds.bottom = Math.max(bounds.bottom, y);
}

function decodeWmf(bytes: Uint8Array): MetafileSvgResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const placeable = bytes.length >= 22 && view.getUint32(0, true) === 0x9ac6cdd7;
  let offset = placeable ? 22 : 0;
  if (bytes.length < offset + 18) throw new Error('WMF header is truncated.');
  if (view.getUint16(offset + 2, true) !== 9)
    throw new Error('WMF has an invalid standard header size.');
  const declaredWords = view.getUint32(offset + 6, true);
  if (declaredWords < 9 || declaredWords * 2 > bytes.length - offset)
    throw new Error('WMF declared size exceeds the file.');
  const bounds: Bounds = placeable
    ? {
        left: view.getInt16(6, true),
        top: view.getInt16(8, true),
        right: view.getInt16(10, true),
        bottom: view.getInt16(12, true),
      }
    : { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  offset += 18;
  const elements: string[] = [];
  const skipped = new Map<number, number>();
  let current: readonly [number, number] | undefined;
  let records = 0;
  while (offset + 6 <= bytes.length) {
    if (++records > 100_000) throw new Error('WMF exceeds the safe record-count limit.');
    const words = view.getUint32(offset, true);
    const functionId = view.getUint16(offset + 4, true);
    const size = words * 2;
    if (words < 3 || offset > bytes.length - size)
      throw new Error('WMF record is truncated or invalid.');
    const i16 = (relative: number) => view.getInt16(offset + 6 + relative, true);
    if (functionId === 0) break;
    if (functionId === 0x0214) {
      current = [i16(2), i16(0)];
      include(bounds, current[0], current[1]);
    } else if (functionId === 0x0213) {
      const next = [i16(2), i16(0)] as const;
      if (!current) throw new Error('WMF LINETO appears before MOVETO.');
      elements.push(
        `<path d="M${current[0]} ${current[1]} L${next[0]} ${next[1]}" fill="none" stroke="currentColor"/>`,
      );
      include(bounds, next[0], next[1]);
      current = next;
    } else if (functionId === 0x041b || functionId === 0x0418) {
      const bottom = i16(0),
        right = i16(2),
        top = i16(4),
        left = i16(6);
      include(bounds, left, top);
      include(bounds, right, bottom);
      elements.push(
        functionId === 0x041b
          ? `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="none" stroke="currentColor"/>`
          : `<ellipse cx="${(left + right) / 2}" cy="${(top + bottom) / 2}" rx="${Math.abs(right - left) / 2}" ry="${Math.abs(bottom - top) / 2}" fill="none" stroke="currentColor"/>`,
      );
    } else if (functionId === 0x0324 || functionId === 0x0325) {
      const count = view.getUint16(offset + 6, true);
      if (count < 2 || 8 + count * 4 > size)
        throw new Error('WMF polygon record has an invalid point count.');
      const points = Array.from({ length: count }, (_, index) => {
        const x = view.getInt16(offset + 8 + index * 4, true);
        const y = view.getInt16(offset + 10 + index * 4, true);
        include(bounds, x, y);
        return `${x} ${y}`;
      });
      elements.push(
        `<path d="M${points.join(' L')}${functionId === 0x0324 ? ' Z' : ''}" fill="none" stroke="currentColor"/>`,
      );
    } else skipped.set(functionId, (skipped.get(functionId) ?? 0) + 1);
    offset += size;
  }
  return finish('wmf', elements, bounds, skipped);
}

function decodeEmf(bytes: Uint8Array): MetafileSvgResult {
  if (bytes.length < 88) throw new Error('EMF header is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 1 || view.getUint32(40, true) !== 0x464d4520)
    throw new Error('EMF header or signature is invalid.');
  const declaredBytes = view.getUint32(48, true);
  if (declaredBytes < 88 || declaredBytes > bytes.length)
    throw new Error('EMF declared size exceeds the file.');
  const bounds: Bounds = {
    left: view.getInt32(8, true),
    top: view.getInt32(12, true),
    right: view.getInt32(16, true),
    bottom: view.getInt32(20, true),
  };
  const elements: string[] = [];
  const skipped = new Map<number, number>();
  let current: readonly [number, number] | undefined;
  let offset = view.getUint32(4, true);
  let records = 1;
  while (offset + 8 <= declaredBytes) {
    if (++records > 100_000) throw new Error('EMF exceeds the safe record-count limit.');
    const type = view.getUint32(offset, true);
    const size = view.getUint32(offset + 4, true);
    if (size < 8 || size % 4 !== 0 || offset > declaredBytes - size)
      throw new Error('EMF record is truncated or invalid.');
    const i32 = (relative: number) => view.getInt32(offset + 8 + relative, true);
    if (type === 14) break;
    if (type === 27) current = [i32(0), i32(4)];
    else if (type === 54) {
      const next = [i32(0), i32(4)] as const;
      if (!current) throw new Error('EMF LINETO appears before MOVETOEX.');
      elements.push(
        `<path d="M${current[0]} ${current[1]} L${next[0]} ${next[1]}" fill="none" stroke="currentColor"/>`,
      );
      current = next;
    } else if (type === 42 || type === 43) {
      const left = i32(0),
        top = i32(4),
        right = i32(8),
        bottom = i32(12);
      elements.push(
        type === 43
          ? `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="none" stroke="currentColor"/>`
          : `<ellipse cx="${(left + right) / 2}" cy="${(top + bottom) / 2}" rx="${Math.abs(right - left) / 2}" ry="${Math.abs(bottom - top) / 2}" fill="none" stroke="currentColor"/>`,
      );
    } else if (type === 3 || type === 4) {
      const count = view.getUint32(offset + 24, true);
      if (count < 2 || 28 + count * 8 > size)
        throw new Error('EMF polygon record has an invalid point count.');
      const points = Array.from(
        { length: count },
        (_, index) =>
          `${view.getInt32(offset + 28 + index * 8, true)} ${view.getInt32(offset + 32 + index * 8, true)}`,
      );
      elements.push(
        `<path d="M${points.join(' L')}${type === 3 ? ' Z' : ''}" fill="none" stroke="currentColor"/>`,
      );
    } else skipped.set(type, (skipped.get(type) ?? 0) + 1);
    offset += size;
  }
  return finish('emf', elements, bounds, skipped);
}

/** Decodes a bounded core geometry subset from WMF or EMF with explicit skipped-record warnings. */
export function decodeWindowsMetafile(input: ArrayBuffer | Uint8Array): MetafileSvgResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (
    bytes.length >= 44 &&
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(40, true) ===
      0x464d4520
  )
    return decodeEmf(bytes);
  return decodeWmf(bytes);
}
