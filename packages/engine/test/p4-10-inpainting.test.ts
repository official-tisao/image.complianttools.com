import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import {
  inpaint,
  efrosLeungInpaint,
  quiltingInpaint,
  confidencePriorityInpaint,
  teleaInpaint,
  navierStokesInpaint,
} from '../src/cv/index.js';

function makeImage(width: number, height: number, data: Uint8ClampedArray) {
  return createRaster(width, height, data);
}

function syntheticRGBA(w: number, h: number): Uint8ClampedArray {
  const arr = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      arr[i + 0] = (x * 40 + y * 30) % 256;
      arr[i + 1] = (x * 15 + y * 50) % 256;
      arr[i + 2] = (x * 70 + y * 20) % 256;
      arr[i + 3] = 255;
    }
  }
  return arr;
}

function maskWith(maskArr: Uint8ClampedArray, maskedIndices: number[]): Uint8ClampedArray {
  const m = new Uint8ClampedArray(maskArr.length);
  for (let k = 0; k < maskArr.length; k++) m[k] = maskArr[k];
  for (const idx of maskedIndices) m[idx] = 255;
  return m;
}

describe('P4-10 — Efros-Leung', () => {
  it('fills masked pixel/region', () => {
    const img = makeImage(4, 3, syntheticRGBA(4, 3));
    const mask = new Uint8ClampedArray(12);
    mask[5] = 255;
    const before = img.frames[0]!.data[5 * 4 + 0];
    const result = efrosLeungInpaint(img, { algorithm: 'efros-leung', mask });
    expect(result.frames[0]!.data[5 * 4 + 0]).not.toBe(before);
  });
  it('preserves unmasked pixels', () => {
    const data = new Uint8ClampedArray([
      10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
    ]);
    const img = makeImage(2, 2, data);
    const mask = new Uint8ClampedArray(4);
    mask[1] = 255;
    const r = efrosLeungInpaint(img, { algorithm: 'efros-leung', mask });
    expect(r.frames[0]!.data[0]).toBe(10);
    expect(r.frames[0]!.data[1]).toBe(20);
  });
  it('is deterministic', () => {
    const img = makeImage(3, 2, syntheticRGBA(3, 2));
    const mask = new Uint8ClampedArray(6);
    mask[3] = 255;
    const a = efrosLeungInpaint(img, { algorithm: 'efros-leung', mask });
    const b = efrosLeungInpaint(img, { algorithm: 'efros-leung', mask });
    expect(a.frames[0]!.data).toEqual(b.frames[0]!.data);
  });
});

describe('P4-10 — Quilting', () => {
  it('fills masked pixel/region', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = maskWith(new Uint8ClampedArray(9), [4]);
    const beforeData = new Uint8ClampedArray(img.frames[0]!.data);
    const result = quiltingInpaint(img, { algorithm: 'quilting', mask });
    expect(result.frames[0]!.data[4 * 4 + 0]).not.toBe(beforeData[4 * 4 + 0]);
  });
  it('preserves unmasked pixels', () => {
    const img = makeImage(
      2,
      2,
      new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]),
    );
    const mask = new Uint8ClampedArray(4);
    mask[1] = 255;
    const r = quiltingInpaint(img, { algorithm: 'quilting', mask });
    expect(r.frames[0]!.data[0]).toBe(1);
  });
  it('is deterministic', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = maskWith(new Uint8ClampedArray(9), [5]);
    const a = quiltingInpaint(img, { algorithm: 'quilting', mask });
    const b = quiltingInpaint(img, { algorithm: 'quilting', mask });
    expect(a.frames[0]!.data).toEqual(b.frames[0]!.data);
  });
});

