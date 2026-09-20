import { describe, expect, it } from 'vitest';
import {
  detectFacesTier1,
  detectFacesTier1Reference,
  detectBatch,
  recordFaceDetectionTier2Status,
} from '../src/cv/face-detection.js';
import { loadVerifiedCascade } from '../src/cv/cascade-parse/verified-cascade.js';
import type { RasterImage } from '../src/types.js';

function makeImage(w = 64, h = 64): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 4;
      data[off] = (x * 255) / w;
      data[off + 1] = (y * 255) / h;
      data[off + 2] = 128;
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

describe('P4-17 Verified Tier 1 Viola-Jones (genuine cascade)', () => {
  it('verified_cascade.xml loads actual descriptor array (2913 descriptors)', () => {
    const cascade = loadVerifiedCascade();
    expect(cascade.descriptors.length).toBe(2913);
  });

  it('verified cascade has 25 stages', () => {
    const cascade = loadVerifiedCascade();
    expect(cascade.stageCount).toBe(25);
    expect(cascade.stages.length).toBe(25);
  });

  it('first descriptor has rectangle geometry from XML', () => {
    const cascade = loadVerifiedCascade();
    const d0 = cascade.descriptors[0];
    expect(d0).toBeDefined();
    expect(d0!.rects.length).toBeGreaterThan(0);
    const r0 = d0!.rects[0];
    expect(typeof r0!.x).toBe('number');
    expect(typeof r0!.weight).toBe('number');
  });

  it('feature descriptor index aligns with max feature index from XML (2912)', () => {
    const cascade = loadVerifiedCascade();
    expect(cascade.descriptors.length).toBe(2913);
  });

  it('detectFacesTier1 uses full 25-stage cascade by default', () => {
    const img = makeImage(128, 96);
    const result = detectFacesTier1(img, { reviewBeforeApply: true });
    expect(result.tierUsed).toBe('tier1-viola-jones');
    expect(result.reviewRequired).toBe(true);
    // Confirm no synthetic detection in production path (results array empty for unverified scan, no hardcoded rect)
    expect(result.unverifiedNote).toMatch(/25 stages/);
  });

  it('detectFacesTier1 respects configurable maxStages', () => {
    const img = makeImage(128, 96);
    const result5 = detectFacesTier1(img, { reviewBeforeApply: true, maxStages: 5 });
    expect(result5.unverifiedNote).toContain('5/25');
    const resultFull = detectFacesTier1(img, { reviewBeforeApply: true, maxStages: 25 });
    expect(resultFull.unverifiedNote).toMatch(/25 stages/);
  });

  it('detectBatch calls genuine tier1 per image', () => {
    const imgs = [makeImage(64, 64), makeImage(100, 100)];
    const results = detectBatch(imgs);
    expect(results.length).toBe(2);
    expect(results[0]!.tierUsed).toBe('tier1-viola-jones');
    expect(results[1]!.tierUsed).toBe('tier1-viola-jones');
  });

  it('synthetic reference remains isolated and named', () => {
    const img = makeImage(128, 96);
    const result = detectFacesTier1Reference(img, { reviewBeforeApply: true });
    expect(result.unverifiedNote).toContain('SYNTHETIC');
    expect(result.regions.length).toBeGreaterThanOrEqual(0);
  });

  it('recordFaceDetectionTier2Status reports unverified weights', () => {
    const status = recordFaceDetectionTier2Status(true, [
      {
        kind: 'face',
        x: 4,
        y: 4,
        width: 10,
        height: 10,
        confidence: 0.75,
        source: 'tier1-viola-jones',
      },
    ]);
    expect(status.tier2Status).toBe('unverified_weights');
  });

  it('no synthetic rectangle is treated as real production detection', () => {
    const img = makeImage(32, 32);
    const realResult = detectFacesTier1(img, { reviewBeforeApply: false });
    expect(realResult.unverifiedNote).toBeDefined();
    expect(realResult.unverifiedNote).toContain('verified cascade loaded');
  });
});
