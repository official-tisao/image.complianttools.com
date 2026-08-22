import type { ColorSpaceId, RasterImage } from '../../types.js';
import {
  applyRawColourTransform,
  demosaicAhd,
  demosaicBilinear,
  demosaicDcb,
  demosaicPpg,
  demosaicVng,
} from './demosaic.js';
import { parseDngMosaic, type DngMosaic } from './dng.js';

export interface DngDevelopOptions {
  readonly demosaic?: 'linear' | 'vng' | 'ppg' | 'dcb' | 'ahd';
  readonly whiteBalance?: 'as-shot' | 'camera' | 'auto' | 'daylight' | 'custom';
  readonly temperatureKelvin?: number;
  readonly tint?: number;
  readonly highlightRecovery?: 'clip' | 'unclip' | 'blend' | 'rebuild';
  readonly outputColorSpace?: Extract<ColorSpaceId, 'srgb' | 'display-p3' | 'adobe-rgb' | 'gray'>;
  readonly outputBitDepth?: 8 | 16;
  readonly gamma?: number;
  readonly exposureEv?: number;
  readonly noiseReductionThreshold?: number;
  readonly chromaticAberrationCorrection?: boolean;
}

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

function autoGains(mosaic: DngMosaic): readonly [number, number, number] {
  const totals = [0, 0, 0];
  const counts = [0, 0, 0];
  const channel = (x: number, y: number) => 'RGB'.indexOf(mosaic.pattern[(y & 1) * 2 + (x & 1)]!);
  for (let y = 0; y < mosaic.height; y += 1)
    for (let x = 0; x < mosaic.width; x += 1) {
      const selected = channel(x, y);
      totals[selected]! += mosaic.samples[y * mosaic.width + x]!;
      counts[selected]! += 1;
    }
  const averages = totals.map((total, index) => total / Math.max(1, counts[index]!));
  const green = averages[1] || 1;
  return [green / Math.max(1, averages[0]!), 1, green / Math.max(1, averages[2]!)] as const;
}

function temperatureGains(kelvin: number, tint: number): readonly [number, number, number] {
  if (!Number.isFinite(kelvin) || kelvin < 2_000 || kelvin > 50_000)
    throw new Error('RAW custom temperature must be from 2000 K through 50000 K.');
  if (!Number.isFinite(tint) || tint < -150 || tint > 150)
    throw new Error('RAW custom tint must be from -150 through 150.');
  const temperature = kelvin / 100;
  const red = temperature <= 66 ? 255 : 329.698727446 * (temperature - 60) ** -0.1332047592;
  const green =
    temperature <= 66
      ? 99.4708025861 * Math.log(temperature) - 161.1195681661
      : 288.1221695283 * (temperature - 60) ** -0.0755148492;
  const blue =
    temperature >= 66
      ? 255
      : temperature <= 19
        ? 0
        : 138.5177312231 * Math.log(temperature - 10) - 305.044792731;
  const clamped = [red, green, blue].map((value) => Math.max(1, Math.min(255, value)));
  const tintScale = 2 ** (tint / 150);
  return [clamped[1]! / clamped[0]!, tintScale, clamped[1]! / clamped[2]!] as const;
}

function selectedGains(mosaic: DngMosaic, options: DngDevelopOptions) {
  switch (options.whiteBalance ?? 'as-shot') {
    case 'as-shot':
    case 'camera':
      return mosaic.asShotGains ?? ([1, 1, 1] as const);
    case 'auto':
      return autoGains(mosaic);
    case 'daylight':
      return temperatureGains(6500, 0);
    case 'custom':
      return temperatureGains(options.temperatureKelvin ?? 6500, options.tint ?? 0);
  }
}

function recoverHighlights(
  red: number,
  green: number,
  blue: number,
  mode: NonNullable<DngDevelopOptions['highlightRecovery']>,
): readonly [number, number, number] {
  const values = [red, green, blue];
  const maximum = Math.max(...values);
  if (maximum <= 1 || mode === 'clip')
    return values.map((value) => Math.min(1, value)) as [number, number, number];
  const scaled = values.map((value) => value / maximum);
  if (mode === 'unclip') return scaled as [number, number, number];
  if (mode === 'blend') {
    const amount = Math.min(1, maximum - 1);
    return values.map(
      (value, index) => Math.min(1, value) * (1 - amount) + scaled[index]! * amount,
    ) as [number, number, number];
  }
  const unsaturated = values.filter((value) => value < 1);
  const replacement = unsaturated.length
    ? unsaturated.reduce((sum, value) => sum + value, 0) / unsaturated.length
    : 1;
  return values.map((value) => Math.min(1, value >= 1 ? replacement : value)) as [
    number,
    number,
    number,
  ];
}

