/**
 * T15 Spritesheet Tools — engine half. README §4.1, P6-01.
 *
 * Everything here is pure arithmetic over `RasterImage`s: no canvas, no DOM, no
 * `ImageBitmap`. The browser component is responsible for decoding files and for
 * turning the returned rasters into a PNG; this module decides *where every frame
 * lands* and *how the JSON atlas describes that placement*, which is the part that
 * has to agree exactly with the exported sheet or the atlas lies to the game that
 * reads it.
 */

import type { EngineError, Frame, RasterImage } from '../types.js';

export interface SpritesheetPackOptions {
  /** Fixed columns. When omitted a square-ish grid is chosen from the frame count. */
  readonly columns?: number;
  /** Transparent pixels between cells and around the sheet. */
  readonly padding?: number;
  /** Which axis the engine may trim transparent edges to. */
  readonly trim?: 'none' | 'horizontal' | 'both';
}

export interface AtlasFrame {
  /** Zero-based row-major index, matching the order the frames were supplied in. */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  /** Non-zero when the cell was trimmed; the original is recovered by padding at runtime. */
  readonly trimmed: boolean;
}

export interface SpritesheetAtlas {
  readonly image: string;
  readonly size: { readonly w: number; readonly h: number };
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly padding: number;
  readonly frames: readonly AtlasFrame[];
}

export interface SpritesheetPackResult {
  readonly sheet: RasterImage;
  readonly atlas: SpritesheetAtlas;
}

export interface SpritesheetSliceOptions {
  /** Explicit grid. Omitted values are derived from the sheet dimensions. */
  readonly columns?: number;
  readonly rows?: number;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  /** Origin of the first cell inside the sheet. */
  readonly originX?: number;
  readonly originY?: number;
  /** Transparent pixels between cells. */
  readonly padding?: number;
}

export interface SpritesheetSliceResult {
  readonly frames: readonly RasterImage[];
  readonly atlas: SpritesheetAtlas;
}

/** Transparent pixels are anything below this alpha, matching the GIF encoder's own threshold. */
const ALPHA_TRANSPARENT = 128;
/** Guards a single sheet against the same 100 MP ceiling the GIF encoder uses. */
const MAX_SHEET_PIXELS = 100_000_000;

function packError(
  kind: 'unsupported-format' | 'dimension-limit' | 'internal',
  remedy: string,
  extra: Record<string, unknown> = {},
): EngineError {
  return { kind, remedy, ...extra } as EngineError;
}

function assertFrames(frames: readonly RasterImage[]): { width: number; height: number } {
  if (frames.length === 0)
    throw packError(
      'unsupported-format',
      'Choose at least one image so there is something to place on the sheet.',
    );
  const first = frames[0]!;
  for (const frame of frames) {
    if (frame.width < 1 || frame.height < 1)
      throw packError(
        'unsupported-format',
        'Every image must have at least one pixel on each side.',
      );
    if (frame.frames.length < 1)
      throw packError('unsupported-format', 'Every image must contain at least one frame.');
  }
  return { width: first.width, height: first.height };
}

function trimBox(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mode: 'horizontal' | 'both',
): { left: number; top: number; width: number; height: number } {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  const trimRows = mode === 'both';
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3]! < ALPHA_TRANSPARENT) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (trimRows) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  // A fully transparent frame must not collapse to a zero-area cell: it would make the atlas
  // describe an offset the sheet cannot satisfy, so it keeps its own full size instead.
  if (right < 0) return { left: 0, top: 0, width, height };
  return {
    left,
    top: trimRows ? top : 0,
    width: right - left + 1,
    height: trimRows ? bottom - top + 1 : height,
  };
}

/** Copies `data` into a fresh RGBA buffer offset by `left`/`top` inside `width`×`height`. */
function blit(
  destination: Uint8ClampedArray,
  destinationWidth: number,
  source: Uint8ClampedArray,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * width * 4;
    const targetStart = ((top + y) * destinationWidth + left) * 4;
    destination.set(source.subarray(sourceStart, sourceStart + width * 4), targetStart);
  }
}

/**
 * Copies a `width`×`height` region out of a source raster whose rows are `sourceWidth` apart.
 *
 * The trim path needs this: it copies only the retained sub-rectangle out of a wider frame, and
 * reading rows at the *trimmed* stride would shear the result into nonsense.
 */
