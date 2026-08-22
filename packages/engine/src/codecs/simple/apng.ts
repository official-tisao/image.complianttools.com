import { decodePngToRaster, encodeRasterAsPng } from '../jsquash.js';

import type { Frame, RasterImage } from '../../types.js';

const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export type PngFrameEncoder = (image: RasterImage) => Promise<ArrayBuffer>;
export type PngFrameDecoder = (bytes: ArrayBuffer) => Promise<RasterImage>;

interface ApngFrameControl {
  width: number;
  height: number;
  x: number;
  y: number;
  durationMs: number;
  dispose: number;
  blend: number;
}

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

function parseFrameControl(data: Uint8Array): ApngFrameControl {
  if (data.length !== 26) throw new Error('APNG fcTL chunk must contain 26 bytes.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const denominator = view.getUint16(22) || 100;
  return {
    width: view.getUint32(4),
    height: view.getUint32(8),
    x: view.getUint32(12),
    y: view.getUint32(16),
    durationMs: Math.round((view.getUint16(20) / denominator) * 1_000),
    dispose: data[24]!,
    blend: data[25]!,
  };
}

function replaceIhdrSize(header: Uint8Array, width: number, height: number): Uint8Array {
  const result = header.slice();
  const view = new DataView(result.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  return result;
}

/** Decodes APNG frames and applies offsets, alpha blending, and disposal on a full-size canvas. */
export async function decodeApng(
  input: ArrayBuffer | Uint8Array,
  pngDecoder: PngFrameDecoder = decodePngToRaster,
): Promise<RasterImage> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const parsed = chunks(bytes);
  const header = parsed.find((item) => item.type === 'IHDR')?.data;
  const animation = parsed.find((item) => item.type === 'acTL')?.data;
  if (!header || header.length !== 13) throw new Error('APNG is missing a valid IHDR chunk.');
  if (!animation || animation.length !== 8)
    throw new Error('PNG does not contain APNG animation control.');
  const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const canvasWidth = headerView.getUint32(0);
  const canvasHeight = headerView.getUint32(4);
  const expectedFrames = new DataView(
    animation.buffer,
    animation.byteOffset,
    animation.byteLength,
  ).getUint32(0);
  const shared = parsed.filter((item) =>
    ['PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP'].includes(item.type),
  );
  const encodedFrames: Array<{ control: ApngFrameControl; data: Uint8Array[] }> = [];
  let current: { control: ApngFrameControl; data: Uint8Array[] } | undefined;
  for (const item of parsed) {
    if (item.type === 'fcTL') {
      current = { control: parseFrameControl(item.data), data: [] };
      encodedFrames.push(current);
    } else if (item.type === 'IDAT') {
      if (!current) throw new Error('APNG IDAT appears before frame control.');
      current.data.push(item.data);
    } else if (item.type === 'fdAT') {
      if (!current || item.data.length < 4) throw new Error('APNG contains an invalid fdAT chunk.');
      current.data.push(item.data.subarray(4));
    }
  }
  if (encodedFrames.length !== expectedFrames)
    throw new Error(`APNG declares ${expectedFrames} frames but contains ${encodedFrames.length}.`);

  const canvas = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
  const frames: Frame[] = [];
  for (const encoded of encodedFrames) {
    const { control } = encoded;
    if (
      control.width === 0 ||
      control.height === 0 ||
      control.x + control.width > canvasWidth ||
      control.y + control.height > canvasHeight ||
      control.dispose > 2 ||
      control.blend > 1
    )
      throw new Error('APNG frame control is outside the canvas or uses an invalid operation.');
    const png = Uint8Array.from([
      ...signature,
      ...chunk('IHDR', replaceIhdrSize(header, control.width, control.height)),
      ...shared.flatMap((item) => [...chunk(item.type, item.data)]),
      ...encoded.data.flatMap((data) => [...chunk('IDAT', data)]),
      ...chunk('IEND', new Uint8Array()),
    ]);
    const decoded = await pngDecoder(png.buffer);
    const source = decoded.frames[0]?.data;
    if (!source || source.length !== control.width * control.height * 4)
      throw new Error('APNG frame decoder returned an invalid raster.');
    const previous = control.dispose === 2 ? canvas.slice() : undefined;
    for (let y = 0; y < control.height; y += 1) {
      for (let x = 0; x < control.width; x += 1) {
        const sourceOffset = (y * control.width + x) * 4;
        const targetOffset = ((control.y + y) * canvasWidth + control.x + x) * 4;
        const alpha = source[sourceOffset + 3]! / 255;
        if (control.blend === 0 || alpha === 1) {
          canvas.set(source.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        } else if (alpha > 0) {
          const destinationAlpha = canvas[targetOffset + 3]! / 255;
          const outputAlpha = alpha + destinationAlpha * (1 - alpha);
          for (let channel = 0; channel < 3; channel += 1)
            canvas[targetOffset + channel] = Math.round(
              (source[sourceOffset + channel]! * alpha +
                canvas[targetOffset + channel]! * destinationAlpha * (1 - alpha)) /
                outputAlpha,
            );
          canvas[targetOffset + 3] = Math.round(outputAlpha * 255);
        }
      }
    }
    frames.push({ data: canvas.slice(), durationMs: control.durationMs });
    if (control.dispose === 1) {
      for (let y = 0; y < control.height; y += 1)
        canvas.fill(
          0,
          ((control.y + y) * canvasWidth + control.x) * 4,
          ((control.y + y) * canvasWidth + control.x + control.width) * 4,
        );
    } else if (previous) canvas.set(previous);
  }
  if (frames.length === 0) throw new Error('APNG contains no frames.');
  return {
    width: canvasWidth,
    height: canvasHeight,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: frames as unknown as RasterImage['frames'],
  };
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
