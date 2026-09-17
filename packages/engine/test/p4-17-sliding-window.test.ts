import { describe, expect, it } from 'vitest';
import { detectBatch, detectFacesTier1 } from '../src/cv/face-detection.js';
import {
  generateScanWindows,
  generateMultiScaleWindows,
  nms,
  mapDetectionToOriginal,
  getBaseWindowSize,
} from '../src/cv/sliding-window.js';

function makeImage(w = 64, h = 64) {
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
    colorSpace: 'srgb' as const,
    bitDepth: 8 as const,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

describe('P4-17 Sliding window / multi-scale / NMS', () => {
  it('base window matches verified cascade (24x24 default)', () => {
    const sz = getBaseWindowSize();
    expect(sz.width).toBe(24);
    expect(sz.height).toBe(24);
  });
  it('generateScanWindows respects image bounds', () => {
    const windows = generateScanWindows(64, 64, 24, 24, 1.0);
    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) {
      expect(w.x + w.width).toBeLessThanOrEqual(64);
      expect(w.y + w.height).toBeLessThanOrEqual(64);
      expect(w.scale).toBe(1.0);
    }
  });
  it('generateScanWindows returns empty when window exceeds image', () => {
    expect(generateScanWindows(10, 10, 24, 24, 1.0).length).toBe(0);
  });
  it('multi-scale generates increasing scales with explicit parameters', () => {
    const windows = generateMultiScaleWindows(128, 128, 24, 24, {
      scaleStep: 1.25,
      minSize: 24,
      maxScale: 2.0,
    });
    const scales = new Set(windows.map((w) => w.scale));
    expect(scales.has(1.0)).toBe(true);
    expect(scales.has(1.25)).toBe(true);
  });
  it('multi-scale stops when scaled window exceeds image', () => {
    const windows = generateMultiScaleWindows(32, 32, 24, 24, { scaleStep: 1.25, maxScale: 10.0 });
    const scales = new Set(windows.map((w) => w.scale));
    expect(scales.has(1.0)).toBe(true);
    expect(scales.has(1.25)).toBe(true);
    expect(scales.has(1.5625)).toBe(false);
  });
  it('coordinate mapping reverses scale correctly', () => {
    const m = mapDetectionToOriginal({ x: 50, y: 40, width: 30, height: 30 }, 2.0);
    expect(m.x).toBe(25);
    expect(m.y).toBe(20);
    expect(m.width).toBe(15);
    expect(m.height).toBe(15);
  });
  it('NMS groups overlapping detections by IoU and keeps highest confidence', () => {
    const detections = [
      { x: 10, y: 10, width: 20, height: 20, confidence: 0.95 },
      { x: 12, y: 12, width: 20, height: 20, confidence: 0.6 },
      { x: 60, y: 60, width: 20, height: 20, confidence: 0.8 },
    ];
    const result = nms(detections, 0.3);
    expect(result.length).toBe(2);
    expect(result.some((r) => r.confidence === 0.95)).toBe(true);
    expect(result.some((r) => r.confidence === 0.8)).toBe(true);
  });
  it('NMS produces deterministic ordering', () => {
    const detections = [
      { x: 0, y: 0, width: 10, height: 10, confidence: 0.5 },
      { x: 20, y: 20, width: 10, height: 10, confidence: 0.9 },
    ];
    const a = nms(detections, 0.3);
    const b = nms(detections, 0.3);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) expect(a[i]!.confidence).toBe(b[i]!.confidence);
  });
  it('detectBatch uses real tier1 (not synthetic reference)', () => {
    const imgs = [makeImage(64, 64), makeImage(32, 32)];
    const results = detectBatch(imgs);
    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r.tierUsed).toBe('tier1-viola-jones');
      expect(r.unverifiedNote).toContain('verified cascade');
    }
  });
  it('detectFacesTier1 uses full 25-stage default and respects maxStages', () => {
    const img = makeImage(64, 64);
    const full = detectFacesTier1(img);
    expect(full.unverifiedNote).toContain('25');
    const limited = detectFacesTier1(img, { maxStages: 5 });
    expect(limited.unverifiedNote).toContain('5/');
    expect(limited.unverifiedNote).toContain('25');
  });
});
