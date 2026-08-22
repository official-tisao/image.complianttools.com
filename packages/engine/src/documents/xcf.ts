import { createRaster } from '../ops/raster.js';
import type { RasterImage } from '../types.js';

export interface XcfLayer {
  readonly name: string;
  readonly image: RasterImage;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly opacity: number;
  readonly visible: boolean;
}

export interface XcfComposite {
  readonly image: RasterImage;
  readonly layers: readonly XcfLayer[];
}

type Reader = {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  u32(offset: number): number;
  i32(offset: number): number;
  pointer(offset: number): number;
  string(offset: number): { value: string; next: number };
};

function reader(bytes: Uint8Array): Reader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ensure = (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset > bytes.length - length)
      throw new Error('XCF structure points outside the file.');
  };
  return {
    bytes,
    view,
    u32(offset) {
      ensure(offset, 4);
      return view.getUint32(offset);
    },
    i32(offset) {
      ensure(offset, 4);
      return view.getInt32(offset);
    },
    pointer(offset) {
      ensure(offset, 4);
      return view.getUint32(offset);
    },
    string(offset) {
      const length = this.u32(offset);
      if (length < 1 || length > 1_000_000) throw new Error('XCF string length is invalid.');
      ensure(offset + 4, length);
      if (bytes[offset + 3 + length] !== 0) throw new Error('XCF string is not null terminated.');
      return {
        value: new TextDecoder().decode(bytes.subarray(offset + 4, offset + 3 + length)),
        next: offset + 4 + length,
      };
    },
  };
}

type Properties = {
  next: number;
  compression?: number;
  opacity?: number;
  visible?: boolean;
  mode?: number;
  offsetX?: number;
  offsetY?: number;
};

function properties(read: Reader, start: number): Properties {
  const result: Properties = { next: start };
  let offset = start;
  let count = 0;
  while (true) {
    if (++count > 4096) throw new Error('XCF property list exceeds the safe limit.');
    const type = read.u32(offset);
    const length = read.u32(offset + 4);
    offset += 8;
    if (type === 0) {
      if (length !== 0) throw new Error('XCF PROP_END has a non-zero payload.');
      return { ...result, next: offset };
    }
    if (length > 16_000_000 || offset > read.bytes.length - length)
      throw new Error('XCF property payload is truncated or too large.');
    if (type === 17) {
      if (length !== 1) throw new Error('XCF compression property has an invalid length.');
      result.compression = read.bytes[offset]!;
    } else if (type === 6) {
      if (length !== 4) throw new Error('XCF opacity property has an invalid length.');
      result.opacity = read.u32(offset);
    } else if (type === 7) {
      if (length !== 4) throw new Error('XCF mode property has an invalid length.');
      result.mode = read.u32(offset);
    } else if (type === 8) {
      if (length !== 4) throw new Error('XCF visibility property has an invalid length.');
      result.visible = read.u32(offset) !== 0;
    } else if (type === 15) {
      if (length !== 8) throw new Error('XCF offsets property has an invalid length.');
      result.offsetX = read.i32(offset);
      result.offsetY = read.i32(offset + 4);
    }
    offset += length;
  }
}

function decodeRleTile(input: Uint8Array, pixels: number, bpp: number): Uint8Array {
  const planes = Array.from({ length: bpp }, () => new Uint8Array(pixels));
  let source = 0;
  for (const plane of planes) {
    let target = 0;
    while (target < pixels) {
      if (source >= input.length) throw new Error('XCF RLE tile is truncated.');
      const control = input[source++]!;
      if (control <= 126) {
        const length = control + 1;
        if (source >= input.length || target > pixels - length)
          throw new Error('XCF RLE repeat exceeds the tile plane.');
        plane.fill(input[source++]!, target, target + length);
        target += length;
      } else if (control === 127) {
        if (source + 3 > input.length) throw new Error('XCF long RLE repeat is truncated.');
        const length = (input[source]! << 8) | input[source + 1]!;
        source += 2;
        if (length < 1 || target > pixels - length)
          throw new Error('XCF long RLE repeat exceeds the tile plane.');
        plane.fill(input[source++]!, target, target + length);
        target += length;
      } else {
        let length = 256 - control;
        if (control === 128) {
          if (source + 2 > input.length) throw new Error('XCF long RLE literal is truncated.');
          length = (input[source]! << 8) | input[source + 1]!;
          source += 2;
        }
        if (length < 1 || source > input.length - length || target > pixels - length)
          throw new Error('XCF RLE literal exceeds the tile plane.');
        plane.set(input.subarray(source, source + length), target);
        source += length;
        target += length;
      }
    }
  }
  const output = new Uint8Array(pixels * bpp);
  for (let pixel = 0; pixel < pixels; pixel += 1)
    for (let channel = 0; channel < bpp; channel += 1)
      output[pixel * bpp + channel] = planes[channel]![pixel]!;
  return output;
}