function blitRegion(
  destination: Uint8ClampedArray,
  destinationWidth: number,
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceLeft: number,
  sourceTop: number,
  destLeft: number,
  destTop: number,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((sourceTop + y) * sourceWidth + sourceLeft) * 4;
    const targetStart = ((destTop + y) * destinationWidth + destLeft) * 4;
    destination.set(source.subarray(sourceStart, sourceStart + width * 4), targetStart);
  }
}

/** Copies a cell back out of a sheet into a standalone raster of its own size. */
function cropFrame(
  sheet: RasterImage,
  x: number,
  y: number,
  width: number,
  height: number,
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const source = sheet.frames[0]!.data;
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * sheet.width + x) * 4;
    data.set(source.subarray(sourceStart, sourceStart + width * 4), row * width * 4);
  }
  return {
    width,
    height,
    colorSpace: sheet.colorSpace,
    bitDepth: sheet.bitDepth,
    premultipliedAlpha: sheet.premultipliedAlpha,
    frames: [{ data, durationMs: sheet.frames[0]!.durationMs }],
  };
}

/**
 * Places frames into one sheet and returns the JSON atlas that describes the result.
 *
 * Cells are uniform: every frame is drawn into the same `frameWidth`×`frameHeight` cell so a
 * consumer can index the sheet with arithmetic instead of a lookup. A frame smaller than the
 * cell keeps its size in `sourceWidth`/`sourceHeight` and is written at the cell origin.
 */
export function packSpritesheet(
  frames: readonly RasterImage[],
  options: SpritesheetPackOptions = {},
): SpritesheetPackResult {
  const first = assertFrames(frames);
  const padding = options.padding ?? 0;
  if (!Number.isInteger(padding) || padding < 0 || padding > 512)
    throw packError(
      'unsupported-format',
      'Set cell padding to a whole number of pixels from 0 through 512.',
    );
  const trim = options.trim ?? 'none';

  // Uniform cells: the largest frame on each axis, so no frame is ever cropped away.
  const frameWidth = frames.reduce((max, frame) => Math.max(max, frame.width), 0);
  const frameHeight = frames.reduce((max, frame) => Math.max(max, frame.height), 0);

  const requested = options.columns;
  if (
    requested !== undefined &&
    (!Number.isInteger(requested) || requested < 1 || requested > 4096)
  )
    throw packError(
      'unsupported-format',
      'Set the column count to a whole number from 1 through 4096.',
    );
  // Without an explicit count, pick the grid closest to square for this many frames so the
  // sheet does not come out as a single very wide strip.
  const columns = requested ?? Math.max(1, Math.ceil(Math.sqrt(frames.length)));
  const rows = Math.ceil(frames.length / columns);
  const width = columns * frameWidth + padding * (columns + 1);
  const height = rows * frameHeight + padding * (rows + 1);
  if (width * height > MAX_SHEET_PIXELS)
    throw packError(
      'dimension-limit',
      'Choose fewer or smaller images, or use a larger column count to shorten the sheet.',
      { limit: MAX_SHEET_PIXELS, actual: width * height },
    );

  const sheetData = new Uint8ClampedArray(width * height * 4);
  const atlasFrames: AtlasFrame[] = [];
  frames.forEach((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = padding + column * (frameWidth + padding);
    const cellY = padding + row * (frameHeight + padding);
    const source = frame.frames[0]!;

    if (trim === 'none') {
      blit(sheetData, width, source.data, cellX, cellY, frame.width, frame.height);
      atlasFrames.push({
        index,
        x: cellX,
        y: cellY,
        width: frame.width,
        height: frame.height,
        sourceWidth: frame.width,
        sourceHeight: frame.height,
        trimmed: false,
      });
      return;
    }

    const box = trimBox(source.data, frame.width, frame.height, trim);
    // Only the retained sub-rectangle is copied: reading whole rows at the trimmed width would
    // shear the frame, and writing them at the trimmed offset would overrun the sheet.
    blitRegion(
      sheetData,
      width,
      source.data,
      frame.width,
      box.left,
      box.top,
      cellX,
      cellY,
      box.width,
      box.height,
    );
    atlasFrames.push({
      index,
      // The trimmed content was written to the cell origin, so that is where a consumer must
      // read it from; the box offsets describe where it came from inside the source frame.
      x: cellX,
      y: cellY,
      width: box.width,
      height: box.height,
      sourceWidth: frame.width,
      sourceHeight: frame.height,
      trimmed: box.width !== frame.width || box.height !== frame.height,
    });
  });

  const sheetFrame: Frame = { data: sheetData, durationMs: 0 };
  const sheet: RasterImage = {
    width,
    height,
    colorSpace: first.width > 0 ? frames[0]!.colorSpace : 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [sheetFrame],
  };

  return {
    sheet,
    atlas: {
      image: 'spritesheet.png',
      size: { w: width, h: height },
      frameWidth,
      frameHeight,
      columns,
      rows,
      padding,
      frames: atlasFrames,
    },
  };
}

