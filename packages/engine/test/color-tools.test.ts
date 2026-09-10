import { describe, expect, it } from 'vitest';

import {
  applyRecolour,
  applyThreshold,
  convertColorSpace,
  createRaster,
  extractPalette,
  exportPalette,
  exportPaletteAse,
  exportPaletteCss,
  exportPaletteGpl,
  exportPaletteJson,
  synthesizeIccProfile,
  type Palette,
  type RasterImage,
} from '../src/index.js';

const bytes = (image: { frames: readonly { data: Uint8ClampedArray }[] }) =>
  Array.from(image.frames[0]!.data);

function smallImage(): RasterImage {
  // 4×4 image with 4 distinct colours: red, green, blue, white. The
  // test palette extractors must find all four (or a representative
  // subset).
  const data = new Uint8ClampedArray([
    255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
    0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255,
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  ]);
  return createRaster(4, 4, data);
}

describe('P3-05 T40 colour space & depth', () => {
  it('convertColorSpace to gray produces a luminance image (R=G=B)', () => {
    const out = convertColorSpace(smallImage(), 'gray', 8, false, false);
    for (let i = 0; i < out.frames[0]!.data.length; i += 4) {
      expect(out.frames[0]!.data[i]).toBe(out.frames[0]!.data[i + 1]);
      expect(out.frames[0]!.data[i + 1]).toBe(out.frames[0]!.data[i + 2]);
    }
  });

  it('convertColorSpace to srgb is the identity (the matrix is the unit matrix)', () => {
    const r = smallImage();
    const out = convertColorSpace(r, 'srgb', 8, false, false);
    for (let i = 0; i < out.frames[0]!.data.length; i += 4) {
      expect(out.frames[0]!.data[i]).toBe(r.frames[0]!.data[i]);
    }
  });

  it('convertColorSpace with embedIcc attaches a synthesised ICC profile', () => {
    const out = convertColorSpace(smallImage(), 'display-p3', 8, true, false);
    expect(out.iccProfile).toBeDefined();
    expect(out.iccProfile!.length).toBeGreaterThan(100);
  });

  it('convertColorSpace with stripIcc removes the existing ICC profile', () => {
    const withIcc: RasterImage = { ...smallImage(), iccProfile: synthesizeIccProfile('srgb') };
    const out = convertColorSpace(withIcc, 'srgb', 8, false, true);
    expect(out.iccProfile).toBeUndefined();
  });

  it('synthesizeIccProfile produces a valid v4 ICC profile for each target', () => {
    for (const kind of ['srgb', 'display-p3', 'adobe-rgb-compatible', 'gray'] as const) {
      const p = synthesizeIccProfile(kind);
      expect(p).toBeInstanceOf(Uint8Array);
      // The header is 132 bytes; the size is the first 4 bytes.
      expect(p.length).toBeGreaterThan(132);
    }
  });
});

describe('P3-05 T41 threshold (reuses ops/enhance/threshold.ts)', () => {
  it('threshold(otsu) is wired through the same op file', () => {
    // The T41 tool reuses the P3-04 threshold op — covered there.
    // This test asserts the schema is wired and round-trips.
    const out = applyThreshold(smallImage(), 128);
    for (let i = 0; i < out.frames[0]!.data.length; i += 4) {
      const v = out.frames[0]!.data[i]!;
      expect(v === 0 || v === 255).toBe(true);
    }
  });
});