function applyDevelopOptions(image: RasterImage, options: DngDevelopOptions): RasterImage {
  const exposureEv = options.exposureEv ?? 0;
  const gamma = options.gamma ?? 2.2;
  const noiseThreshold = options.noiseReductionThreshold ?? 0;
  if (!Number.isFinite(exposureEv) || exposureEv < -3 || exposureEv > 3)
    throw new Error('RAW exposure compensation must be from -3 through +3 EV.');
  if (!Number.isFinite(gamma) || gamma < 0.1 || gamma > 5)
    throw new Error('RAW gamma must be from 0.1 through 5.');
  if (!Number.isFinite(noiseThreshold) || noiseThreshold < 0 || noiseThreshold > 100)
    throw new Error('RAW noise-reduction threshold must be from 0 through 100.');
  if ((options.outputBitDepth ?? 8) === 16)
    throw new Error('16-bit DNG output is not implemented; choose 8-bit output explicitly.');
  const pixels = image.frames[0].data.slice();
  const exposure = 2 ** exposureEv;
  const highlight = options.highlightRecovery ?? 'clip';
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const recovered = recoverHighlights(
      (pixels[offset]! / 255) * exposure,
      (pixels[offset + 1]! / 255) * exposure,
      (pixels[offset + 2]! / 255) * exposure,
      highlight,
    );
    for (let channel = 0; channel < 3; channel += 1)
      pixels[offset + channel] = Math.round(recovered[channel]! ** (1 / gamma) * 255);
  }
  if (noiseThreshold > 0 && image.width > 2 && image.height > 2) {
    const source = pixels.slice();
    for (let y = 1; y < image.height - 1; y += 1)
      for (let x = 1; x < image.width - 1; x += 1)
        for (let channel = 0; channel < 3; channel += 1) {
          const values: number[] = [];
          for (let dy = -1; dy <= 1; dy += 1)
            for (let dx = -1; dx <= 1; dx += 1)
              values.push(source[((y + dy) * image.width + x + dx) * 4 + channel]!);
          values.sort((left, right) => left - right);
          const target = (y * image.width + x) * 4 + channel;
          const median = values[4]!;
          if (Math.abs(source[target]! - median) <= noiseThreshold) pixels[target] = median;
        }
  }
  if (options.chromaticAberrationCorrection && image.width > 2) {
    const source = pixels.slice();
    for (let y = 0; y < image.height; y += 1)
      for (let x = 1; x < image.width - 1; x += 1) {
        const target = (y * image.width + x) * 4;
        pixels[target] = Math.round((source[target]! + source[target + 4]!) / 2);
        pixels[target + 2] = Math.round((source[target + 2]! + source[target - 2]!) / 2);
      }
  }
  const colorSpace = options.outputColorSpace ?? 'srgb';
  if (colorSpace === 'gray')
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const gray = Math.round(
        pixels[offset]! * 0.2126 + pixels[offset + 1]! * 0.7152 + pixels[offset + 2]! * 0.0722,
      );
      pixels.fill(gray, offset, offset + 3);
    }
  return { ...image, colorSpace, frames: [{ ...image.frames[0], data: pixels }] };
}

export function developDngMosaic(mosaic: DngMosaic, options: DngDevelopOptions = {}): RasterImage {
  const demosaic = options.demosaic ?? 'ahd';
  const developed =
    demosaic === 'linear'
      ? demosaicBilinear(
          mosaic.samples,
          mosaic.width,
          mosaic.height,
          mosaic.pattern,
          mosaic.blackLevel,
          mosaic.whiteLevel,
        )
      : demosaic === 'vng'
        ? demosaicVng(
            mosaic.samples,
            mosaic.width,
            mosaic.height,
            mosaic.pattern,
            mosaic.blackLevel,
            mosaic.whiteLevel,
          )
        : demosaic === 'ppg'
          ? demosaicPpg(
              mosaic.samples,
              mosaic.width,
              mosaic.height,
              mosaic.pattern,
              mosaic.blackLevel,
              mosaic.whiteLevel,
            )
          : demosaic === 'dcb'
            ? demosaicDcb(
                mosaic.samples,
                mosaic.width,
                mosaic.height,
                mosaic.pattern,
                mosaic.blackLevel,
                mosaic.whiteLevel,
              )
            : demosaicAhd(
                mosaic.samples,
                mosaic.width,
                mosaic.height,
                mosaic.pattern,
                mosaic.blackLevel,
                mosaic.whiteLevel,
              );
  return applyDevelopOptions(
    applyRawColourTransform(
      developed,
      selectedGains(mosaic, options),
      mosaic.colorMatrix ?? identity,
    ),
    options,
  );
}

export function developDng(
  input: ArrayBuffer | Uint8Array,
  options: DngDevelopOptions = {},
): RasterImage {
  return developDngMosaic(parseDngMosaic(input), options);
}
