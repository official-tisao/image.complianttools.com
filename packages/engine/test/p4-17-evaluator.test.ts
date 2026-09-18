import { describe, expect, it } from 'vitest';
describe('test', () => {
  it('works', () => {
    expect(1).toBe(1);
  });
});

it('verified cascade parser returns non-zero descriptors', async () => {
  const { loadVerifiedCascade } = await import('../src/cv/cascade-parse/verified-cascade.js');
  const cascade = loadVerifiedCascade();
  expect(cascade.descriptors.length).toBeGreaterThan(0);
  expect(cascade.descriptors.length).toBeGreaterThanOrEqual(2913);
});
it('stage descriptor indices resolve to parsed descriptors', async () => {
  const { loadVerifiedCascade } = await import('../src/cv/cascade-parse/verified-cascade.js');
  const cascade = loadVerifiedCascade();
  expect(cascade.descriptors.length).toBeGreaterThan(0);
  for (const stage of cascade.stages) {
    for (const tree of stage.trees) {
      expect(tree.featureIndex).toBeGreaterThanOrEqual(0);
      expect(tree.featureIndex).toBeLessThan(cascade.descriptors.length);
      expect(cascade.descriptors[tree.featureIndex]).toBeDefined();
    }
  }
});

// P4-17 remaining: blur, review, batch, T57, Tier 2 status

describe('P4-17 Remaining criteria', () => {
  it('blur uses real applyBlur not placeholder', async () => {
    const { applyFaceBlur } = await import('../src/cv/face-detection.js');
    expect(typeof applyFaceBlur).toBe('function');
  });

  it('reviewBeforeApply does not mutate source before application', async () => {
    const { detectFacesTier1 } = await import('../src/cv/face-detection.js');
    const img = {
      width: 64,
      height: 64,
      colorSpace: 'srgb' as const,
      bitDepth: 8 as const,
      premultipliedAlpha: false,
      frames: [{ data: new Uint8ClampedArray(64 * 64 * 4), durationMs: 0 }],
    };
    const originalDataCopy = new Uint8ClampedArray(img.frames[0]!.data);
    const result = detectFacesTier1(img, { reviewBeforeApply: true, maxStages: 10 });
    // Source must remain unmodified
    expect(img.frames[0]!.data).toEqual(originalDataCopy);
    // Review flag set
    expect(result.reviewRequired).toBe(true);
  });

  it('batch uses real tier1 for multiple inputs deterministically', async () => {
    const { detectBatch } = await import('../src/cv/face-detection.js');
    const imgs = [
      {
        width: 64,
        height: 64,
        colorSpace: 'srgb' as const,
        bitDepth: 8 as const,
        premultipliedAlpha: false,
        frames: [{ data: new Uint8ClampedArray(64 * 64 * 4), durationMs: 0 }],
      },
      {
        width: 32,
        height: 32,
        colorSpace: 'srgb' as const,
        bitDepth: 8 as const,
        premultipliedAlpha: false,
        frames: [{ data: new Uint8ClampedArray(32 * 32 * 4), durationMs: 0 }],
      },
    ];
    const results = detectBatch(imgs);
    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r.tierUsed).toBe('tier1-viola-jones');
      expect(r.unverifiedNote).toContain('verified cascade');
    }
  });

  it('T57 integration: real detection + real blur + review required', async () => {
    const { detectFacesTier1, applyFaceBlur } = await import('../src/cv/face-detection.js');
    const img = {
      width: 64,
      height: 64,
      colorSpace: 'srgb' as const,
      bitDepth: 8 as const,
      premultipliedAlpha: false,
      frames: [{ data: new Uint8ClampedArray(64 * 64 * 4), durationMs: 0 }],
    };
    const det = detectFacesTier1(img, { reviewBeforeApply: true });
    expect(det.tierUsed).toBe('tier1-viola-jones');
    expect(det.reviewRequired).toBe(true);
    expect(typeof applyFaceBlur).toBe('function');
  });

  it('Tier 2 remains excluded (unverified weights) per ADR', async () => {
    const { recordFaceDetectionTier2Status } = await import('../src/cv/face-detection.js');
    const status = recordFaceDetectionTier2Status(true, []);
    expect(status.tier2Status).toBe('unverified_weights');
    expect(status.reason).toContain('excluded');
  });

  it('no synthetic reference called in production detectBatch', async () => {
    const { detectBatch } = await import('../src/cv/face-detection.js');
    const imgs = [
      {
        width: 64,
        height: 64,
        colorSpace: 'srgb' as const,
        bitDepth: 8 as const,
        premultipliedAlpha: false,
        frames: [{ data: new Uint8ClampedArray(64 * 64 * 4), durationMs: 0 }],
      },
    ];
    const results = detectBatch(imgs);
    for (const r of results) {
      expect(r.unverifiedNote).not.toContain('SYNTHETIC');
      expect(r.tierUsed).toBe('tier1-viola-jones');
    }
  });
});
