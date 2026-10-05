/**
 * T15 Spritesheet engine tests — PACK_SPEC / PLAN.md P6-01.
 *
 * These exercise real pixel output and real atlas geometry, not just "did not throw":
 * a frame placed at an atlas offset must actually be recoverable from the sheet at that
 * offset, which is the property a game depending on the atlas depends on.
 */

import { describe, expect, it } from 'vitest';

import {
  atlasFromJson,
  packSpritesheet,
  sliceSpritesheet,
  sliceSpritesheetByAtlas,
} from '../src/ops/spritesheet.js';
import { createRaster, rasterEquals } from '../src/ops/raster.js';
import type { EngineError, RasterImage } from '../src/types.js';

function solid(width: number, height: number, rgba: [number, number, number, number]): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = rgba[0];
    data[index * 4 + 1] = rgba[1];
    data[index * 4 + 2] = rgba[2];
    data[index * 4 + 3] = rgba[3];
  }
  return createRaster(width, height, data);
}

function pixel(image: RasterImage, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4;
  const data = image.frames[0]!.data;
  return [data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!];
}

/**
 * Runs `action`, which the engine signals by throwing a plain `EngineError` object.
 *
 * The value is re-thrown as a real `Error` so a *failure* inside the action surfaces as a normal
 * vitest failure rather than an unhandled object. `action` must be a thunk: these calls throw, so
 * passing a result would throw before the try block is ever entered.
 */
function captureEngineError(action: () => unknown): EngineError {
  let thrown: unknown;
  try {
    action();
  } catch (cause) {
    thrown = cause;
  }
  if (thrown === undefined)
    throw new Error('Expected the call to throw, but it returned normally.');
  if (typeof thrown !== 'object' || thrown === null || !('remedy' in thrown) || !('kind' in thrown))
    throw new Error(`Expected a typed engine error, received: ${String(thrown)}`);
  return thrown as EngineError;
}

