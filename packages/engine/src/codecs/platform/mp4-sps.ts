/**
 * Rewrites the coded dimensions of an H.264 SPS NAL unit.
 *
 * Some browsers (Firefox in particular) misreport the WebCodecs decoderConfig coded dimensions for
 * small AVC encodes (16x160 for a 32x32 canvas). Mediabunny copies those into the MP4 `tkhd`/`stsd`
 * boxes (patched by `mp4-track-dimensions.ts`) but also writes the encoder's SPS verbatim into the
 * `avcC` box. Firefox reads `videoWidth`/`videoHeight` from that SPS, so patching the container
 * boxes alone is not enough -- the SPS `pic_width_in_mbs_minus1` / `pic_height_in_map_units_minus1`
 * must be rewritten to match the requested output size.
 *
 * The rewrite re-serialises the SPS prefix up to and including the two dimension fields and copies
 * every subsequent bit (frame_mbs_only_flag, cropping, VUI, ...) verbatim, so the rest of the
 * sequence description is preserved exactly.
 */

const HIGH_PROFILES = new Set([44, 83, 86, 100, 110, 118, 122, 128, 244]);

function readUe(bits: Uint8Array, bitOffset: number): { value: number; nextBit: number } {
  let leadingZeros = 0;
  let position = bitOffset;
  while (position < bits.length && bits[position] === 0) {
    leadingZeros += 1;
    position += 1;
  }
  // position now points at the terminating 1-bit
  position += 1;
  let value = 1;
  for (let i = 0; i < leadingZeros; i += 1) {
    value = (value << 1) | bits[position]!;
    position += 1;
  }
  return { value: value - 1, nextBit: position };
}

function readSe(bits: Uint8Array, bitOffset: number): { value: number; nextBit: number } {
  const { value: codeNum, nextBit } = readUe(bits, bitOffset);
  const value = codeNum % 2 === 0 ? -(codeNum / 2) : (codeNum + 1) / 2;
  return { value, nextBit };
}

function bitsFromBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i]!;
    for (let b = 0; b < 8; b += 1) out[i * 8 + b] = (byte >> (7 - b)) & 1;
  }
  return out;
}

function bytesFromBits(bits: Uint8Array): Uint8Array {
  const length = Math.ceil(bits.length / 8);
  const out = new Uint8Array(length);
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i] === 1) out[Math.floor(i / 8)]! |= 1 << (7 - (i % 8));
  }
  return out;
}

function writeUe(bits: number[], codeNum: number): void {
  const body = codeNum + 1;
  const bodyLength = Math.floor(Math.log2(body)) + 1;
  for (let i = 0; i < bodyLength - 1; i += 1) bits.push(0);
  for (let i = bodyLength - 1; i >= 0; i -= 1) bits.push((body >> i) & 1);
}

/**
 * Rewrites the coded width/height in an SPS NAL unit (raw byte-stream NAL, no emulation-prevention
 * bytes). Returns the patched SPS, or the original if the dimensions are already correct.
 */
export function rewriteAvcSpsDimensions(
  sps: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (sps.length < 4) return sps;
  const bits = bitsFromBytes(sps);
  // NAL header is 8 bits; then profile_idc, constraint flags, level_idc are byte-aligned.
  let bit = 8 + 8 + 8 + 8;

  const readUeAt = () => {
    const result = readUe(bits, bit);
    bit = result.nextBit;
    return result.value;
  };

  const profileIdc = sps[1]!;
  // seq_parameter_set_id
  readUeAt();

  if (HIGH_PROFILES.has(profileIdc)) {
    const chromaFormatIdc = readUeAt();
    if (chromaFormatIdc === 3) bit += 1; // separate_colour_plane_flag
    readUeAt(); // bit_depth_luma_minus8
    readUeAt(); // bit_depth_chroma_minus8
    bit += 1; // qpprime_y_zero_transform_bypass_flag
    const scalingMatrixPresent = bits[bit]!;
    bit += 1;
    if (scalingMatrixPresent === 1) {
      const listCount = chromaFormatIdc !== 3 ? 8 : 12;
      for (let i = 0; i < listCount; i += 1) {
        const present = bits[bit]!;
        bit += 1;
        if (present === 1) {
          const size = i < 6 ? 16 : 64;
          let lastScale = 8;
          let nextScale = 8;
          for (let j = 0; j < size; j += 1) {
            if (nextScale !== 0) {
              const { value: delta, nextBit } = readSe(bits, bit);
              bit = nextBit;
              nextScale = (lastScale + delta + 256) % 256;
            }
            lastScale = nextScale === 0 ? lastScale : nextScale;
          }
        }
      }
    }
  }

  readUeAt(); // log2_max_frame_num_minus4
  const picOrderCntType = readUeAt();
  if (picOrderCntType === 0) {
    readUeAt(); // log2_max_pic_order_cnt_lsb_minus4
  } else if (picOrderCntType === 1) {
    bit += 1; // delta_pic_order_always_zero_flag
    bit = readSe(bits, bit).nextBit; // offset_for_non_ref_pic
    bit = readSe(bits, bit).nextBit; // offset_for_top_to_bottom_field
    const numRef = readUe(bits, bit);
    bit = numRef.nextBit;
    for (let i = 0; i < numRef.value; i += 1) bit = readSe(bits, bit).nextBit;
  }

  readUeAt(); // max_num_ref_frames
  bit += 1; // gaps_in_frame_num_value_allowed_flag

  // pic_width_in_mbs_minus1 begins here.
  const widthStart = bit;
  const oldWidth = readUeAt();
  const oldHeight = readUeAt();
  const heightEnd = bit;
  // frame_mbs_only_flag follows immediately and decides the height's macroblock divisor.
  const frameMbsOnlyFlag = bits[heightEnd]!;

  const newWidthMinus1 = Math.max(0, Math.ceil(width / 16) - 1);
  const heightDivisor = frameMbsOnlyFlag === 1 ? 16 : 32;
  const newHeightMinus1 = Math.max(0, Math.ceil(height / heightDivisor) - 1);
  if (oldWidth === newWidthMinus1 && oldHeight === newHeightMinus1) return sps;

  const out: number[] = [];
  for (let i = 0; i < widthStart; i += 1) out.push(bits[i]!);
  writeUe(out, newWidthMinus1);
  writeUe(out, newHeightMinus1);
  for (let i = heightEnd; i < bits.length; i += 1) out.push(bits[i]!);

  return bytesFromBits(Uint8Array.from(out));
}

/**
 * Replaces the first SPS NAL unit inside an AVCDecoderConfigurationRecord (the `avcC` box payload)
 * with a version whose coded dimensions match `width` x `height`. Returns the patched record.
 */
export function patchAvcConfigurationDimensions(
  record: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (record.length < 7) return record;
  const out = record.slice();
  const numSps = out[5]! & 0x1f;
  let offset = 6;
  for (let i = 0; i < numSps; i += 1) {
    const length = (out[offset]! << 8) | out[offset + 1]!;
    const spsStart = offset + 2;
    const spsEnd = spsStart + length;
    if (i === 0) {
      const patched = rewriteAvcSpsDimensions(out.subarray(spsStart, spsEnd), width, height);
      if (patched.length !== length) return record; // unchanged-size guard: bail rather than corrupt
      out.set(patched, spsStart);
    }
    offset = spsEnd;
  }
  return out;
}
