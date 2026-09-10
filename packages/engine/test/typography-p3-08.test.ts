import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import { hasLocalCssLookup, loadFontFamily, hasLocalFontAccess } from '../src/typography/font-access.js';
import { applyStroke, buildShadow, curvePoints, arcPoints } from '../src/typography/stroke-shadow-curve.js';
import { renderText } from '../src/typography/text-render.js';

describe('P3-08 T49 Typography — font access', () => {
  it('detects local CSS lookup guard', () => {
    expect(hasLocalCssLookup('InterVariable, local(\"Inter\")')).toBe(true);
    expect(hasLocalCssLookup('InterVariable')).toBe(false);
  });
  it('probes Local Font Access API', () => {
    const hasApi = hasLocalFontAccess();
    expect(typeof hasApi).toBe('boolean');
  });
  it('loads font family', async () => {
    const result = await loadFontFamily('InterVariable');
    expect(result.family).toBe('InterVariable');
    expect(['self-hosted', 'upload', 'local-access-api', 'system']).toContain(result.source);
  });
});

describe('P3-08 T49 Typography — stroke / shadow / curve / arc', () => {
  it('stroke applies when enabled', () => {
    const s = applyStroke({ width: 2, color: '#FF0000' });
    expect(s.enabled).toBe(true);
    expect(s.width).toBe(2);
    expect(s.color).toBe('#FF0000');
  });
  it('stroke disabled when no options', () => {
    const s = applyStroke(undefined);
    expect(s.enabled).toBe(false);
  });
  it('shadow builds settings', () => {
    const sh = buildShadow({ x: 3, y: 4, blur: 8, color: '#0000FF' });
    expect(sh.enabled).toBe(true);
    expect(sh.x).toBe(3);
  });
  it('curve points returns points array', () => {
    const pts = curvePoints([0, 0], [50, 30], 5);
    expect(pts.length).toBe(6);
  });
  it('arc points returns points', () => {
    const pts = arcPoints(10, 10, 5, 0, 180, 6);
    expect(pts.length).toBe(7);
  });
});

describe('P3-08 T49 Typography — text render integration', () => {
  it('renders text overlay preserving dimensions', () => {
    const img = createRaster(20, 20, new Uint8ClampedArray(20 * 20 * 4).fill(128));
    const out = renderText(img, { text: 'Hello' });
    expect(out.width).toBe(20);
    expect(out.height).toBe(20);
  });
  it('no local() font lookup in engine', () => {
    expect(hasLocalCssLookup('SomeFont')).toBe(false);
    expect(hasLocalCssLookup('SomeFont, local(\"Licensed\")')).toBe(true);
  });
});