/**
 * Slices a sheet back into frames using the same grid the packer produced.
 *
 * The atlas is returned alongside the frames so a caller can round-trip `pack` → `slice` and
 * get a placement description that still matches the pixels it just produced.
 */
export function sliceSpritesheet(
  sheet: RasterImage,
  options: SpritesheetSliceOptions = {},
): SpritesheetSliceResult {
  if (sheet.width < 1 || sheet.height < 1)
    throw packError('unsupported-format', 'The sheet must have at least one pixel on each side.');
  const padding = options.padding ?? 0;
  if (!Number.isInteger(padding) || padding < 0 || padding > 512)
    throw packError(
      'unsupported-format',
      'Set cell padding to a whole number of pixels from 0 through 512.',
    );
  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;
  if (!Number.isInteger(originX) || !Number.isInteger(originY) || originX < 0 || originY < 0)
    throw packError(
      'unsupported-format',
      'Set the slice origin to non-negative whole pixels inside the sheet.',
    );

  // A cell size larger than the sheet is the common way a caller typos the grid; say so rather
  // than silently returning a single out-of-bounds crop.
  const frameWidth = options.frameWidth ?? 0;
  const frameHeight = options.frameHeight ?? 0;
  if (
    frameWidth < 0 ||
    frameHeight < 0 ||
    !Number.isInteger(frameWidth) ||
    !Number.isInteger(frameHeight)
  )
    throw packError(
      'unsupported-format',
      'Set the frame width and height to non-negative whole pixels.',
    );
  if (frameWidth === 0 || frameHeight === 0)
    throw packError(
      'unsupported-format',
      'Set the frame width and height so the engine knows where the first cell starts.',
    );

  const usableWidth = sheet.width - originX;
  const usableHeight = sheet.height - originY;
  if (frameWidth > usableWidth || frameHeight > usableHeight)
    throw packError(
      'unsupported-format',
      'The frame size is larger than the sheet, so there are no complete cells to slice.',
    );

  const columns =
    options.columns ?? Math.max(1, Math.floor((usableWidth + padding) / (frameWidth + padding)));
  const rows =
    options.rows ?? Math.max(1, Math.floor((usableHeight + padding) / (frameHeight + padding)));
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1)
    throw packError(
      'unsupported-format',
      'Set the row and column counts to whole numbers of at least 1.',
    );
  // The grid has to actually fit, otherwise the last row would slice past the sheet edge and
  // `cropFrame` would read out of bounds.
  if (
    originX + columns * frameWidth + (columns - 1) * padding > sheet.width ||
    originY + rows * frameHeight + (rows - 1) * padding > sheet.height
  )
    throw packError(
      'unsupported-format',
      'The row and column counts do not fit inside the sheet at that frame size and padding.',
    );

  const frames: RasterImage[] = [];
  const atlasFrames: AtlasFrame[] = [];
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = originX + column * (frameWidth + padding);
      const y = originY + row * (frameHeight + padding);
      frames.push(cropFrame(sheet, x, y, frameWidth, frameHeight));
      atlasFrames.push({
        index,
        x,
        y,
        width: frameWidth,
        height: frameHeight,
        sourceWidth: frameWidth,
        sourceHeight: frameHeight,
        trimmed: false,
      });
      index += 1;
    }
  }

  return {
    frames,
    atlas: {
      image: 'spritesheet.png',
      size: { w: sheet.width, h: sheet.height },
      frameWidth,
      frameHeight,
      columns,
      rows,
      padding,
      frames: atlasFrames,
    },
  };
}

