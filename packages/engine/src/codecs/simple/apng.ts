import { encodeRasterAsPng } from '../jsquash.js';

import type { Frame, RasterImage } from '../../types.js';

const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export type PngFrameEncoder = (image: RasterImage) => Promise<ArrayBuffer>;

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const output = new Uint8Array(12 + data.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  output.set(new TextEncoder().encode(type), 4);
  output.set(data, 8);
  view.setUint32(8 + data.length, crc32(output.subarray(4, 8 + data.length)));
  return output;
}

function chunks(input: Uint8Array): { readonly type: string; readonly data: Uint8Array }[] {
  if (!signature.every((value, index) => input[index] === value))
    throw new Error('Internal PNG encoder returned an invalid signature.');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const result: { type: string; data: Uint8Array }[] = [];
  for (let offset = 8; offset < input.length;) {
    if (offset > input.length - 12)
      throw new Error('Internal PNG encoder returned a truncated chunk.');
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > input.length) throw new Error('Internal PNG encoder returned a truncated chunk.');
    result.push({
      type: new TextDecoder('latin1').decode(input.subarray(offset + 4, offset + 8)),
      data: input.subarray(offset + 8, offset + 8 + length),
    });
    offset = end;
  }
  return result;
}

function frameControl(image: RasterImage, frame: Frame, sequence: number): Uint8Array {
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  view.setUint32(0, sequence);
  view.setUint32(4, image.width);
  view.setUint32(8, image.height);
  const duration = Math.max(1, Math.min(65_535, Math.round(frame.durationMs)));
  view.setUint16(20, duration);
  view.setUint16(22, 1_000);
  data[24] = 0; // APNG_DISPOSE_OP_NONE
  data[25] = 0; // APNG_BLEND_OP_SOURCE
  return data;
}

/** Muxes same-sized raster frames into a local APNG using PNG IDAT payloads from the existing encoder. */
export async function encodeApng(
  image: RasterImage,
  loopCount = 0,
  pngEncoder: PngFrameEncoder = encodeRasterAsPng,
): Promise<ArrayBuffer> {
  if (!Number.isInteger(loopCount) || loopCount < 0 || loopCount > 0xffffffff)
    throw new Error('APNG loop count must be an unsigned integer.');
  if (image.frames.length === 0) throw new Error('APNG requires at least one frame.');
  const pngFrames = await Promise.all(
    image.frames.map(async (frame) =>
      chunks(
        new Uint8Array(
          await pngEncoder({
            ...image,
            frames: [frame] as unknown as RasterImage['frames'],
          }),
        ),
      ),
    ),
  );
  const header = pngFrames[0]!.find((item) => item.type === 'IHDR')?.data;
  if (!header) throw new Error('Internal PNG encoder omitted IHDR.');
  const output: Uint8Array[] = [signature, chunk('IHDR', header)];
  const animation = new Uint8Array(8);
  const animationView = new DataView(animation.buffer);
  animationView.setUint32(0, image.frames.length);
  animationView.setUint32(4, loopCount);
  output.push(chunk('acTL', animation));
  let sequence = 0;
  for (let index = 0; index < pngFrames.length; index += 1) {
    const frame = image.frames[index]!;
    output.push(chunk('fcTL', frameControl(image, frame, sequence++)));
    const dataChunks = pngFrames[index]!.filter((item) => item.type === 'IDAT');
    if (dataChunks.length === 0) throw new Error('Internal PNG encoder omitted IDAT.');
    for (const dataChunk of dataChunks) {
      if (index === 0) output.push(chunk('IDAT', dataChunk.data));
      else {
        const data = new Uint8Array(dataChunk.data.length + 4);
        new DataView(data.buffer).setUint32(0, sequence++);
        data.set(dataChunk.data, 4);
        output.push(chunk('fdAT', data));
      }
    }
  }
  output.push(chunk('IEND', new Uint8Array()));
  return Uint8Array.from(output.flatMap((part) => [...part])).buffer;
}
