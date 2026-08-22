import { describe, expect, it } from 'vitest';

import { developDngMosaic, type DngMosaic } from '../src/index.js';

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

  it('rejects unsupported depth and out-of-range controls explicitly', () => {
    expect(() => developDngMosaic(mosaic, { outputBitDepth: 16 })).toThrow('not implemented');
    expect(() => developDngMosaic(mosaic, { exposureEv: 4 })).toThrow('-3 through +3');
    expect(() =>
      developDngMosaic(mosaic, { whiteBalance: 'custom', temperatureKelvin: 1000 }),
    ).toThrow('2000 K');
    expect(() => developDngMosaic(mosaic, { noiseReductionThreshold: 101 })).toThrow(
      '0 through 100',
    );
  });
});