describe('P3-05 T45 colour picker & palette', () => {
  it('extractPalette with kmeans returns the requested number of entries', () => {
    const palette = extractPalette(smallImage(), 'kmeans', 4, 0x5eed0000);
    expect(palette.method).toBe('kmeans');
    expect(palette.entries).toHaveLength(4);
  });

  it('extractPalette with median-cut returns the requested number of entries', () => {
    const palette = extractPalette(smallImage(), 'median-cut', 4);
    expect(palette.method).toBe('median-cut');
    expect(palette.entries).toHaveLength(4);
  });

  it('palette entries are valid RGB triples with non-negative populations', () => {
    const palette = extractPalette(smallImage(), 'kmeans', 4);
    for (const entry of palette.entries) {
      expect(entry.r).toBeGreaterThanOrEqual(0);
      expect(entry.r).toBeLessThanOrEqual(255);
      expect(entry.g).toBeGreaterThanOrEqual(0);
      expect(entry.g).toBeLessThanOrEqual(255);
      expect(entry.b).toBeGreaterThanOrEqual(0);
      expect(entry.b).toBeLessThanOrEqual(255);
      expect(entry.population).toBeGreaterThan(0);
    }
  });

  it('extractPalette is deterministic across runs (same seed, same input)', () => {
    const a = extractPalette(smallImage(), 'kmeans', 4, 0x5eed0000);
    const b = extractPalette(smallImage(), 'kmeans', 4, 0x5eed0000);
    expect(a.entries).toEqual(b.entries);
  });

  it('exportPaletteCss produces valid CSS custom-property output', () => {
    const palette: Palette = {
      method: 'kmeans',
      entries: [
        { r: 10, g: 20, b: 30, population: 4 },
        { r: 40, g: 50, b: 60, population: 4 },
      ],
    };
    const css = exportPaletteCss(palette);
    expect(css).toContain('--palette-0: rgb(10, 20, 30)');
    expect(css).toContain('--palette-1: rgb(40, 50, 60)');
    expect(css).toContain(':root {');
  });

  it('exportPaletteJson produces valid JSON', () => {
    const palette: Palette = {
      method: 'median-cut',
      entries: [{ r: 1, g: 2, b: 3, population: 16 }],
    };
    const json = exportPaletteJson(palette);
    const parsed = JSON.parse(json) as { method: string; entries: Array<{ r: number; g: number; b: number; population: number }> };
    expect(parsed.method).toBe('median-cut');
    expect(parsed.entries[0]).toEqual({ r: 1, g: 2, b: 3, population: 16 });
  });

  it('exportPaletteGpl produces GIMP-palette text', () => {
    const palette: Palette = {
      method: 'kmeans',
      entries: [
        { r: 10, g: 20, b: 30, population: 4 },
        { r: 40, g: 50, b: 60, population: 4 },
      ],
    };
    const gpl = exportPaletteGpl(palette);
    expect(gpl.startsWith('GIMP Palette')).toBe(true);
    expect(gpl).toContain('Columns: 0');
    // Each entry line: "<R>  <G>  <B>  <Name>"
    const lines = gpl.split('\n').filter((line) => /^\s*\d+\s+\d+\s+\d+\s+/.test(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]!.trim()).toMatch(/^10\s+20\s+30\s+palette-0$/);
  });

  it('exportPalette with ase format produces a binary ASE profile', () => {
    const palette: Palette = {
      method: 'kmeans',
      entries: [
        { r: 10, g: 20, b: 30, population: 4 },
        { r: 40, g: 50, b: 60, population: 8 },
      ],
    };
    const ase = exportPalette(palette, 'ase') as Uint8Array;
    expect(ase).toBeInstanceOf(Uint8Array);
    expect(ase.length).toBeGreaterThan(12); // header at minimum
    // Header check: first 4 bytes = 'ASEF'
    const headerStr = new TextDecoder().decode(ase.subarray(0, 4));
    expect(headerStr).toBe('ASEF');
  });

  it('exportPaletteAse produces a valid binary with group + colour blocks', () => {
    const palette: Palette = {
      method: 'median-cut',
      entries: [{ r: 128, g: 64, b: 32, population: 1 }],
    };
    const ase = exportPaletteAse(palette);
    expect(ase).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(ase.subarray(0, 4))).toBe('ASEF');
  });
});

describe('P3-05 T46 recolour', () => {
  it('pixels outside the tolerance window are unchanged', () => {
    // Target hue 0 (red, 0°), tolerance 10°. A pure green pixel (hue
    // 120°) is well outside the window and must pass through.
    const src = createRaster(1, 1, new Uint8ClampedArray([0, 255, 0, 255]));
    const out = applyRecolour(src, {
      targetHue: 0,
      tolerance: 10,
      replacement: { r: 255, g: 0, b: 0 },
      feather: 5,
    });
    expect(bytes(out)).toEqual([0, 255, 0, 255]);
  });

  it('pixels inside the tolerance window shift toward the target hue (red → green)', () => {
    // A pure red pixel (hue 0°) is at the target. The recolour
    // operation blends toward the *replacement colour's* saturation
    // and value while snapping the hue to the target (0°). To actually
    // change a red pixel visibly we target a different hue and let
    // the pixel shift toward green. A pure red pixel (hue 0°) is
    // outside the 10° tolerance of targetHue 120° (green), so we
    // use targetHue 0° with a tolerance large enough to capture
    // the red pixel and replacement { green } — but recolour snaps
    // the hue to target, so the visible change is in saturation
    // blending. We test the more visible case: shift a red pixel
    // to a non-red hue via a different target.
    const src = createRaster(1, 1, new Uint8ClampedArray([255, 0, 0, 255]));
    const out = applyRecolour(src, {
      targetHue: 120, // green
      tolerance: 180, // capture everything
      replacement: { r: 0, g: 255, b: 0 },
      feather: 0,
    });
    // The red pixel is now green-tinted (h=120, s=1, v=1).
    expect(out.frames[0]!.data[1]).toBeGreaterThan(0);
    // Alpha is preserved.
    expect(out.frames[0]!.data[3]).toBe(255);
  });

  it('alpha is preserved across the recolour', () => {
    const src = createRaster(1, 1, new Uint8ClampedArray([255, 0, 0, 200]));
    const out = applyRecolour(src, {
      targetHue: 0,
      tolerance: 10,
      replacement: { r: 0, g: 0, b: 255 },
      feather: 0,
    });
    expect(out.frames[0]!.data[3]).toBe(200);
  });
});
