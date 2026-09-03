/**
 * Corrects the track and sample dimensions stored in an ISO-BMFF (MP4) container.
 *
 * The Mediabunny muxer derives the `tkhd` (track) and `stsd`/sample-entry widths and heights
 * directly from the browser's WebCodecs `decoderConfig.codedWidth/codedHeight`. Some browsers
 * (Firefox, in particular) misreport those coded dimensions for a small AVC/H.264 encode -- for a
 * 32x32 canvas it can emit 16x160 -- so the container advertises a size that does not match the
 * actual 32x32 frames. Chromium compensates by reading the coded size from the H.264 SPS (which is
 * correct); Firefox trusts the box and renders the wrong size.
 *
 * The requested output size is the source of truth here: it is what we told the encoder and what
 * the frames actually are. So we rewrite the `tkhd` track width/height (16.16 fixed-point) and the
 * visual sample-entry width/height (16-bit) to those values. The SPS is left untouched because it
 * already encodes the true dimensions. This is a no-op for browsers that already report correctly.
 */
import { patchAvcConfigurationDimensions } from './mp4-sps.js';

const VIDEO_SAMPLE_ENTRY_TYPES = new Set(['avc1', 'avc3', 'hvc1', 'hev1']);

const CONTAINER_TYPES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'mvex',
  'edts',
  'dinf',
  'udta',
]);

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset);
}

export function patchMp4TrackDimensions(
  bytes: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('MP4 output dimensions must be positive integers.');
  }
  if (width % 2 === 1 || height % 2 === 1) {
    throw new Error(
      `MP4 track dimensions ${width}x${height} are not supported; both width and height must be even.`,
    );
  }

  const output = bytes.slice();
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const fixedWidth = Math.round(width * 65536);
  const fixedHeight = Math.round(height * 65536);

  let patched = false;

  const walk = (start: number, end: number): void => {
    let position = start;
    while (position + 8 <= end) {
      let size = readU32(view, position);
      let header = 8;
      if (size === 1) {
        size = Number(view.getBigUint64(position + 8));
        header = 16;
      } else if (size === 0) {
        size = end - position;
      }
      if (size < header || position + size > end) break;

      const type = String.fromCharCode(
        output[position + 4]!,
        output[position + 5]!,
        output[position + 6]!,
        output[position + 7]!,
      );

      if (type === 'tkhd') {
        // Track header: version(1) + flags(3), creation + modification, track id, reserved,
        // duration, reserved, layer, alternate group, volume, reserved, 3x3 matrix, then the
        // 16.16 fixed-point display width and height.
        const boxStart = position + 8;
        const version = output[boxStart];
        const is64 = version === 1;
        let offset = boxStart + 4; // version + flags
        offset += is64 ? 16 : 8; // creation + modification time
        offset += 4; // track id
        offset += 4; // reserved
        offset += is64 ? 8 : 4; // duration
        offset += 8 + 2 + 2 + 2 + 2 + 36; // reserved, layer, alt group, volume, reserved, matrix
        view.setUint32(offset, fixedWidth);
        view.setUint32(offset + 4, fixedHeight);
        patched = true;
      } else if (type === 'stsd') {
        // Sample Description Box is a full box (version + flags + entry count).
        walk(position + 16, position + size);
      } else if (VIDEO_SAMPLE_ENTRY_TYPES.has(type)) {
        // VisualSampleEntry: width/height are two 16-bit values 24 bytes into the entry body
        // (after the 8-byte box header) -- i.e. at box offset +32.
        view.setUint16(position + 32, width);
        view.setUint16(position + 34, height);
        patched = true;
        // Recurse into child boxes (avcC/hvcC/colr/pasp/...) which start after the fixed 78-byte
        // VisualSampleEntry payload.
        walk(position + 86, position + size);
      } else if (type === 'avcC') {
        // AVC Configuration Box: rewrite the SPS coded dimensions, which Firefox reads for
        // videoWidth/videoHeight (the container boxes above are not enough). In-place and
        // same-length; the helper bails rather than corrupt when the length would change.
        const recordStart = position + 8;
        const patchedRecord = patchAvcConfigurationDimensions(
          output.subarray(recordStart, position + size),
          width,
          height,
        );
        output.set(patchedRecord, recordStart);
      } else if (CONTAINER_TYPES.has(type)) {
        walk(position + header, position + size);
      }

      position += size;
    }
  };

  walk(0, output.byteLength);

  if (!patched) {
    throw new Error('Could not find a video track header in the MP4 container.');
  }
  return output;
}
