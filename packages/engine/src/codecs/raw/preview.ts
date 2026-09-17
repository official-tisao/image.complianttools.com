import { walkExifIfds } from '../../metadata/exif.js';
import { encodeBmp } from '../simple/bmp.js';

/** A Stage 1 RAW result is an embedded camera rendering, never a RAW develop. */
export interface RawCameraPreview {
  readonly bytes: Uint8Array;
  readonly label: 'camera preview';
  readonly mimeType: 'image/jpeg' | 'image/bmp';
  readonly extension: 'jpg' | 'bmp';
}

type PreviewCandidate = { readonly offset: number; readonly length: number };

function jpegCandidateLength(
  bytes: Uint8Array,
  offset: number,
  maximumLength: number,
): number | null {
  const end = Math.min(bytes.length, offset + maximumLength);
  if (maximumLength < 15 || bytes[offset] !== 0xff || bytes[offset + 1] !== 0xd8) return null;
  let cursor = offset + 2;
  let hasFrame = false;
  while (cursor + 1 < end) {
    if (bytes[cursor] !== 0xff) return null;
    while (cursor < end && bytes[cursor] === 0xff) cursor += 1;
    const marker = bytes[cursor++];
    if (marker === undefined || marker === 0x00 || marker === 0xd8) return null;
    if (marker === 0xd9) return hasFrame ? cursor - offset : null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 1 >= end) return null;
    const segmentLength = (bytes[cursor]! << 8) | bytes[cursor + 1]!;
    if (segmentLength < 2 || cursor + segmentLength > end) return null;
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      if (segmentLength < 8) return null;
      const height = (bytes[cursor + 3]! << 8) | bytes[cursor + 4]!;
      const width = (bytes[cursor + 5]! << 8) | bytes[cursor + 6]!;
      if (width === 0 || height === 0) return null;
      hasFrame = true;
    }
    cursor += segmentLength;
    if (marker === 0xda) {
      while (cursor + 1 < end) {
        if (bytes[cursor] !== 0xff) {
          cursor += 1;
          continue;
        }
        const next = bytes[cursor + 1]!;
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          cursor += 2;
          continue;
        }
        if (next === 0xd9) return hasFrame ? cursor + 2 - offset : null;
        break;
      }
    }
  }
  return null;
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
      jpegCandidateLength(bytes, jpegOffset, jpegLength) === jpegLength
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
    const length = jpegCandidateLength(bytes, offset, bytes.length - offset);
    if (length !== null) {
      candidates.push({ offset, length });
      offset += length - 1;
    }
  }
  return candidates;
}

type UncompressedPreview = RawCameraPreview & { readonly pixels: number };

function inlineUnsigned(bytes: Uint8Array, entry: { offset: number; type: number; count: number }) {
  if (entry.count !== 1) return null;
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.type === 3) return view.getUint16(entry.offset + 8, little);
  if (entry.type === 4) return view.getUint32(entry.offset + 8, little);
  return null;
}

