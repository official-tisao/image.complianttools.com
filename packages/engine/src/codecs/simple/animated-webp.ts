import { encodeRasterAsWebp } from '../jsquash.js';
import type { Frame, RasterImage } from '../../types.js';

const ascii = new TextEncoder();

function writeUint24(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
}

function chunk(type: string, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(8 + payload.length + (payload.length & 1));
  output.set(ascii.encode(type), 0);
  new DataView(output.buffer).setUint32(4, payload.length, true);
  output.set(payload, 8);
  return output;
}

function imageChunks(webp: Uint8Array): Uint8Array[] {
  if (
    webp.length < 20 ||
    new TextDecoder().decode(webp.subarray(0, 4)) !== 'RIFF' ||
    new TextDecoder().decode(webp.subarray(8, 12)) !== 'WEBP'
  ) {
    throw new Error('Animated WebP frame encoder returned an invalid WebP container.');
  }
  const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength);
  const result: Uint8Array[] = [];
  for (let offset = 12; offset <= webp.length - 8;) {
    const type = new TextDecoder().decode(webp.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    const end = offset + 8 + length + (length & 1);
    if (end > webp.length) throw new Error('Animated WebP frame contains a truncated chunk.');
    if (type === 'ALPH' || type === 'VP8 ' || type === 'VP8L') {
      result.push(webp.slice(offset, end));
    }
    offset = end;
  }
  if (!result.some((item) => new TextDecoder().decode(item.subarray(0, 4)).startsWith('VP8')))
    throw new Error('Animated WebP frame contains no image bitstream.');
  return result;
}

function frameImage(image: RasterImage, frame: Frame): RasterImage {
  return {
    width: image.width,
    height: image.height,
    colorSpace: image.colorSpace,
    bitDepth: 8,
    premultipliedAlpha: image.premultipliedAlpha,
    frames: [frame],
  };
}

/** Encodes full-canvas raster frames and muxes them into a standards-compliant animated WebP. */
export async function encodeAnimatedWebp(
  image: RasterImage,
  options: {
    quality?: number;
    lossless?: boolean;
    nearLossless?: number | 'off';
    alphaQuality?: number;
    method?: number;
    loopCount?: number;
  } = {},
): Promise<Uint8Array> {
  if (image.width < 1 || image.height < 1 || image.width > 0x1000000 || image.height > 0x1000000)
    throw new Error('Animated WebP dimensions must be between 1 and 16,777,216 pixels.');
  if (image.frames.length === 0) throw new Error('Animated WebP requires at least one frame.');
  const loopCount = options.loopCount ?? 0;
  if (!Number.isInteger(loopCount) || loopCount < 0 || loopCount > 0xffff)
    throw new Error('Animated WebP loop count must be an integer from 0 through 65,535.');

  const hasAlpha = image.frames.some((frame) => {
    for (let index = 3; index < frame.data.length; index += 4)
      if (frame.data[index] !== 255) return true;
    return false;
  });
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x02 | (hasAlpha ? 0x10 : 0);
  writeUint24(vp8x, 4, image.width - 1);
  writeUint24(vp8x, 7, image.height - 1);

  const anim = new Uint8Array(6);
  new DataView(anim.buffer).setUint16(4, loopCount, true);
  const chunks = [chunk('VP8X', vp8x), chunk('ANIM', anim)];
  for (const frame of image.frames) {
    const encoded = new Uint8Array(
      await encodeRasterAsWebp(frameImage(image, frame), {
        quality: options.quality ?? 80,
        lossless: options.lossless || typeof options.nearLossless === 'number' ? 1 : 0,
        ...(typeof options.nearLossless === 'number'
          ? { near_lossless: options.nearLossless }
          : {}),
        alpha_quality: options.alphaQuality ?? 100,
        method: options.method ?? 4,
      }),
    );
    const encodedChunks = imageChunks(encoded);
    const payloadLength = 16 + encodedChunks.reduce((sum, item) => sum + item.length, 0);
    const payload = new Uint8Array(payloadLength);
    writeUint24(payload, 6, image.width - 1);
    writeUint24(payload, 9, image.height - 1);
    writeUint24(payload, 12, Math.min(0xffffff, Math.max(10, Math.round(frame.durationMs))));
    payload[15] = 0x02; // Full-canvas frames replace rather than blend with the prior frame.
    let offset = 16;
    for (const encodedChunk of encodedChunks) {
      payload.set(encodedChunk, offset);
      offset += encodedChunk.length;
    }
    chunks.push(chunk('ANMF', payload));
  }

  const size = 12 + chunks.reduce((sum, item) => sum + item.length, 0);
  const output = new Uint8Array(size);
  output.set(ascii.encode('RIFF'), 0);
  new DataView(output.buffer).setUint32(4, size - 8, true);
  output.set(ascii.encode('WEBP'), 8);
  let offset = 12;
  for (const item of chunks) {
    output.set(item, offset);
    offset += item.length;
  }
  return output;
}