describe('P4-10 — Confidence Priority', () => {
  it('fills masked pixel/region', () => {
    const img = makeImage(4, 2, syntheticRGBA(4, 2));
    const mask = new Uint8ClampedArray(8);
    mask[3] = 255;
    const before = img.frames[0]!.data[3 * 4 + 1];
    const r = confidencePriorityInpaint(img, { algorithm: 'confidence-priority', mask });
    expect(r.frames[0]!.data[3 * 4 + 1]).not.toBe(before);
  });
  it('preserves unmasked pixels', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = new Uint8ClampedArray(9);
    mask[4] = 255;
    const r = confidencePriorityInpaint(img, { algorithm: 'confidence-priority', mask });
    expect(r.frames[0]!.data[0]).toBe(img.frames[0]!.data[0]);
  });
  it('is deterministic', () => {
    const img = makeImage(3, 2, syntheticRGBA(3, 2));
    const mask = maskWith(new Uint8ClampedArray(6), [2]);
    const a = confidencePriorityInpaint(img, { algorithm: 'confidence-priority', mask });
    const b = confidencePriorityInpaint(img, { algorithm: 'confidence-priority', mask });
    expect(a.frames[0]!.data).toEqual(b.frames[0]!.data);
  });
  it('exercises progressive frontier/confidence behavior', () => {
    const img = makeImage(4, 3, syntheticRGBA(4, 3));
    const mask = new Uint8ClampedArray(12);
    mask[2] = 255;
    mask[5] = 255;
    mask[7] = 255;
    const before = new Uint8ClampedArray(img.frames[0]!.data);
    const r = confidencePriorityInpaint(img, { algorithm: 'confidence-priority', mask });
    let changed = false;
    for (let i = 0; i < before.length; i++) {
      if (mask[i / 4] === 255) if (before[i] !== r.frames[0]!.data[i]) changed = true;
    }
    expect(changed).toBe(true);
  });
});

describe('P4-10 — Telea', () => {
  it('fills masked pixel/region', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = maskWith(new Uint8ClampedArray(9), [4]);
    const before = img.frames[0]!.data[4 * 4 + 2];
    const r = teleaInpaint(img, { algorithm: 'telea', mask });
    expect(r.frames[0]!.data[4 * 4 + 2]).not.toBe(before);
  });
  it('preserves unmasked pixels', () => {
    const img = makeImage(
      2,
      2,
      new Uint8ClampedArray([
        10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
      ]),
    );
    const mask = new Uint8ClampedArray(4);
    mask[3] = 255;
    const r = teleaInpaint(img, { algorithm: 'telea', mask });
    expect(r.frames[0]!.data[0]).toBe(10);
  });
  it('is deterministic', () => {
    const img = makeImage(3, 2, syntheticRGBA(3, 2));
    const mask = maskWith(new Uint8ClampedArray(6), [2]);
    const a = teleaInpaint(img, { algorithm: 'telea', mask });
    const b = teleaInpaint(img, { algorithm: 'telea', mask });
    expect(a.frames[0]!.data).toEqual(b.frames[0]!.data);
  });
  it('exercises distance propagation', () => {
    const img = makeImage(4, 3, syntheticRGBA(4, 3));
    const mask = new Uint8ClampedArray(12);
    mask[0] = 255;
    mask[11] = 255;
    const r = teleaInpaint(img, { algorithm: 'telea', mask });
    expect(r.frames[0]!.data[0]).not.toBe(img.frames[0]!.data[0]);
    expect(r.frames[0]!.data[11 * 4 + 0]).not.toBe(img.frames[0]!.data[11 * 4 + 0]);
  });
});

describe('P4-10 — Navier-Stokes', () => {
  it('fills masked pixel/region', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = maskWith(new Uint8ClampedArray(9), [8]);
    const before = img.frames[0]!.data[8 * 4 + 1];
    const r = navierStokesInpaint(img, { algorithm: 'navier-stokes', mask });
    expect(r.frames[0]!.data[8 * 4 + 1]).not.toBe(before);
  });
  it('preserves unmasked pixels', () => {
    const data = new Uint8ClampedArray([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255, 13, 14, 15, 255, 16, 17, 18, 255,
      19, 20, 21, 255, 22, 23, 24, 255, 25, 26, 27, 255,
    ]);
    const img = makeImage(3, 3, data);
    const mask = new Uint8ClampedArray(9);
    mask[4] = 255;
    const r = navierStokesInpaint(img, { algorithm: 'navier-stokes', mask });
    expect(r.frames[0]!.data[0]).toBe(1);
  });
  it('is deterministic', () => {
    const img = makeImage(2, 2, syntheticRGBA(2, 2));
    const mask = maskWith(new Uint8ClampedArray(4), [3]);
    const a = navierStokesInpaint(img, { algorithm: 'navier-stokes', mask });
    const b = navierStokesInpaint(img, { algorithm: 'navier-stokes', mask });
    expect(a.frames[0]!.data).toEqual(b.frames[0]!.data);
  });
  it('exercises gradient/isophote behavior', () => {
    const img = makeImage(
      4,
      2,
      new Uint8ClampedArray([
        255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
        0, 0, 0, 255, 0, 0, 0, 255,
      ]),
    );
    const mask = new Uint8ClampedArray(8);
    mask[2] = 255;
    const r = navierStokesInpaint(img, { algorithm: 'navier-stokes', mask });
    expect(r.frames[0]!.data[2 * 4 + 0]).not.toBe(255);
  });
});

