import { describe, expect, it } from 'vitest';

import { decodeWithTypedErrors, isEngineError, parseDngMosaic } from '../src/index.js';

function uncompressedDng(): Uint8Array {
  const tags: Array<readonly [number, number, number, number]> = [
    [256, 4, 1, 2],
    [257, 4, 1, 2],
    [258, 3, 1, 16],
    [259, 3, 1, 1],
    [262, 3, 1, 32803],
    [273, 4, 1, 256],
    [279, 4, 1, 8],
    [33421, 3, 2, 0x0002_0002],
    [33422, 1, 4, 0x0201_0100],
    [50714, 4, 1, 64],
    [50717, 4, 1, 4095],
  ];
  const bytes = new Uint8Array(264);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, tags.length, true);
  for (let index = 0; index < tags.length; index += 1) {
    const [tag, type, count, value] = tags[index]!;
    const offset = 10 + index * 12;
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    view.setUint32(offset + 8, value, true);
  }
  for (const [index, value] of [64, 1024, 2048, 4095].entries())
    view.setUint16(256 + index * 2, value, true);
  return bytes;
}

describe('DNG mosaic parser', () => {
  it('reads an uncompressed CFA strip and development levels', () => {
    expect(parseDngMosaic(uncompressedDng())).toMatchObject({
      width: 2,
      height: 2,
      bitDepth: 16,
      pattern: 'RGGB',
      blackLevel: 64,
      whiteLevel: 4095,
      samples: new Uint16Array([64, 1024, 2048, 4095]),
    });
  });

  it('rejects unsupported compression without reading pixel bytes', () => {
    const bytes = uncompressedDng();
    new DataView(bytes.buffer).setUint16(10 + 3 * 12 + 8, 7, true);
    expect(() => parseDngMosaic(bytes)).toThrow('Only uncompressed');
  });

  it('normalizes malformed DNG input into a typed remediable error', async () => {
    try {
      await decodeWithTypedErrors('raw', () => parseDngMosaic(new Uint8Array()));
      throw new Error('DNG unexpectedly decoded.');
    } catch (error) {
      expect(isEngineError(error)).toBe(true);
      expect(error).toMatchObject({
        kind: 'decode-failed',
        format: 'raw',
        remedy: expect.any(String),
      });
    }
  });
});
