export type ImageInspection = {
  readonly format: 'png' | 'jpeg' | 'gif' | 'webp';
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number | null;
  readonly channels: number | null;
  readonly hasAlpha: boolean | null;
  readonly colorSpace: string;
  readonly dpi: { readonly x: number; readonly y: number } | null;
  readonly frameCount: number;
  readonly animated: boolean;
  readonly structures: readonly string[];
  readonly entropyBitsPerByte: number;
  readonly estimatedQuality: number | null;
};

const ascii = new TextDecoder('latin1');

function bytesOf(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function entropy(input: Uint8Array): number {
  if (input.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (const value of input) counts[value]! += 1;
  let result = 0;
  for (const count of counts) {
    if (!count) continue;
    const probability = count / input.length;
    result -= probability * Math.log2(probability);
  }
  return result;
}

function base(
  bytes: Uint8Array,
  values: Omit<ImageInspection, 'entropyBitsPerByte'>,
): ImageInspection {
  return { ...values, entropyBitsPerByte: entropy(bytes) };
}

function inspectPng(bytes: Uint8Array): ImageInspection {
  if (bytes.length < 33) throw new Error('PNG is missing a complete IHDR chunk.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24]!;
  const colorType = bytes[25]!;
  const channelMap: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const spaceMap: Record<number, string> = {
    0: 'Grayscale',
    2: 'RGB',
    3: 'Indexed colour',
    4: 'Grayscale + alpha',
    6: 'RGBA',
  };
  const structures: string[] = [];
  let frameCount = 1;
  let dpi: ImageInspection['dpi'] = null;
  for (let offset = 8; offset <= bytes.length - 12;) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('PNG contains a truncated chunk.');
    const type = ascii.decode(bytes.subarray(offset + 4, offset + 8));
    structures.push(`${type} (${length} bytes)`);
    if (type === 'acTL' && length >= 8) frameCount = view.getUint32(offset + 8);
    if (type === 'pHYs' && length >= 9 && bytes[offset + 16] === 1) {
      dpi = {
        x: Math.round(view.getUint32(offset + 8) * 0.0254),
        y: Math.round(view.getUint32(offset + 12) * 0.0254),
      };
    }
    offset = end;
  }
  const channels = channelMap[colorType] ?? null;
  return base(bytes, {
    format: 'png',
    width,
    height,
    bitDepth,
    channels,
    hasAlpha: colorType === 4 || colorType === 6,
    colorSpace: spaceMap[colorType] ?? `Unknown PNG colour type ${colorType}`,
    dpi,
    frameCount,
    animated: frameCount > 1,
    structures,
    estimatedQuality: null,
  });
}

function inspectGif(bytes: Uint8Array): ImageInspection {
  if (bytes.length < 13) throw new Error('GIF is missing its logical screen descriptor.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let frames = 0;
  let transparent = false;
  const structures: string[] = ['Header (6 bytes)', 'Logical screen descriptor (7 bytes)'];
  for (let offset = 13; offset < bytes.length; offset += 1) {
    if (bytes[offset] === 0x2c) frames += 1;
    if (bytes[offset] === 0x21 && bytes[offset + 1] === 0xf9 && bytes[offset + 3] !== undefined)
      transparent ||= (bytes[offset + 3]! & 1) !== 0;
    if (bytes[offset] === 0x21 && bytes[offset + 1] !== undefined)
      structures.push(`Extension 0x${bytes[offset + 1]!.toString(16).padStart(2, '0')}`);
    if (bytes[offset] === 0x2c) structures.push('Image descriptor');
  }
  frames = Math.max(1, frames);
  return base(bytes, {
    format: 'gif',
    width: view.getUint16(6, true),
    height: view.getUint16(8, true),
    bitDepth: (bytes[10]! & 7) + 1,
    channels: 3,
    hasAlpha: transparent,
    colorSpace: 'Indexed RGB',
    dpi: null,
    frameCount: frames,
    animated: frames > 1,
    structures,
    estimatedQuality: null,
  });
}

function inspectJpeg(bytes: Uint8Array): ImageInspection {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const structures: string[] = ['SOI'];
  let width = 0,
    height = 0,
    bitDepth: number | null = null,
    channels: number | null = null;
  let dpi: ImageInspection['dpi'] = null;
  let quantizationSum = 0,
    quantizationValues = 0;
  for (let offset = 2; offset + 3 < bytes.length;) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) {
      structures.push(marker === 0xda ? 'SOS' : 'EOI');
      break;
    }
    if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length)
      throw new Error('JPEG contains a truncated segment.');
    structures.push(`0xFF${marker.toString(16).toUpperCase()} (${length - 2} bytes)`);
    if (marker >= 0xc0 && marker <= 0xc3 && length >= 8) {
      bitDepth = bytes[offset + 4]!;
      height = view.getUint16(offset + 5);
      width = view.getUint16(offset + 7);
      channels = bytes[offset + 9]!;
    }
    if (
      marker === 0xe0 &&
      length >= 14 &&
      ascii.decode(bytes.subarray(offset + 4, offset + 9)) === 'JFIF\0'
    ) {
      const unit = bytes[offset + 11]!;
      const x = view.getUint16(offset + 12),
        y = view.getUint16(offset + 14);
      if (unit === 1) dpi = { x, y };
      if (unit === 2) dpi = { x: Math.round(x * 2.54), y: Math.round(y * 2.54) };
    }
    if (marker === 0xdb) {
      for (let cursor = offset + 5; cursor < offset + 2 + length; cursor += 1) {
        quantizationSum += bytes[cursor]!;
        quantizationValues += 1;
      }
    }
    offset += 2 + length;
  }
  if (!width || !height) throw new Error('JPEG does not contain a supported frame header.');
  const average = quantizationValues ? quantizationSum / quantizationValues : 0;
  const estimatedQuality = average
    ? Math.max(1, Math.min(100, Math.round(100 - average / 2.55)))
    : null;
  return base(bytes, {
    format: 'jpeg',
    width,
    height,
    bitDepth,
    channels,
    hasAlpha: false,
    colorSpace: channels === 1 ? 'Grayscale' : channels === 4 ? 'CMYK/YCCK' : 'YCbCr/RGB',
    dpi,
    frameCount: 1,
    animated: false,
    structures,
    estimatedQuality,
  });
}