/**
 * Reads the grid back out of an atlas without touching pixels.
 *
 * This is what lets a route turn "slice this sheet" plus "use the atlas I exported earlier"
 * into one call, and what lets a test prove the exported JSON matches the exported PNG.
 */
export function atlasFromJson(value: unknown): SpritesheetAtlas {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw packError('unsupported-format', 'The atlas file is not a JSON object.');
  const record = value as Record<string, unknown>;
  const size = record['size'] as { w?: unknown; h?: unknown } | undefined;
  if (
    typeof record['frameWidth'] !== 'number' ||
    typeof record['frameHeight'] !== 'number' ||
    !size ||
    typeof size.w !== 'number' ||
    typeof size.h !== 'number'
  )
    throw packError(
      'unsupported-format',
      'The atlas needs frameWidth, frameHeight, and a size object with w and h numbers.',
    );
  const rawFrames = record['frames'];
  if (!Array.isArray(rawFrames))
    throw packError('unsupported-format', 'The atlas needs a frames array.');
  const frames: AtlasFrame[] = rawFrames.map((entry, position) => {
    const frame = entry as Record<string, unknown>;
    for (const key of ['x', 'y', 'width', 'height'] as const)
      if (typeof frame[key] !== 'number')
        throw packError(
          'unsupported-format',
          `Atlas frame ${position} is missing a numeric ${key}.`,
        );
    return {
      index: position,
      x: frame['x'] as number,
      y: frame['y'] as number,
      width: frame['width'] as number,
      height: frame['height'] as number,
      sourceWidth:
        typeof frame['sourceWidth'] === 'number'
          ? frame['sourceWidth']
          : (frame['width'] as number),
      sourceHeight:
        typeof frame['sourceHeight'] === 'number'
          ? frame['sourceHeight']
          : (frame['height'] as number),
      trimmed: frame['trimmed'] === true,
    };
  });
  return {
    image: typeof record['image'] === 'string' ? record['image'] : 'spritesheet.png',
    size: { w: size.w, h: size.h },
    frameWidth: record['frameWidth'],
    frameHeight: record['frameHeight'],
    columns: typeof record['columns'] === 'number' ? record['columns'] : frames.length,
    rows: typeof record['rows'] === 'number' ? record['rows'] : 1,
    padding: typeof record['padding'] === 'number' ? record['padding'] : 0,
    frames,
  };
}

/**
 * Slices using an atlas's own coordinates rather than a recomputed grid.
 *
 * This is the fidelity path: a consumer that already has the exported JSON gets back exactly
 * the pixels the exporter described, even for a trimmed or padded sheet.
 */
export function sliceSpritesheetByAtlas(
  sheet: RasterImage,
  atlas: SpritesheetAtlas,
): RasterImage[] {
  if (sheet.width < 1 || sheet.height < 1)
    throw packError('unsupported-format', 'The sheet must have at least one pixel on each side.');
  if (atlas.size.w !== sheet.width || atlas.size.h !== sheet.height)
    throw packError(
      'unsupported-format',
      `The atlas describes a ${atlas.size.w}×${atlas.size.h} sheet but this sheet is ${sheet.width}×${sheet.height}.`,
    );
  if (atlas.frames.length === 0)
    throw packError('unsupported-format', 'The atlas lists no frames to slice.');
  return atlas.frames.map((frame) => {
    if (
      !Number.isInteger(frame.x) ||
      !Number.isInteger(frame.y) ||
      !Number.isInteger(frame.width) ||
      !Number.isInteger(frame.height) ||
      frame.x < 0 ||
      frame.y < 0 ||
      frame.width < 1 ||
      frame.height < 1 ||
      frame.x + frame.width > sheet.width ||
      frame.y + frame.height > sheet.height
    )
      throw packError(
        'unsupported-format',
        `Atlas frame ${frame.index} lies outside the ${sheet.width}×${sheet.height} sheet.`,
      );
    return cropFrame(sheet, frame.x, frame.y, frame.width, frame.height);
  });
}
