import { walkExifIfds } from '../../metadata/exif.js';

/** A Stage 1 RAW result is an embedded camera JPEG preview, never a RAW develop. */
export interface RawCameraPreview {
  readonly bytes: Uint8Array;
  readonly label: 'camera preview';
}

type PreviewCandidate = { readonly offset: number; readonly length: number };

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
      bytes[jpegOffset + jpegLength - 1] === 0xd9
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
        candidates.push({ offset, length: end + 1 - offset });
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