describe('packSpritesheet', () => {
  it('places each frame at the coordinates the atlas reports', () => {
    const red = solid(4, 4, [255, 0, 0, 255]);
    const green = solid(4, 4, [0, 255, 0, 255]);
    const blue = solid(4, 4, [0, 0, 255, 255]);

    const { sheet, atlas } = packSpritesheet([red, green, blue], { columns: 2 });

    // 3 frames in 2 columns => 2 rows. Cell (1,1) stays empty, which must be transparent.
    expect(sheet.width).toBe(8);
    expect(sheet.height).toBe(8);
    expect(atlas.columns).toBe(2);
    expect(atlas.rows).toBe(2);

    expect(pixel(sheet, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(sheet, 4, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(sheet, 0, 4)).toEqual([0, 0, 255, 255]);
    expect(pixel(sheet, 4, 4)).toEqual([0, 0, 0, 0]);

    for (const frame of atlas.frames) {
      const sample = pixel(sheet, frame.x, frame.y);
      const expected = [red, green, blue][frame.index]!;
      expect(sample.slice(0, 4)).toEqual(Array.from(expected.frames[0]!.data.slice(0, 4)));
    }
  });

  it('keeps a smaller frame inside the uniform cell and records its source size', () => {
    const large = solid(8, 8, [10, 20, 30, 255]);
    const small = solid(2, 3, [200, 100, 50, 255]);

    const { sheet, atlas } = packSpritesheet([large, small], { columns: 2 });

    expect(sheet.width).toBe(16);
    expect(sheet.height).toBe(8);
    // The cell is uniform; the small frame keeps its own size so nothing is scaled.
    expect(atlas.frames[1]).toMatchObject({
      width: 2,
      height: 3,
      sourceWidth: 2,
      sourceHeight: 3,
      x: 8,
      y: 0,
    });
    expect(pixel(sheet, 8, 0)).toEqual([200, 100, 50, 255]);
    // Nothing was drawn past the small frame inside its cell.
    expect(pixel(sheet, 9, 3)).toEqual([0, 0, 0, 0]);
  });

  it('derives a near-square grid when no column count is given', () => {
    const frames = Array.from({ length: 9 }, () => solid(2, 2, [1, 2, 3, 255]));
    const { atlas } = packSpritesheet(frames);
    expect(atlas.columns).toBe(3);
    expect(atlas.rows).toBe(3);
  });

  it('applies padding between and around cells', () => {
    const frames = [solid(2, 2, [1, 1, 1, 255]), solid(2, 2, [2, 2, 2, 255])];
    const { sheet, atlas } = packSpritesheet(frames, { columns: 2, padding: 1 });
    // 2 columns of width 2 plus padding on the left, between, and after.
    expect(sheet.width).toBe(2 * 2 + 1 * 3);
    expect(sheet.height).toBe(2 + 2);
    expect(atlas.frames[0]!.x).toBe(1);
    expect(atlas.frames[1]!.x).toBe(4);
    // The gutter between cells must stay transparent, not bleed one sprite into the other.
    expect(pixel(sheet, 3, 1)).toEqual([0, 0, 0, 0]);
  });

  it('trims transparent edges and reports the smaller box', () => {
    const data = new Uint8ClampedArray(6 * 4 * 4);
    // A 2×2 opaque block at (2,1)..(3,2) inside a 6×4 transparent frame.
    for (let y = 1; y <= 2; y += 1)
      for (let x = 2; x <= 3; x += 1) {
        const offset = (y * 6 + x) * 4;
        data[offset] = 9;
        data[offset + 1] = 9;
        data[offset + 2] = 9;
        data[offset + 3] = 255;
      }
    const frame = createRaster(6, 4, data);

    const { sheet, atlas } = packSpritesheet([frame], { columns: 1, trim: 'both' });
    const entry = atlas.frames[0]!;

    expect(entry.width).toBe(2);
    expect(entry.height).toBe(2);
    expect(entry.sourceWidth).toBe(6);
    expect(entry.sourceHeight).toBe(4);
    expect(entry.trimmed).toBe(true);
    // The atlas offset points at the trimmed content, not the original corner.
    expect(pixel(sheet, entry.x, entry.y)).toEqual([9, 9, 9, 255]);
  });

  it('does not collapse a fully transparent frame to a zero-area cell', () => {
    const clear = createRaster(4, 4, new Uint8ClampedArray(4 * 4 * 4));
    const { atlas } = packSpritesheet([clear], { columns: 1, trim: 'both' });
    expect(atlas.frames[0]!.width).toBe(4);
    expect(atlas.frames[0]!.height).toBe(4);
    expect(atlas.frames[0]!.trimmed).toBe(false);
  });

  it('rejects an empty frame list with a remedy', () => {
    const error = captureEngineError(() => packSpritesheet([]));
    expect(error.kind).toBe('unsupported-format');
    expect(error.remedy).toMatch(/at least one image/iu);
  });

  it('rejects padding outside the documented range', () => {
    const error = captureEngineError(() =>
      packSpritesheet([solid(2, 2, [0, 0, 0, 255])], { padding: 9999 }),
    );
    expect(error.kind).toBe('unsupported-format');
    expect(error.remedy).toMatch(/0 through 512/iu);
  });

  it('rejects a column count outside the documented range', () => {
    const error = captureEngineError(() =>
      packSpritesheet([solid(2, 2, [0, 0, 0, 255])], { columns: 0 }),
    );
    expect(error.remedy).toMatch(/1 through 4096/iu);
  });

  it('refuses a sheet that would exceed the pixel ceiling', () => {
    // 200 frames of 1000x1000 in one column is 10000 x 1000 = 10 MP, so force it over the cap
    // with padding instead: a modest grid plus generous padding stays over 100 MP.
    const frames = Array.from({ length: 100 }, () => solid(1100, 1100, [0, 0, 0, 255]));
    const error = captureEngineError(() => packSpritesheet(frames, { columns: 1, padding: 512 }));
    expect(error.kind).toBe('dimension-limit');
    expect(error.remedy).toMatch(/fewer or smaller images/iu);
  });
});

describe('sliceSpritesheet', () => {
  it('recovers the exact frames that were packed', () => {
    const originals = [
      solid(4, 4, [255, 0, 0, 255]),
      solid(4, 4, [0, 255, 0, 255]),
      solid(4, 4, [0, 0, 255, 255]),
      solid(4, 4, [255, 255, 0, 255]),
    ];
    const { sheet } = packSpritesheet(originals, { columns: 2 });
    const { frames } = sliceSpritesheet(sheet, {
      frameWidth: 4,
      frameHeight: 4,
      columns: 2,
      rows: 2,
    });

    expect(frames).toHaveLength(4);
    originals.forEach((original, index) =>
      expect(rasterEquals(frames[index]!, original)).toBe(true),
    );
  });

  it('round-trips through the exported atlas, including padding', () => {
    const originals = Array.from({ length: 5 }, (_unused, index) =>
      solid(3, 2, [index * 10, 0, 0, 255]),
    );
    const { sheet, atlas } = packSpritesheet(originals, { columns: 3, padding: 2 });
    const recovered = sliceSpritesheetByAtlas(
      sheet,
      atlasFromJson(JSON.parse(JSON.stringify(atlas))),
    );

    expect(recovered).toHaveLength(5);
    originals.forEach((original, index) =>
      expect(rasterEquals(recovered[index]!, original)).toBe(true),
    );
  });

  it('derives a grid from the sheet size when none is given', () => {
    const frames = Array.from({ length: 4 }, () => solid(6, 6, [1, 1, 1, 255]));
    const { sheet } = packSpritesheet(frames, { columns: 2 });
    // A 12x12 sheet of 6x6 cells is 2x2 without any explicit grid.
    expect(sliceSpritesheet(sheet, { frameWidth: 6, frameHeight: 6 }).frames).toHaveLength(4);
  });

  it('rejects a grid that does not fit inside the sheet', () => {
    const { sheet } = packSpritesheet([solid(4, 4, [0, 0, 0, 255])], { columns: 1 });
    const error = captureEngineError(() =>
      sliceSpritesheet(sheet, { frameWidth: 4, frameHeight: 4, columns: 9, rows: 9 }),
    );
    expect(error.kind).toBe('unsupported-format');
    expect(error.remedy).toMatch(/do not fit inside the sheet/iu);
  });

  it('rejects a frame size larger than the sheet', () => {
    const { sheet } = packSpritesheet([solid(4, 4, [0, 0, 0, 255])], { columns: 1 });
    const error = captureEngineError(() =>
      sliceSpritesheet(sheet, { frameWidth: 64, frameHeight: 64 }),
    );
    expect(error.remedy).toMatch(/larger than the sheet/iu);
  });

  it('rejects a missing frame size instead of guessing one', () => {
    const { sheet } = packSpritesheet([solid(4, 4, [0, 0, 0, 255])], { columns: 1 });
    const error = captureEngineError(() => sliceSpritesheet(sheet, {}));
    expect(error.remedy).toMatch(/frame width and height/iu);
  });

  it('rejects an atlas whose sheet size does not match the image', () => {
    const { sheet, atlas } = packSpritesheet([solid(4, 4, [0, 0, 0, 255])], { columns: 1 });
    const wrongSize = { ...atlas, size: { w: 999, h: 999 } };
    const error = captureEngineError(() => sliceSpritesheetByAtlas(sheet, wrongSize));
    expect(error.remedy).toMatch(/999×999 sheet but this sheet is 4×4/iu);
  });

  it('rejects an atlas frame that points outside the sheet', () => {
    const { sheet, atlas } = packSpritesheet([solid(4, 4, [0, 0, 0, 255])], { columns: 1 });
    const escaping = {
      ...atlas,
      frames: [{ ...atlas.frames[0]!, x: 3, width: 4 }],
    };
    const error = captureEngineError(() => sliceSpritesheetByAtlas(sheet, escaping));
    expect(error.remedy).toMatch(/lies outside/iu);
  });
});

describe('atlasFromJson adversarial input', () => {
  it('rejects a JSON array', () => {
    const error = captureEngineError(() => atlasFromJson([]));
    expect(error.remedy).toMatch(/not a JSON object/iu);
  });

  it('rejects a null document', () => {
    const error = captureEngineError(() => atlasFromJson(null));
    expect(error.remedy).toMatch(/not a JSON object/iu);
  });

  it('rejects a hand-edited atlas missing its frame geometry', () => {
    const error = captureEngineError(() =>
      atlasFromJson({ frameWidth: 4, frameHeight: 4, size: { w: 8, h: 8 }, frames: [{ x: 1 }] }),
    );
    expect(error.remedy).toMatch(/missing a numeric/iu);
  });

  it('rejects an atlas with no frames array', () => {
    const error = captureEngineError(() =>
      atlasFromJson({ frameWidth: 4, frameHeight: 4, size: { w: 8, h: 8 } }),
    );
    expect(error.remedy).toMatch(/frames array/iu);
  });

  it('rejects an atlas without the required geometry block', () => {
    const error = captureEngineError(() => atlasFromJson({ frames: [] }));
    expect(error.remedy).toMatch(/frameWidth, frameHeight/iu);
  });

  it('defaults source sizes for a minimal but valid atlas', () => {
    const atlas = atlasFromJson({
      frameWidth: 2,
      frameHeight: 2,
      size: { w: 2, h: 2 },
      frames: [{ x: 0, y: 0, width: 2, height: 2 }],
    });
    expect(atlas.frames[0]).toMatchObject({ sourceWidth: 2, sourceHeight: 2, trimmed: false });
    expect(atlas.image).toBe('spritesheet.png');
  });
});
