import { describe, expect, it } from 'vitest';

import { developDng, developDngMosaic, type DngMosaic } from '../src/index.js';

function constantPlaneReferenceDng(): Uint8Array {
  const width = 4;
  const height = 4;
  const pixelOffset = 320;
  const tags: Array<readonly [number, number, number, number]> = [
    [256, 4, 1, width],
    [257, 4, 1, height],
    [258, 3, 1, 16],
    [259, 3, 1, 1],
    [262, 3, 1, 32803],
    [273, 4, 1, pixelOffset],
    [277, 3, 1, 1],
    [278, 4, 1, height],
    [279, 4, 1, width * height * 2],
    [33421, 3, 2, 0x0002_0002],
    [33422, 1, 4, 0x0201_0100],
    [50706, 1, 4, 0x0000_0401],
    [50707, 1, 4, 0x0000_0101],
    [50710, 1, 3, 0x0002_0100],
    [50711, 3, 1, 1],
    [50714, 4, 1, 0],
    [50717, 4, 1, 1024],
  ];
  const bytes = new Uint8Array(pixelOffset + width * height * 2);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, tags.length, true);
  for (const [index, [tag, type, count, value]] of tags.entries()) {
    const offset = 10 + index * 12;
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    view.setUint32(offset + 8, value, true);
  }
  // RGGB planes are constant: R=1024, G=512, B=0. Bilinear interpolation must
  // therefore reproduce the same independently known colour at every pixel.
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const cfa = 'RGGB'[(y & 1) * 2 + (x & 1)];
      view.setUint16(
        pixelOffset + (y * width + x) * 2,
        cfa === 'R' ? 1024 : cfa === 'G' ? 512 : 0,
        true,
      );
    }
  return bytes;
}

const mosaic: DngMosaic = {
  width: 5,
  height: 5,
  samples: new Uint16Array([
    900, 120, 900, 120, 100, 120, 900, 120, 900, 120, 100, 120, 100, 120, 100, 120, 900, 120, 900,
    120, 900, 120, 100, 120, 100,
  ]),
  bitDepth: 16,
  pattern: 'RGGB',
  blackLevel: 0,
  whiteLevel: 1000,
  asShotGains: [1.2, 1, 0.8],
  colorMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
};

describe('DNG develop orchestration', () => {
  it('develops a DNG fixture to its analytically derived reference pixels', () => {
    const output = developDng(constantPlaneReferenceDng(), {
      demosaic: 'linear',
      whiteBalance: 'camera',
      gamma: 1,
    });
    expect(output).toMatchObject({ width: 4, height: 4, bitDepth: 8, colorSpace: 'srgb' });
    expect(output.frames[0].data).toEqual(
      new Uint8ClampedArray(Array.from({ length: 16 }, () => [255, 128, 0, 255]).flat()),
    );
  });

  it('selects linear, VNG, PPG, DCB, and AHD paths with metadata-derived levels and colour', () => {
    const outputs = (['linear', 'vng', 'ppg', 'dcb', 'ahd'] as const).map((demosaic) =>
      developDngMosaic(mosaic, { demosaic, gamma: 1 }),
    );
    expect(outputs[0]?.frames[0].data).not.toEqual(outputs[1]?.frames[0].data);
    expect(outputs[1]?.frames[0].data).not.toEqual(outputs[2]?.frames[0].data);
    expect(outputs[2]?.frames[0].data).not.toEqual(outputs[3]?.frames[0].data);
    expect(outputs[3]?.frames[0].data).not.toEqual(outputs[4]?.frames[0].data);
    for (const output of outputs) expect(output.frames[0].data).toHaveLength(100);
  });

  it('applies WB choices, exposure, highlight recovery, gamma, gray output, noise, and CA controls', () => {
    const baseline = developDngMosaic(mosaic, { demosaic: 'vng', gamma: 1 });
    const adjusted = developDngMosaic(mosaic, {
      demosaic: 'vng',
      whiteBalance: 'custom',
      temperatureKelvin: 4200,
      tint: 20,
      exposureEv: 1,
      highlightRecovery: 'blend',
      gamma: 2.4,
      outputColorSpace: 'gray',
      noiseReductionThreshold: 12,
      chromaticAberrationCorrection: true,
    });
    expect(adjusted.frames[0].data).not.toEqual(baseline.frames[0].data);
    for (let offset = 0; offset < adjusted.frames[0].data.length; offset += 4) {
      expect(adjusted.frames[0].data[offset]).toBe(adjusted.frames[0].data[offset + 1]);
      expect(adjusted.frames[0].data[offset + 1]).toBe(adjusted.frames[0].data[offset + 2]);
    }
  });

  it('retains full linear precision in true 16-bit RGBA output', () => {
    const output = developDngMosaic(mosaic, { outputBitDepth: 16, gamma: 1 });
    expect(output.bitDepth).toBe(16);
    expect(output.frames[0].data16).toBeInstanceOf(Uint16Array);
    expect(output.frames[0].data16).toHaveLength(100);
    expect(output.frames[0].data16?.[3]).toBe(65535);
    expect(output.frames[0].data16?.some((value) => value % 257 !== 0)).toBe(true);
  });

  it('rejects out-of-range controls explicitly', () => {
    expect(() => developDngMosaic(mosaic, { exposureEv: 4 })).toThrow('-3 through +3');
    expect(() =>
      developDngMosaic(mosaic, { whiteBalance: 'custom', temperatureKelvin: 1000 }),
    ).toThrow('2000 K');
    expect(() => developDngMosaic(mosaic, { noiseReductionThreshold: 101 })).toThrow(
      '0 through 100',
    );
  });
});
