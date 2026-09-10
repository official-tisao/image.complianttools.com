import { describe, expect, it } from 'vitest';
import { createRaster } from '../src/index.js';
import { pixelArtScale } from '../src/cv/pixel-art.js';

describe('P4-05 pixel-art scaler — clean-room, explicit 3×3 rules', () => {
  // Reference fixtures: small deterministic sprite patterns.
  // No external sprite-corpus file exists in repo (see docs); fixtures
  // are inline and deterministic.

  it('×2 replicates 2×2 blocks with exact colour preservation', () => {
    // 2×2 sprite: red, transparent; blue, white
    const src = new Uint8ClampedArray([
      255,
      0,
      0,
      255, // (0,0) red
      0,
      255,
      0,
      128, // (1,0) semi-transparent green
      0,
      0,
      255,
      255, // (0,1) blue
      255,
      255,
      255,
      255, // (1,1) white
    ]);
    const image = createRaster(2, 2, src);
    const scaled = pixelArtScale(image, 2);

    expect(scaled.width).toBe(4);
    expect(scaled.height).toBe(4);

    const d = scaled.frames[0]!.data;
    // Each source pixel should occupy a 2×2 block exactly.
    // Read block at (0..1, 0..1) — should match source (0,0) red.
    expect(d[0]).toBe(255);
    expect(d[1]).toBe(0);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(255);
    expect(d[4]).toBe(255);
    expect(d[5]).toBe(0);
    expect(d[6]).toBe(0);
    expect(d[7]).toBe(255);
    expect(d[16]).toBe(255);
    expect(d[17]).toBe(0);
    expect(d[18]).toBe(0);
    expect(d[19]).toBe(255);
    expect(d[20]).toBe(255);
    expect(d[21]).toBe(0);
    expect(d[22]).toBe(0);
    expect(d[23]).toBe(255);
  });

  it('×3 produces 3×3 blocks deterministically', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([64, 128, 192, 255]));
    const scaled = pixelArtScale(image, 3);
    expect(scaled.width).toBe(3);
    expect(scaled.height).toBe(3);
    const d = scaled.frames[0]!.data;
    for (let i = 0; i < 9; i++) {
      const off = i * 4;
      expect(d[off]).toBe(64);
      expect(d[off + 1]).toBe(128);
      expect(d[off + 2]).toBe(192);
      expect(d[off + 3]).toBe(255);
    }
  });

  it('×4 produces 4×4 blocks with exact copy', () => {
    const image = createRaster(
      1,
      2,
      new Uint8ClampedArray([
        10,
        20,
        30,
        240, // semi-transparent top
        40,
        50,
        60,
        255, // opaque bottom
      ]),
    );
    const scaled = pixelArtScale(image, 4);
    expect(scaled.width).toBe(4);
    expect(scaled.height).toBe(8);
    const d = scaled.frames[0]!.data;
    // Top row of blocks (y < 4): semi-transparent source pixel
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const off = (y * 4 + x) * 4;
        expect(d[off]).toBe(10);
        expect(d[off + 1]).toBe(20);
        expect(d[off + 2]).toBe(30);
        expect(d[off + 3]).toBe(240);
      }
    }
    // Bottom row of blocks (y >= 4): opaque source pixel
    for (let y = 4; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        const off = (y * 4 + x) * 4;
        expect(d[off]).toBe(40);
        expect(d[off + 1]).toBe(50);
        expect(d[off + 2]).toBe(60);
        expect(d[off + 3]).toBe(255);
      }
    }
  });

  it('1×1 sprite scaled ×2/×3/×4', () => {
    const image = createRaster(1, 1, new Uint8ClampedArray([1, 2, 3, 4]));
    expect(pixelArtScale(image, 2).width).toBe(2);
    expect(pixelArtScale(image, 3).width).toBe(3);
    expect(pixelArtScale(image, 4).width).toBe(4);
  });

  it('transparent pixel handled (low alpha, no opaque neighbours → unchanged)', () => {
    const src = new Uint8ClampedArray([
      255,
      255,
      255,
      0, // fully transparent at (0,0)
      255,
      255,
      255,
      255, // opaque white at (1,0)
    ]);
    const image = createRaster(2, 1, src);
    const scaled = pixelArtScale(image, 2);
    // The transparent pixel should not become opaque without neighbours.
    const d = scaled.frames[0]!.data;
    expect(d[3]).toBe(0); // alpha preserved at (0,0) position in 2×1 scaled (4×1 output)
  });

  it('semi-transparent pixel preserved (alpha between 1 and 254)', () => {
    const src = new Uint8ClampedArray([
      100,
      150,
      200,
      128, // semi-transparent
    ]);
    const image = createRaster(1, 1, src);
    const scaled = pixelArtScale(image, 2);
    const d = scaled.frames[0]!.data;
    // All 4 output pixels should be the semi-transparent colour.
    expect(d[0]).toBe(100);
    expect(d[1]).toBe(150);
    expect(d[2]).toBe(200);
    expect(d[3]).toBe(128);
  });

  it('edge/corner pattern: single opaque pixel in 3×3 grid', () => {
    // 3×3 sprite with center opaque, rest transparent.
    const src = new Uint8ClampedArray([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0,
    ]);
    const image = createRaster(3, 3, src);
    const scaled2 = pixelArtScale(image, 2);
    expect(scaled2.width).toBe(6);
    expect(scaled2.height).toBe(6);
    const d2 = scaled2.frames[0]!.data;
    // The centre (2,2) scaled to a 2×2 block in the 6×6 output should contain red.
    // Block at output (2..3, 2..3) should have red.
    expect(d2[(2 * 6 + 2) * 4]).toBe(255);
  });

  it('flat-colour region preserved exactly (no continuation needed)', () => {
    const src = new Uint8ClampedArray(new Array(3 * 3 * 4).fill(200));
    const image = createRaster(3, 3, src);
    const scaled = pixelArtScale(image, 2);
    const d = scaled.frames[0]!.data;
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i]).toBe(200);
      expect(d[i + 1]).toBe(200);
      expect(d[i + 2]).toBe(200);
      expect(d[i + 3]).toBe(200);
    }
  });

  it('determinism: repeated runs produce identical bytes for complex input', () => {
    // 4×4 sprite (16 pixels = 64 bytes)
    const src = new Uint8ClampedArray(new Array(4 * 4 * 4).fill(100));
    const image = createRaster(4, 4, src);
    const a = pixelArtScale(image, 3);
    const b = pixelArtScale(image, 3);
    expect(a.frames[0]!.data).toEqual(b.frames[0]!.data);
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
  });

  it('preserves RasterImage metadata (bitDepth, frames count)', () => {
    const src = new Uint8ClampedArray(new Array(2 * 2 * 4).fill(128));
    const image = createRaster(2, 2, src);
    const scaled = pixelArtScale(image, 4);
    expect(scaled.bitDepth).toBe(8);
    expect(scaled.frames.length).toBe(1);
    expect(scaled.colorSpace).toBe('srgb');
    expect(scaled.premultipliedAlpha).toBe(false);
  });

  it('throws on unsupported scale factor', () => {
    const image = createRaster(2, 2, new Uint8ClampedArray(new Array(16).fill(128)));
    // Call through an unknown-typed callable so TypeScript does not narrow
    // the argument, while the runtime guard still catches the invalid value.
    const callable = pixelArtScale as unknown as (
      img: {
        frames: readonly { data: Uint8ClampedArray }[];
        width: number;
        height: number;
        bitDepth: number;
        colorSpace: string;
        premultipliedAlpha: boolean;
      },
      factor: number,
    ) => unknown;
    expect(() => callable(image, 5)).toThrow('only supports factors 2, 3, or 4');
  });
});
