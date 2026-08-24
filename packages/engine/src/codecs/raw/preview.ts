import { walkExifIfds } from '../../metadata/exif.js';

/** A Stage 1 RAW result is an embedded camera JPEG preview, never a RAW develop. */
export interface RawCameraPreview {
  readonly bytes: Uint8Array;
  readonly label: 'camera preview';
}

type PreviewCandidate = { readonly offset: number; readonly length: number };

function hasJpegFrame(bytes: Uint8Array, offset: number, length: number): boolean {
  const end = offset + length;
  if (length < 15 || bytes[offset] !== 0xff || bytes[offset + 1] !== 0xd8) return false;
  let cursor = offset + 2;
  while (cursor + 3 < end) {
    if (bytes[cursor] !== 0xff) {
      cursor += 1;
      continue;
    }
    while (cursor < end && bytes[cursor] === 0xff) cursor += 1;
    const marker = bytes[cursor++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return false;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (cursor + 1 >= end) return false;
    const segmentLength = (bytes[cursor]! << 8) | bytes[cursor + 1]!;
    if (segmentLength < 2 || cursor + segmentLength > end) return false;
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      if (segmentLength < 8) return false;
      const height = (bytes[cursor + 3]! << 8) | bytes[cursor + 4]!;
      const width = (bytes[cursor + 5]! << 8) | bytes[cursor + 6]!;
      return width > 0 && height > 0;
    }
    cursor += segmentLength;
  }
  return false;
}

function tiffPreviewCandidates(bytes: Uint8Array): PreviewCandidate[] {
  let ifds;
  try {
    ifds = walkExifIfds(bytes, [0x014a]);
  } catch {
    return [];
  }
  const candidates: PreviewCandidate[] = [];
  for (const ifd of ifds) {
    let jpegOffset: number | undefined;
    let jpegLength: number | undefined;
    for (const entry of ifd.entries) {
      if (entry.tag === 0x0201 && entry.type === 4 && entry.count === 1) jpegOffset = entry.value;
      if (entry.tag === 0x0202 && entry.type === 4 && entry.count === 1) jpegLength = entry.value;
    }
    if (
      jpegOffset !== undefined &&
      jpegLength !== undefined &&
      jpegLength >= 4 &&
      jpegOffset <= bytes.byteLength - jpegLength &&
      bytes[jpegOffset] === 0xff &&
      bytes[jpegOffset + 1] === 0xd8 &&
      bytes[jpegOffset + jpegLength - 2] === 0xff &&
      bytes[jpegOffset + jpegLength - 1] === 0xd9 &&
      hasJpegFrame(bytes, jpegOffset, jpegLength)
    )
      candidates.push({ offset: jpegOffset, length: jpegLength });
  }
  return candidates;
}

function scannedPreviewCandidates(bytes: Uint8Array): PreviewCandidate[] {
  const candidates: PreviewCandidate[] = [];
  for (let offset = 0; offset <= bytes.length - 4 && candidates.length < 256; offset += 1) {
    if (bytes[offset] !== 0xff || bytes[offset + 1] !== 0xd8 || bytes[offset + 2] !== 0xff)
      continue;
    for (let end = offset + 3; end < bytes.length; end += 1) {
      if (bytes[end - 1] === 0xff && bytes[end] === 0xd9) {
        const length = end + 1 - offset;
        if (hasJpegFrame(bytes, offset, length)) candidates.push({ offset, length });
        offset = end;
        break;
      }
    }
  }
  return candidates;
}

/**
 * Walks TIFF IFDs (including SubIFDs) and returns the first full-size JPEG preview.
 * TIFF-based RAW families store this as tags 0x0201/0x0202, so this works without a vendor SDK.
 */
export function extractRawCameraPreview(input: ArrayBuffer | Uint8Array): RawCameraPreview {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 4) throw new Error('RAW file is too short to contain a camera preview.');
  const candidates = [...tiffPreviewCandidates(bytes), ...scannedPreviewCandidates(bytes)].sort(
    (left, right) => right.length - left.length,
  );
  const preview = candidates[0];
  if (preview)
    return {
      bytes: bytes.slice(preview.offset, preview.offset + preview.length),
      label: 'camera preview',
    };
  throw new Error('No embedded JPEG camera preview was found in this RAW file.');
}