function decodeLayerPixels(
  read: Reader,
  hierarchyOffset: number,
  width: number,
  height: number,
  layerType: number,
  compression: number,
): RasterImage {
  const hierarchyWidth = read.u32(hierarchyOffset);
  const hierarchyHeight = read.u32(hierarchyOffset + 4);
  const bpp = read.u32(hierarchyOffset + 8);
  if (hierarchyWidth !== width || hierarchyHeight !== height)
    throw new Error('XCF hierarchy dimensions do not match the layer.');
  const expectedBpp = [3, 4, 1, 2][layerType];
  if (expectedBpp === undefined || bpp !== expectedBpp)
    throw new Error(
      'Only 8-bit RGB, RGBA, grayscale, and grayscale-alpha XCF layers are supported.',
    );
  const levelOffset = read.pointer(hierarchyOffset + 12);
  if (levelOffset === 0 || read.pointer(hierarchyOffset + 16) !== 0)
    throw new Error('XCF hierarchy has an invalid primary level list.');
  if (read.u32(levelOffset) !== width || read.u32(levelOffset + 4) !== height)
    throw new Error('XCF level dimensions do not match the layer.');
  const columns = Math.ceil(width / 64);
  const rows = Math.ceil(height / 64);
  const tileCount = columns * rows;
  if (tileCount > 1_000_000) throw new Error('XCF layer exceeds the safe tile-count limit.');
  const tileOffsets = Array.from({ length: tileCount }, (_, index) =>
    read.pointer(levelOffset + 8 + index * 4),
  );
  if (
    read.pointer(levelOffset + 8 + tileCount * 4) !== 0 ||
    tileOffsets.some((value) => value === 0)
  )
    throw new Error('XCF tile pointer list is incomplete.');
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let tile = 0; tile < tileCount; tile += 1) {
    const tileX = tile % columns;
    const tileY = Math.floor(tile / columns);
    const tileWidth = Math.min(64, width - tileX * 64);
    const tileHeight = Math.min(64, height - tileY * 64);
    const pixels = tileWidth * tileHeight;
    const start = tileOffsets[tile]!;
    const end = tileOffsets[tile + 1] ?? read.bytes.length;
    if (start >= end || end > read.bytes.length) throw new Error('XCF tile range is invalid.');
    const expected = pixels * bpp;
    const packed = read.bytes.subarray(start, end);
    const decoded =
      compression === 0
        ? packed.subarray(0, expected)
        : compression === 1
          ? decodeRleTile(packed, pixels, bpp)
          : undefined;
    if (!decoded || decoded.length < expected)
      throw new Error(`XCF compression mode ${compression} is unsupported or truncated.`);
    for (let y = 0; y < tileHeight; y += 1)
      for (let x = 0; x < tileWidth; x += 1) {
        const source = (y * tileWidth + x) * bpp;
        const target = ((tileY * 64 + y) * width + tileX * 64 + x) * 4;
        if (layerType <= 1)
          rgba.set(
            [
              decoded[source]!,
              decoded[source + 1]!,
              decoded[source + 2]!,
              layerType === 1 ? decoded[source + 3]! : 255,
            ],
            target,
          );
        else {
          const gray = decoded[source]!;
          rgba.set([gray, gray, gray, layerType === 3 ? decoded[source + 1]! : 255], target);
        }
      }
  }
  return createRaster(width, height, rgba);
}