function inspectWebp(bytes: Uint8Array): ImageInspection {
  if (bytes.length < 20) throw new Error('WebP is missing a complete RIFF header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const structures: string[] = [];
  let width = 0,
    height = 0,
    alpha = false,
    frames = 0;
  for (let offset = 12; offset <= bytes.length - 8;) {
    const type = ascii.decode(bytes.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    const end = offset + 8 + length + (length & 1);
    if (end > bytes.length) throw new Error('WebP contains a truncated chunk.');
    structures.push(`${type} (${length} bytes)`);
    if (type === 'VP8X' && length >= 10) {
      alpha = (bytes[offset + 8]! & 0x10) !== 0;
      width = 1 + bytes[offset + 12]! + (bytes[offset + 13]! << 8) + (bytes[offset + 14]! << 16);
      height = 1 + bytes[offset + 15]! + (bytes[offset + 16]! << 8) + (bytes[offset + 17]! << 16);
    }
    if (type === 'ANMF') frames += 1;
    offset = end;
  }
  if (!width || !height)
    throw new Error('WebP inspection currently requires a VP8X extended header.');
  frames = Math.max(1, frames);
  return base(bytes, {
    format: 'webp',
    width,
    height,
    bitDepth: 8,
    channels: alpha ? 4 : 3,
    hasAlpha: alpha,
    colorSpace: 'YCbCr/RGB',
    dpi: null,
    frameCount: frames,
    animated: frames > 1,
    structures,
    estimatedQuality: null,
  });
}

/** Reads deterministic container facts without decoding pixels or contacting a server. */
export function inspectImageContainer(input: ArrayBuffer | Uint8Array): ImageInspection {
  const bytes = bytesOf(input);
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])
  )
    return inspectPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return inspectJpeg(bytes);
  if (ascii.decode(bytes.subarray(0, 3)) === 'GIF') return inspectGif(bytes);
  if (
    ascii.decode(bytes.subarray(0, 4)) === 'RIFF' &&
    ascii.decode(bytes.subarray(8, 12)) === 'WEBP'
  )
    return inspectWebp(bytes);
  throw new Error('Image Inspector supports PNG, JPEG, GIF, and WebP containers.');
}
