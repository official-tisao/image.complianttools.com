import { describe, expect, it } from 'vitest';
import { applyPrivacyRegions, createRaster } from '../src/index.js';

function fixture() {
  const data = new Uint8ClampedArray(8 * 4 * 4);
  for (let y = 0; y < 4; y += 1)
    for (let x = 0; x < 8; x += 1) {
      const offset = (y * 8 + x) * 4;
      data[offset] = x * 20;
      data[offset + 1] = y * 40;
      data[offset + 2] = 17;
      data[offset + 3] = 255;
    }
  return createRaster(8, 4, data);
}

describe('P3-11 regional privacy operations', () => {
  it('keeps pixels outside a blur region byte-identical', () => {
    const source = fixture();
    const output = applyPrivacyRegions(source, [{ x: 2, y: 1, width: 4, height: 2 }], {
      kind: 'blur',
      radius: 1,
    });
    expect(output.frames[0]!.data.slice(0, 8)).toEqual(source.frames[0]!.data.slice(0, 8));
    expect(output.frames[0]!.data).not.toEqual(source.frames[0]!.data);
  });

  it('pixelates each block deterministically', () => {
    const source = fixture();
    const a = applyPrivacyRegions(source, [{ x: 0, y: 0, width: 4, height: 4 }], {
      kind: 'pixelate',
      blockSize: 2,
    });
    const b = applyPrivacyRegions(source, [{ x: 0, y: 0, width: 4, height: 4 }], {
      kind: 'pixelate',
      blockSize: 2,
    });
    expect(a.frames[0]!.data).toEqual(b.frames[0]!.data);
    expect(a.frames[0]!.data.slice(0, 4)).toEqual(a.frames[0]!.data.slice(4, 8));
  });

  it('solid redaction replaces region samples and preserves outside samples', () => {
    const source = fixture();
    const output = applyPrivacyRegions(source, [{ x: 2, y: 1, width: 3, height: 2 }], {
      kind: 'solid',
      colour: [0, 0, 0],
    });
    const sourceData = source.frames[0]!.data;
    const outputData = output.frames[0]!.data;
    expect(Array.from(outputData.slice((1 * 8 + 2) * 4, (1 * 8 + 3) * 4))).toEqual([0, 0, 0, 255]);
    expect(outputData.slice(0, 8)).toEqual(sourceData.slice(0, 8));
    expect(outputData).not.toEqual(sourceData);
  });

  it('clamps out-of-bounds regions without changing dimensions', () => {
    const output = applyPrivacyRegions(fixture(), [{ x: -4, y: -4, width: 20, height: 20 }], {
      kind: 'solid',
    });
    expect(output.width).toBe(8);
    expect(output.height).toBe(4);
    expect(
      output.frames[0]!.data.every((value, index) =>
        index % 4 === 3 ? value === 255 : value === 0,
      ),
    ).toBe(true);
  });
});