describe('P4-10 — Validation', () => {
  it('invalid mask length throws', () => {
    const img = makeImage(2, 2, syntheticRGBA(2, 2));
    const badMask = new Uint8ClampedArray(3);
    expect(() => inpaint(img, { algorithm: 'efros-leung', mask: badMask })).toThrow();
  });
  it('invalid dimensions throw where applicable', () => {
    const img = makeImage(2, 2, syntheticRGBA(2, 2));
    const badMask = new Uint8ClampedArray(5);
    expect(() => efrosLeungInpaint(img, { algorithm: 'efros-leung', mask: badMask })).toThrow();
  });
  it('empty/unmasked mask leaves pixels unchanged', () => {
    const img = makeImage(2, 2, syntheticRGBA(2, 2));
    const mask = new Uint8ClampedArray(4);
    const r = inpaint(img, { algorithm: 'telea', mask });
    expect(r.frames[0]!.data[0]).toBe(img.frames[0]!.data[0]);
  });
  it('fully masked image with no known source does not crash', () => {
    const img = makeImage(2, 2, syntheticRGBA(2, 2));
    const fullMask = new Uint8ClampedArray(4);
    for (let i = 0; i < 4; i++) fullMask[i] = 255;
    expect(() =>
      efrosLeungInpaint(img, { algorithm: 'efros-leung', mask: fullMask }),
    ).not.toThrow();
    const r = quiltingInpaint(img, { algorithm: 'quilting', mask: fullMask });
    expect(r.width).toBe(2);
    expect(r.height).toBe(2);
  });
});

describe('P4-10 — Dispatcher', () => {
  it('all five algorithms route correctly', () => {
    const img = makeImage(3, 2, syntheticRGBA(3, 2));
    const mask = maskWith(new Uint8ClampedArray(6), [2]);
    for (const algo of [
      'efros-leung',
      'quilting',
      'confidence-priority',
      'telea',
      'navier-stokes',
    ] as const) {
      const r = inpaint(img, { algorithm: algo, mask });
      expect(r.width).toBe(3);
      expect(r.height).toBe(2);
      expect(r.frames[0]!.data.length).toBe(24);
    }
  });
  it('unknown algorithm throws', () => {
    const img = makeImage(2, 2, syntheticRGBA(2, 2));
    const mask = new Uint8ClampedArray(4);
    expect(() => inpaint(img, { algorithm: 'nonexistent' as never, mask })).toThrow();
    expect(() => inpaint(img, { algorithm: 'unknown-algo', mask })).toThrow();
  });
});

describe('P4-10 — Edge cases', () => {
  it('1x1 image', () => {
    const img = makeImage(1, 1, new Uint8ClampedArray([255, 255, 255, 255]));
    const mask = new Uint8ClampedArray([255]);
    const r = efrosLeungInpaint(img, { algorithm: 'efros-leung', mask });
    expect(r.width).toBe(1);
    expect(r.height).toBe(1);
  });
  it('top-left boundary masked pixel', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = new Uint8ClampedArray(9);
    mask[0] = 255;
    const r = teleaInpaint(img, { algorithm: 'telea', mask });
    expect(r.frames[0]!.data[0]).toBeDefined();
  });
  it('top-right boundary masked pixel', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = new Uint8ClampedArray(9);
    mask[2] = 255;
    const r = teleaInpaint(img, { algorithm: 'telea', mask });
    expect(r.frames[0]!.data[2 * 4 + 0]).toBeDefined();
  });
  it('bottom-left boundary masked pixel', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = new Uint8ClampedArray(9);
    mask[6] = 255;
    const r = navierStokesInpaint(img, { algorithm: 'navier-stokes', mask });
    expect(r.frames[0]!.data[6 * 4 + 0]).toBeDefined();
  });
  it('bottom-right boundary masked pixel', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = new Uint8ClampedArray(9);
    mask[8] = 255;
    const r = navierStokesInpaint(img, { algorithm: 'navier-stokes', mask });
    expect(r.frames[0]!.data[8 * 4 + 0]).toBeDefined();
  });
  it('masked pixels on image edges', () => {
    const img = makeImage(4, 3, syntheticRGBA(4, 3));
    const mask = new Uint8ClampedArray(12);
    mask[0] = 255;
    mask[3] = 255;
    mask[8] = 255;
    mask[11] = 255;
    for (const algo of [
      'efros-leung',
      'quilting',
      'confidence-priority',
      'telea',
      'navier-stokes',
    ] as const) {
      expect(() => inpaint(img, { algorithm: algo, mask })).not.toThrow();
    }
  });
});

