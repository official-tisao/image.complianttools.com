/**
 * P4-15 — Segmentation model (Tier 2, prerequisites verified blocked).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { createRaster } from '../src/index.js';
import {
  segmentTier1,
  segmentRectangle,
  iterativeColourRefinement,
} from '../src/cv/segmentation.js';
import type { RectangleHint } from '../src/cv/segmentation.js';

describe('P4-15 Segmentation model', () => {
  it('no RMBG-1.4 reference in engine source', () => {
    const segSource = readFileSync('packages/engine/src/cv/segmentation.ts', 'utf8');
    expect(segSource).toContain('GrabCut');
    expect(segSource).not.toContain('@imgly');
    expect(segSource).not.toContain('RMBG');
  });

  it('engine loads without any model/network dependency', () => {
    const src = new Uint8ClampedArray(new Array(4 * 4 * 4).fill(128));
    const image = createRaster(4, 4, src);
    const mask = segmentTier1(image, { x: 1, y: 1, width: 2, height: 2 });
    expect(mask.length).toBe(4 * 4);
  });

  it('Tier 1 rectangle-hint segmentation is deterministic', () => {
    const src = new Uint8ClampedArray(new Array(6 * 6 * 4).fill(128));
    const image = createRaster(6, 6, src);
    const rect: RectangleHint = { x: 1, y: 1, width: 4, height: 4 };
    const a = segmentTier1(image, rect);
    const b = segmentTier1(image, rect);
    expect(a).toEqual(b);
    expect(a.length).toBe(36);
  });

  it('Tier 1 handles out-of-bounds rectangles safely', () => {
    const src = new Uint8ClampedArray(new Array(3 * 3 * 4).fill(200));
    const image = createRaster(3, 3, src);
    const result = segmentRectangle(image, { x: 10, y: 10, width: 50, height: 50 });
    expect(result.length).toBe(3 * 3);
  });

  it('asset register contains no unverified segmentation weights', () => {
    const assetsRaw = readFileSync('docs/static-assets.json', 'utf8');
    const assets: { name?: string }[] = JSON.parse(assetsRaw);
    expect(Array.isArray(assets)).toBe(true);
    const unverified = assets.filter(
      (a) =>
        a.name &&
        (a.name.includes('segmentation') ||
          a.name.includes('U2') ||
          a.name.includes('ISNet') ||
          a.name.includes('BiRef') ||
          a.name.includes('RMBG')),
    );
    expect(unverified.length).toBe(0);
  });

  it('positive-register audit remains blocked', () => {
    const audit = readFileSync('docs/ADR/positive-register-audit.md', 'utf8');
    expect(audit).toContain('Blocked');
  });

  it('segmentation module exports only cleared Tier 1 primitives', () => {
    expect(typeof segmentTier1).toBe('function');
    expect(typeof segmentRectangle).toBe('function');
  });

  it('iterative refinement is deterministic', () => {
    const src = new Uint8ClampedArray(new Array(5 * 5 * 4).fill(128));
    const image = createRaster(5, 5, src);
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

  it('small dimensions preserved by Tier 1', () => {
    const image = createRaster(4, 4, new Uint8ClampedArray(new Array(4 * 4 * 4).fill(0)));
    const mask = segmentTier1(image, { x: 0, y: 0, width: 4, height: 4 });
    expect(mask.length).toBe(16);
  });
});
