import { createRaster } from '../../ops/raster.js';
import type { RasterImage } from '../../types.js';

/** Decodes X11 bitmap source with the traditional LSB-first unsigned-char payload. */
export function decodeXbm(input: ArrayBuffer | Uint8Array): RasterImage {
  const source = new TextDecoder().decode(
    input instanceof Uint8Array ? input : new Uint8Array(input),
  );
  const width = Number(source.match(/#define\s+\w+_width\s+(\d+)/u)?.[1]);
  const height = Number(source.match(/#define\s+\w+_height\s+(\d+)/u)?.[1]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 100_000 ||
    width > 100_000_000 / height
  )
    throw new Error('Unsupported or unsafe XBM dimensions.');
  const body = source.match(/\{([\s\S]*)\}/u)?.[1];
  if (body === undefined) throw new Error('XBM data array is missing.');
  const values = [...body.matchAll(/0x([0-9a-f]{1,2})|\b(\d{1,3})\b/giu)].map((match) =>
    Number.parseInt(match[1] ?? match[2]!, match[1] ? 16 : 10),
  );
  const rowBytes = Math.ceil(width / 8);
  if (values.length !== rowBytes * height || values.some((value) => value > 255))
    throw new Error('Truncated or invalid XBM pixel data.');
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const black = (values[y * rowBytes + Math.floor(x / 8)]! & (1 << (x % 8))) !== 0;
      rgba.set(black ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * width + x) * 4);
    }
  return createRaster(width, height, rgba);
}

/** Encodes the first raster frame as traditional LSB-first X11 bitmap source. */
export function encodeXbm(image: RasterImage, name = 'image'): Uint8Array {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) throw new Error('XBM name must be a C identifier.');
  if (image.width < 1 || image.height < 1) throw new Error('XBM dimensions must be positive.');
  const frame = image.frames[0];
  if (!frame) throw new Error('Cannot encode an image without a frame.');
  const rowBytes = Math.ceil(image.width / 8);
  const bytes = new Uint8Array(rowBytes * image.height);
  for (let y = 0; y < image.height; y += 1)
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const luminance =
        frame.data[offset]! * 0.2126 +
        frame.data[offset + 1]! * 0.7152 +
        frame.data[offset + 2]! * 0.0722;
      if (frame.data[offset + 3]! >= 128 && luminance < 128)
        bytes[y * rowBytes + Math.floor(x / 8)]! |= 1 << (x % 8);
    }
  const literals = [...bytes].map((value) => `0x${value.toString(16).padStart(2, '0')}`).join(', ');
  return new TextEncoder().encode(
    `#define ${name}_width ${image.width}\n#define ${name}_height ${image.height}\nstatic unsigned char ${name}_bits[] = { ${literals} };\n`,
  );
}

function xpmColour(value: string): readonly [number, number, number, number] {
  if (value === 'None') return [0, 0, 0, 0];
  const hex = value.match(/^#([0-9a-f]{6})$/iu)?.[1];
  if (hex)
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
      255,
    ];
  const named: Record<string, readonly [number, number, number, number]> = {
    black: [0, 0, 0, 255],
    white: [255, 255, 255, 255],
    red: [255, 0, 0, 255],
    green: [0, 128, 0, 255],
    blue: [0, 0, 255, 255],
    yellow: [255, 255, 0, 255],
    gray: [128, 128, 128, 255],
    grey: [128, 128, 128, 255],
  };
  const colour = named[value.toLowerCase()];
  if (!colour) throw new Error(`Unsupported XPM colour ${value}.`);
  return colour;
}

/** Decodes the portable XPM C-source format with #RRGGBB, transparency, and basic named colours. */
export function decodeXpm(input: ArrayBuffer | Uint8Array): RasterImage {
  const source = new TextDecoder().decode(
    input instanceof Uint8Array ? input : new Uint8Array(input),
  );
  const lines = [...source.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/gu)].map((match) => match[1]!);
  const header = lines[0]?.trim().split(/\s+/u).map(Number);
  const width = header?.[0];
  const height = header?.[1];
  const colourCount = header?.[2];
  const charsPerPixel = header?.[3];
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !Number.isInteger(colourCount) ||
    !Number.isInteger(charsPerPixel) ||
    width! < 1 ||
    height! < 1 ||
    colourCount! < 1 ||
    charsPerPixel! < 1 ||
    charsPerPixel! > 8 ||
    width! > 100_000 ||
    width! > 100_000_000 / height! ||
    colourCount! > 65_536 ||
    lines.length !== 1 + colourCount! + height!
  )
    throw new Error('Invalid or unsafe XPM header.');
  const palette = new Map<string, readonly [number, number, number, number]>();
  for (let index = 0; index < colourCount!; index += 1) {
    const definition = lines[1 + index]!;
    const key = definition.slice(0, charsPerPixel);
    const colour = definition.slice(charsPerPixel).match(/(?:^|\s)c\s+([^\s]+)/u)?.[1];
    if (key.length !== charsPerPixel || !colour || palette.has(key))
      throw new Error('Invalid XPM colour definition.');
    palette.set(key, xpmColour(colour));
  }
  const rgba = new Uint8ClampedArray(width! * height! * 4);
  for (let y = 0; y < height!; y += 1) {
    const row = lines[1 + colourCount! + y]!;
    if (row.length !== width! * charsPerPixel!) throw new Error('Truncated XPM pixel row.');
    for (let x = 0; x < width!; x += 1) {
      const colour = palette.get(row.slice(x * charsPerPixel!, (x + 1) * charsPerPixel!));
      if (!colour) throw new Error('XPM pixel references an undefined colour.');
      rgba.set(colour, (y * width! + x) * 4);
    }
  }
  return createRaster(width!, height!, rgba);
}
