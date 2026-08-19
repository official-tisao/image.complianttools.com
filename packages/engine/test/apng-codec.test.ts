import { describe, expect, it } from 'vitest';

import { createRaster, encodeApng } from '../src/index.js';

function pngChunk(type: string, data: readonly number[]): number[] {
  return [
    0,
    0,
    0,
    data.length,
    ...[...type].map((character) => character.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0,
  ];
}

const fixturePng = Uint8Array.from([
  137,
  80,
  78,
  71,
  13,
  10,
  26,
  10,
  ...pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
  ...pngChunk('IDAT', [1, 2, 3]),
  ...pngChunk('IEND', []),
]);

function chunkTypes(input: Uint8Array): string[] {
  const result: string[] = [];
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  for (let offset = 8; offset < input.length;) {
    const length = view.getUint32(offset);
    result.push(new TextDecoder('latin1').decode(input.subarray(offset + 4, offset + 8)));
    offset += 12 + length;
  }
  return result;
}

describe('APNG muxer', () => {
  it('muxes PNG frames into a sequenced APNG with animation control chunks', async () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([255, 0, 0, 255]));
    const bytes = new Uint8Array(
      await encodeApng(
        {
          ...image,
          frames: [image.frames[0], { data: image.frames[0].data.slice(), durationMs: 40 }],
        } as typeof image,
        0,
        async () => fixturePng.buffer.slice(0),
      ),
    );
    expect(chunkTypes(bytes)).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'IEND']);
    expect(new DataView(bytes.buffer).getUint32(41)).toBe(2);
  });

  it('rejects an invalid loop count before encoding frames', async () => {
    await expect(encodeApng(createRaster(1, 1), -1)).rejects.toThrow('loop count');
  });
});