/** Reads and composites the bounded 8-bit XCF v0-v3 layer subset. */
export function decodeXcf(input: ArrayBuffer | Uint8Array): XcfComposite {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 34) throw new Error('XCF file is too short.');
  const identification = new TextDecoder('latin1').decode(bytes.subarray(0, 13));
  if (!identification.startsWith('gimp xcf ') || bytes[13] !== 0)
    throw new Error('XCF identification header is invalid.');
  const versionText = identification.slice(9);
  const version =
    versionText === 'file'
      ? 0
      : /^v00[1-3]$/u.test(versionText)
        ? Number(versionText.slice(1))
        : -1;
  if (version < 0) throw new Error('Only 8-bit XCF versions 0 through 3 are supported.');
  const read = reader(bytes);
  const width = read.u32(14);
  const height = read.u32(18);
  const baseType = read.u32(22);
  if (width < 1 || height < 1 || width * height > 100_000_000)
    throw new Error('XCF canvas dimensions exceed the safe decode limit.');
  if (baseType > 1)
    throw new Error('Indexed XCF images are outside the supported composite subset.');
  const imageProperties = properties(read, 26);
  const compression = imageProperties.compression ?? 0;
  if (compression !== 0 && compression !== 1)
    throw new Error(`XCF compression mode ${compression} is unsupported.`);
  let offset = imageProperties.next;
  const layerOffsets: number[] = [];
  while (true) {
    if (layerOffsets.length > 10_000) throw new Error('XCF exceeds the safe layer-count limit.');
    const layerOffset = read.pointer(offset);
    offset += 4;
    if (layerOffset === 0) break;
    layerOffsets.push(layerOffset);
  }
  // Skip the channel pointer list; channels are editing state and are not composited as layers.
  while (read.pointer(offset) !== 0) offset += 4;
  if (layerOffsets.length === 0) throw new Error('XCF contains no layers.');

  const layers = layerOffsets.map((layerOffset) => {
    const layerWidth = read.u32(layerOffset);
    const layerHeight = read.u32(layerOffset + 4);
    const layerType = read.u32(layerOffset + 8);
    if (layerWidth < 1 || layerHeight < 1 || layerWidth * layerHeight > 100_000_000)
      throw new Error('XCF layer dimensions exceed the safe decode limit.');
    const name = read.string(layerOffset + 12);
    const layerProperties = properties(read, name.next);
    const mode = layerProperties.mode ?? 0;
    if (mode !== 0)
      throw new Error(`XCF layer "${name.value}" uses unsupported blend mode ${mode}.`);
    const hierarchyOffset = read.pointer(layerProperties.next);
    const maskOffset = read.pointer(layerProperties.next + 4);
    if (hierarchyOffset === 0) throw new Error(`XCF layer "${name.value}" has no pixel hierarchy.`);
    if (maskOffset !== 0)
      throw new Error(`XCF layer "${name.value}" has an unsupported layer mask.`);
    return {
      name: name.value,
      image: decodeLayerPixels(
        read,
        hierarchyOffset,
        layerWidth,
        layerHeight,
        layerType,
        compression,
      ),
      offsetX: layerProperties.offsetX ?? 0,
      offsetY: layerProperties.offsetY ?? 0,
      opacity: Math.max(0, Math.min(255, layerProperties.opacity ?? 255)),
      visible: layerProperties.visible ?? true,
    } satisfies XcfLayer;
  });

  const canvas = new Uint8ClampedArray(width * height * 4);
  for (const layer of [...layers].reverse()) {
    if (!layer.visible || layer.opacity === 0) continue;
    const source = layer.image.frames[0].data;
    for (let y = 0; y < layer.image.height; y += 1)
      for (let x = 0; x < layer.image.width; x += 1) {
        const canvasX = x + layer.offsetX;
        const canvasY = y + layer.offsetY;
        if (canvasX < 0 || canvasX >= width || canvasY < 0 || canvasY >= height) continue;
        const sourceOffset = (y * layer.image.width + x) * 4;
        const target = (canvasY * width + canvasX) * 4;
        const sourceAlpha = (source[sourceOffset + 3]! / 255) * (layer.opacity / 255);
        const targetAlpha = canvas[target + 3]! / 255;
        const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
        for (let channel = 0; channel < 3; channel += 1) {
          const value =
            outputAlpha === 0
              ? 0
              : (source[sourceOffset + channel]! * sourceAlpha +
                  canvas[target + channel]! * targetAlpha * (1 - sourceAlpha)) /
                outputAlpha;
          canvas[target + channel] = Math.round(value);
        }
        canvas[target + 3] = Math.round(outputAlpha * 255);
      }
  }
  return { image: createRaster(width, height, canvas), layers };
}
