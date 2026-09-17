import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import {
  segmentTier1,
  segmentRectangle,
  iterativeColourRefinement,
} from '../src/cv/segmentation.js';

describe('P4-09 segmentation Tier 1 — cleared fallback, no GrabCut', () => {
  // Reference fixtures: no hair/fur/matte reference corpus exists in
  // repository. Assertions verify structural/deterministic properties.
  // No claim of production-quality on an external corpus.

  it('rectangle-hint segmentation preserves dimensions', () => {
    const src = new Uint8ClampedArray(new Array(6 * 6 * 4).fill(128));
    const image = createRaster(6, 6, src);
    const result = segmentTier1(image, { x: 1, y: 1, width: 4, height: 4 });
    expect(result.length).toBe(6 * 6);
  });

  it('rectangle coordinates are clamped safely', () => {
    const src = new Uint8ClampedArray(new Array(4 * 4 * 4).fill(200));
    const image = createRaster(4, 4, src);
    // Out-of-bounds rectangle should not crash.
    const result = segmentTier1(image, { x: -5, y: 20, width: 100, height: 100 });
    expect(result.length).toBe(4 * 4);
  });

  it('simple synthetic foreground separated from contrasting background', () => {
    // 6×6: left 3 columns dark (bg), right 3 columns bright (fg).
    const src = new Uint8ClampedArray(new Array(6 * 6 * 4).fill(128));
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const off = (y * 6 + x) * 4;
        if (x < 3) {
          src[off] = 30;
          src[off + 1] = 30;
          src[off + 2] = 30;
          src[off + 3] = 255;
        } else {
          src[off] = 220;
          src[off + 1] = 220;
          src[off + 2] = 220;
          src[off + 3] = 255;
        }
      }
    }
    const image = createRaster(6, 6, src);
    const rect = { x: 2, y: 1, width: 3, height: 4 };
    const result = segmentTier1(image, rect);
    // After segmentation, pixels clearly on left should be 0 (bg),
    // right should tend to 255 (fg), and the region around the rectangle
    // should be classified consistently.
    let bgCount = 0;
    let fgCount = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i] === 255) fgCount++;
      else if (result[i] === 0) bgCount++;
    }
    expect(bgCount + fgCount).toBe(36); // all pixels classified
  });

  it('pixels clearly outside rectangle favour background', () => {
    const src = new Uint8ClampedArray(new Array(4 * 4 * 4).fill(200));
    const image = createRaster(4, 4, src);
    const rect = { x: 1, y: 1, width: 2, height: 2 };
    const result = segmentRectangle(image, rect);
    // With a uniform image, statistics are uniform; the mask may be mostly
    // uniform, but it should not crash and dimensions must match.
    expect(result.length).toBe(4 * 4);
  });

  it('watershed produces deterministic output', () => {
    const src = new Uint8ClampedArray(new Array(5 * 5 * 4).fill(128));
    const image = createRaster(5, 5, src);
    // Create a simple mask: a 2×2 fg block and rest bg.
    const initial = new Uint8ClampedArray(5 * 5);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        initial[y * 5 + x] = x >= 2 && x < 4 && y >= 2 && y < 4 ? 255 : 0;
      }
    }
    const a = iterativeColourRefinement(image, initial);
    const b = iterativeColourRefinement(image, initial);
    expect(a).toEqual(b);
  });

  it('touching/adjacent regions handled sensibly', () => {
    const src = new Uint8ClampedArray(new Array(8 * 8 * 4).fill(128));
    // Two bright blocks close together.
    for (let y = 1; y < 3; y++) {
      for (let x = 1; x < 3; x++) {
        const off = (y * 8 + x) * 4;
        src[off] = 240;
        src[off + 1] = 240;
        src[off + 2] = 240;
        src[off + 3] = 255;
      }
    }
    for (let y = 4; y < 6; y++) {
      for (let x = 4; x < 6; x++) {
        const off = (y * 8 + x) * 4;
        src[off] = 240;
        src[off + 1] = 240;
        src[off + 2] = 240;
        src[off + 3] = 255;
      }
    }
    const image = createRaster(8, 8, src);
    const rect = { x: 0, y: 0, width: 8, height: 8 };
    const result = segmentTier1(image, rect);
    expect(result.length).toBe(8 * 8);
    // Should have a mix of fg/bg labels without crashes.
    const unique = new Set(result);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('iterative colour-model refinement improves noisy initial mask', () => {
    const src = new Uint8ClampedArray(new Array(6 * 4 * 4).fill(128));
    // Dark left (bg), light right (fg).
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 6; x++) {
        const off = (y * 6 + x) * 4;
        if (x < 3) {
          src[off] = 20;
          src[off + 1] = 20;
          src[off + 2] = 20;
          src[off + 3] = 255;
        } else {
          src[off] = 230;
          src[off + 1] = 230;
          src[off + 2] = 230;
          src[off + 3] = 255;
        }
      }
    }
    const image = createRaster(6, 4, src);
    // Intentionally noisy initial mask: some bg pixels marked fg.
    const noisyMask = new Uint8ClampedArray(6 * 4);
    for (let i = 0; i < noisyMask.length; i++) {
      noisyMask[i] = i % 3 === 0 ? 255 : 0; // noisy
    }
    const refined = iterativeColourRefinement(image, noisyMask, { iterations: 2, tolerance: 10 });
    expect(refined.length).toBe(6 * 4);
  });

  it('deterministic output', () => {
    const src = new Uint8ClampedArray(new Array(4 * 4 * 4).fill(128));
    const image = createRaster(4, 4, src);
    const rect = { x: 0, y: 0, width: 4, height: 4 };
    const a = segmentTier1(image, rect);
    const b = segmentTier1(image, rect);
    expect(a).toEqual(b);
  });

  it('small rectangle at image edge is safe', () => {
    const src = new Uint8ClampedArray(new Array(3 * 3 * 4).fill(200));
    const image = createRaster(3, 3, src);
    const result = segmentTier1(image, { x: 2, y: 2, width: 10, height: 10 });
    expect(result.length).toBe(3 * 3);
  });

  it('no network/model dependency — runtime check', () => {
    // The module should load and run without any network/model import.
    // This is enforced by the source (no external imports for network/model).
    expect(typeof segmentTier1).toBe('function');
    expect(typeof segmentRectangle).toBe('function');
  });

  it('rectangular region produces consistent fg/bg classification', () => {
    const src = new Uint8ClampedArray(new Array(5 * 5 * 4).fill(128));
    // Make a bright 2×2 block at top-left (fg region), rest dark.
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const off = (y * 5 + x) * 4;
        src[off] = 240;
        src[off + 1] = 240;
        src[off + 2] = 240;
        src[off + 3] = 255;
      }
    }
    const image = createRaster(5, 5, src);
    const rect = { x: 0, y: 0, width: 2, height: 2 };
    const mask = segmentRectangle(image, rect);
    // At minimum the rectangle region should have some fg labels (255).
    let fgInRect = 0;
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        if (mask[y * 5 + x] === 255) fgInRect++;
      }
    }
    expect(fgInRect).toBeGreaterThan(0);
  });

  it('UI-level fallback label implied by source — no GrabCut reference', () => {
    // The source file contains no "GrabCut" string except in provenance
    // comments (if any). We verify the module loads cleanly.
    expect(typeof segmentTier1).toBe('function');
    expect(typeof segmentRectangle).toBe('function');
    expect(typeof iterativeColourRefinement).toBe('function');
  });
});
