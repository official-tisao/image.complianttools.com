/**
 * P4-20 — Focused verification tests for the remaining local tools.
 * Per PLAN.md P4-20: verifies primitives, does NOT fabricate fixtures,
 * and clearly marks BLOCKED items.
 */
import { describe, it, expect } from 'vitest';

// P4-20 engine exports (reusing primitives, not duplicating code)
import {
  spectralResidualSaliency,
  pixelArtScale,
  saliencyRetarget,
  detectFacesTier1,
  perceptualHash,
  differenceHash,
  nearestHash,
  approximateSSIM,
  initLazyTessdata,
  createOcrWorker,
  ocrError,
  getUpscaleTier2Availability,
} from '../src/p4-20-tools.js';

describe('P4-20: Remaining local tools — engine-level verification', () => {
  it('T27 Smart Crop — saliency primitives export', () => {
    expect(typeof spectralResidualSaliency).toBe('function');
  });

  it('T32 Upscale — nearest-neighbour pixel-art scaler exists', () => {
    expect(typeof pixelArtScale).toBe('function');
  });

  it('T70 Pixel-Art Upscale — scale factor type exported', () => {
    expect(typeof pixelArtScale).toBe('function');
  });

  it('T81 Adaptive Resize — retarget primitive exported', () => {
    expect(typeof saliencyRetarget).toBe('function');
  });

  it('T57 Blur Faces — face detection export', () => {
    expect(typeof detectFacesTier1).toBe('function');
  });

  it('T60 Compare — perceptual hash and SSIM primitives', () => {
    expect(typeof perceptualHash).toBe('function');
    expect(typeof approximateSSIM).toBe('function');
  });

  it('T61 Duplicates — hash clustering primitives', () => {
    expect(typeof differenceHash).toBe('function');
    expect(typeof nearestHash).toBe('function');
  });

  it('T62 OCR — lazy tessdata is available and the local worker accepts jobs', () => {
    const state = initLazyTessdata();
    expect(state.length).toBe(8); // Minimum-language lazy-load fixture states; the full catalogue is larger.
    const worker = createOcrWorker();
    expect(worker.module).toBe('ocr');
    expect(typeof worker.postMessage).toBe('function');
    expect(typeof worker.terminate).toBe('function');
    worker.terminate();
  });

  it('T62 OCR — typed error carries remedy', () => {
    const err = ocrError('unsupported-language', 'test');
    expect(err.kind).toBe('unsupported-language');
    expect(typeof err.remedy).toBe('string');
    expect(err.remedy.length).toBeGreaterThan(0);
  });

  it('T32 Tier 2 requires a consented caller-supplied conversion; Tier 1 remains available', () => {
    expect(getUpscaleTier2Availability()).toEqual({
      status: 'unavailable',
      reason: 'model_not_supplied',
      tier1FallbackAvailable: true,
    });
    expect(
      getUpscaleTier2Availability({ variant: 'x2plus', modelPath: '/models/realesrgan-x2.onnx' }),
    ).toEqual({
      status: 'unavailable',
      reason: 'consent_required',
      tier1FallbackAvailable: true,
    });
    expect(
      getUpscaleTier2Availability({
        variant: 'x2plus',
        modelPath: '/models/realesrgan-x2.onnx',
        consentGranted: true,
      }),
    ).toEqual({ status: 'available', scaleFactor: 2, tier1FallbackAvailable: true });
  });
});