describe('P4-10 — Output integrity', () => {
  it('dimensions preserved', () => {
    const img = makeImage(4, 5, syntheticRGBA(4, 5));
    const mask = new Uint8ClampedArray(20);
    mask[10] = 255;
    const r = inpaint(img, { algorithm: 'telea', mask });
    expect(r.width).toBe(4);
    expect(r.height).toBe(5);
  });
  it('RGBA length preserved', () => {
    const img = makeImage(2, 3, syntheticRGBA(2, 3));
    const mask = new Uint8ClampedArray(6);
    mask[3] = 255;
    const r = efrosLeungInpaint(img, { algorithm: 'efros-leung', mask });
    expect(r.frames[0]!.data.length).toBe(2 * 3 * 4);
  });
  it('input image data is not mutated', () => {
    const data = syntheticRGBA(3, 3);
    const original = new Uint8ClampedArray(data);
    const img = makeImage(3, 3, data);
    const mask = maskWith(new Uint8ClampedArray(9), [4]);
    inpaint(img, { algorithm: 'quilting', mask });
    expect(img.frames[0]!.data).toEqual(original);
  });
  it('output data is a separate buffer', () => {
    const img = makeImage(3, 2, syntheticRGBA(3, 2));
    const mask = maskWith(new Uint8ClampedArray(6), [2]);
    const r = inpaint(img, { algorithm: 'telea', mask });
    expect(r.frames[0]!.data).not.toBe(img.frames[0]!.data);
    expect(r.frames[0]!.data.buffer).not.toBe(img.frames[0]!.data.buffer);
  });
});

describe('P4-10 — Behavioral masked-region assertions (all 5 algorithms)', () => {
  it('explicitly compares masked region before/after for Efros-Leung', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = maskWith(new Uint8ClampedArray(9), [4]);
    const before = new Uint8ClampedArray(img.frames[0]!.data);
    const r = efrosLeungInpaint(img, { algorithm: 'efros-leung', mask });
    expect(r.frames[0]!.data[4 * 4 + 0]).not.toBe(before[4 * 4 + 0]);
  });
  it('explicitly compares masked region before/after for Quilting', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = maskWith(new Uint8ClampedArray(9), [4]);
    const before = new Uint8ClampedArray(img.frames[0]!.data);
    const r = quiltingInpaint(img, { algorithm: 'quilting', mask });
    expect(r.frames[0]!.data[4 * 4 + 0]).not.toBe(before[4 * 4 + 0]);
  });
  it('explicitly compares masked region before/after for Confidence Priority', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = maskWith(new Uint8ClampedArray(9), [4]);
    const before = new Uint8ClampedArray(img.frames[0]!.data);
    const r = confidencePriorityInpaint(img, { algorithm: 'confidence-priority', mask });
    expect(r.frames[0]!.data[4 * 4 + 0]).not.toBe(before[4 * 4 + 0]);
  });
  it('explicitly compares masked region before/after for Telea', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = maskWith(new Uint8ClampedArray(9), [4]);
    const before = new Uint8ClampedArray(img.frames[0]!.data);
    const r = teleaInpaint(img, { algorithm: 'telea', mask });
    expect(r.frames[0]!.data[4 * 4 + 0]).not.toBe(before[4 * 4 + 0]);
  });
  it('explicitly compares masked region before/after for Navier-Stokes', () => {
    const img = makeImage(3, 3, syntheticRGBA(3, 3));
    const mask = maskWith(new Uint8ClampedArray(9), [4]);
    const before = new Uint8ClampedArray(img.frames[0]!.data);
    const r = navierStokesInpaint(img, { algorithm: 'navier-stokes', mask });
    expect(r.frames[0]!.data[4 * 4 + 0]).not.toBe(before[4 * 4 + 0]);
  });
});

// Note: The 30-image reference corpus remains absent and unverified.