function uncompressedTiffPreviews(bytes: Uint8Array): UncompressedPreview[] {
  let ifds;
  try {
    ifds = walkExifIfds(bytes, [0x014a]);
  } catch {
    return [];
  }
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const previews: UncompressedPreview[] = [];
  for (const ifd of ifds) {
    const byTag = new Map(ifd.entries.map((entry) => [entry.tag, entry]));
    const width = byTag.get(0x0100),
      height = byTag.get(0x0101),
      bits = byTag.get(0x0102),
      compression = byTag.get(0x0103),
      photometric = byTag.get(0x0106),
      stripOffset = byTag.get(0x0111),
      samples = byTag.get(0x0115),
      stripBytes = byTag.get(0x0117),
      planar = byTag.get(0x011c);
    if (!width || !height || !bits || !compression || !stripOffset || !samples || !stripBytes)
      continue;
    const w = inlineUnsigned(bytes, width),
      h = inlineUnsigned(bytes, height),
      compressionValue = inlineUnsigned(bytes, compression),
      photometricValue = photometric ? inlineUnsigned(bytes, photometric) : 2,
      offset = inlineUnsigned(bytes, stripOffset),
      sampleCount = inlineUnsigned(bytes, samples),
      byteLength = inlineUnsigned(bytes, stripBytes),
      planarValue = planar ? inlineUnsigned(bytes, planar) : 1;
    if (
      !w ||
      !h ||
      compressionValue !== 1 ||
      photometricValue !== 2 ||
      sampleCount !== 3 ||
      planarValue !== 1 ||
      offset === null ||
      byteLength === null ||
      w * h > 100_000_000
    )
      continue;
    let bitDepths: number[];
    if (bits.count === 1) {
      const depth = inlineUnsigned(bytes, bits);
      bitDepths = depth === null ? [] : [depth, depth, depth];
    } else if (bits.type === 3 && bits.count === 3 && bits.value <= bytes.length - 6) {
      bitDepths = [0, 1, 2].map((index) => view.getUint16(bits.value + index * 2, little));
    } else continue;
    if (!bitDepths.every((depth) => depth === 8 || depth === 16)) continue;
    const bytesPerSample = bitDepths[0] === 16 ? 2 : 1;
    const required = w * h * 3 * bytesPerSample;
    if (byteLength < required || offset > bytes.length - required) continue;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let source = offset, target = 0; target < rgba.length; target += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        rgba[target + channel] =
          bytesPerSample === 1
            ? bytes[source++]!
            : Math.round(view.getUint16((source += 2) - 2, little) / 257);
      }
      rgba[target + 3] = 255;
    }
    const encoded = encodeBmp({
      width: w,
      height: h,
      colorSpace: 'srgb',
      bitDepth: 8,
      premultipliedAlpha: false,
      frames: [{ data: rgba, durationMs: 0 }],
    });
    previews.push({
      bytes: new Uint8Array(encoded),
      label: 'camera preview',
      mimeType: 'image/bmp',
      extension: 'bmp',
      pixels: w * h,
    });
  }
  return previews;
}

function embeddedTiffOffsets(bytes: Uint8Array): number[] {
  const offsets = [0];
  const limit = Math.min(bytes.length - 4, 1024 * 1024);
  for (let offset = 1; offset <= limit && offsets.length < 16; offset += 1)
    if (
      (bytes[offset] === 0x49 &&
        bytes[offset + 1] === 0x49 &&
        bytes[offset + 2] === 0x2a &&
        bytes[offset + 3] === 0) ||
      (bytes[offset] === 0x4d &&
        bytes[offset + 1] === 0x4d &&
        bytes[offset + 2] === 0 &&
        bytes[offset + 3] === 0x2a)
    )
      offsets.push(offset);
  return offsets;
}

/**
 * Extracts the largest embedded camera rendering. JPEG previews remain byte-for-byte intact;
 * uncompressed RGB TIFF previews are represented losslessly as BMP without a vendor SDK.
 */
export function extractRawCameraPreview(input: ArrayBuffer | Uint8Array): RawCameraPreview {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 4)
    throw {
      kind: 'decode-failed',
      format: 'raw',
      detail: 'RAW file is too short to contain a camera preview.',
      remedy: 'Use a full RAW file from a supported camera or export it as DNG.',
    };
  const candidates = [...tiffPreviewCandidates(bytes), ...scannedPreviewCandidates(bytes)].sort(
    (left, right) => right.length - left.length,
  );
  const preview = candidates[0];
  if (preview)
    return {
      bytes: bytes.slice(preview.offset, preview.offset + preview.length),
      label: 'camera preview',
      mimeType: 'image/jpeg',
      extension: 'jpg',
    };
  const uncompressed = embeddedTiffOffsets(bytes)
    .flatMap((offset) => uncompressedTiffPreviews(bytes.subarray(offset)))
    .sort((left, right) => right.pixels - left.pixels)[0];
  if (uncompressed) return uncompressed;
  throw {
    kind: 'decode-failed',
    format: 'raw',
    detail: 'No embedded camera preview was found in this RAW file.',
    remedy: 'Use a DNG file for full development or a RAW file with an embedded camera preview.',
  };
}
