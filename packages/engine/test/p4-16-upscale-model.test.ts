import { describe, expect, it } from 'vitest';
import { recordUpscaleComparison, dcci, nedi } from '../src/cv/index.js';
import type { RasterImage } from '../src/types.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const resolveRepoPath = (p: string) => join(__dirname, '..', '..', '..', p);

function makeImage(w = 32, h = 32): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      const v = Math.round(((x / w) * 255) % 255);
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
  }
  return {
    width: w,
    height: h,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

describe('P4-16 Upscale model', () => {
  it('recordUpscaleComparison shows unverified weights', () => {
    const img = makeImage(16, 16);
    const result = recordUpscaleComparison(img, 'DCCI', 2);
    expect(result.tier2Status).toBe('unverified_weights');
    expect(result.tier1Available).toBe(true);
  });

  it('recordUpscaleComparison includes the exclusion reason', () => {
    const img = makeImage(8, 8);
    const result = recordUpscaleComparison(img, 'NEDI', 4);
    expect(result.reason).toContain('excluded');
    expect(result.reason).toContain('ADR');
  });

  it('Tier 1 DCCI and NEDI remain functional (verified path)', () => {
    const img = makeImage(4, 4);
    const upDcci = dcci(img, 2);
    expect(upDcci.width).toBe(8);
    expect(upDcci.height).toBe(8);
    const upNedi = nedi(img, 2);
    expect(upNedi.width).toBe(8);
    expect(upNedi.height).toBe(8);
  });

  it('Tier 2 reference requires verified weights; does not fabricate measurements', () => {
    // The P4-16 spec requires a measured comparison in bench/escalation/.
    // That comparison must not contain fabricated fixtures or fabricated numbers.
    // This assertion verifies the comparison file states the correct unverified status.
    // Verify the actual P4-16 escalation artifact exists and records unverified weights.
    const content = readFileSync(
      resolveRepoPath('packages/engine/bench/escalation/p4-16-upscale.md'),
      'utf-8',
    );
    expect(content).toContain('p4_16_upscale_measurement');
    expect(content).toContain('weightLicenceVerified: false');
  });
});
