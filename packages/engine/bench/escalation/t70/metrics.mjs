import { createHash } from 'node:crypto';

export const SCALE_FACTORS = [2, 3, 4];

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function rasterFromFixture(fixture) {
  return {
    width: fixture.width,
    height: fixture.height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [
      {
        data: new Uint8ClampedArray(Buffer.from(fixture.rgbaBase64, 'base64')),
        durationMs: 0,
      },
    ],
  };
}

/** A reference block-replication implementation, independent of pixelArtScale. */
export function nearestNeighborScale(image, factor) {
  const width = image.width * factor;
  const height = image.height * factor;
  const source = image.frames[0].data;
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.floor(y / factor);
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.floor(x / factor);
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      output.set(source.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4);
    }
  }
  return {
    ...image,
    width,
    height,
    bitDepth: 8,
    frames: [{ data: output, durationMs: image.frames[0].durationMs }],
  };
}

/** Exact benchmark copy of the pre-guard averaging behavior, for before/after evidence. */
export function preGuardAverageScale(image, factor) {
  const width = image.width * factor;
  const height = image.height * factor;
  const nearest = nearestNeighborScale(image, factor);
  const source = nearest.frames[0].data;
  const output = new Uint8ClampedArray(source);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;
      const centerAlpha = source[offset + 3];
      if (centerAlpha >= 200) continue;
      let red = 0;
      let green = 0;
      let blue = 0;
      let opaqueCount = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const neighborOffset = ((y + dy) * width + x + dx) * 4;
          if (source[neighborOffset + 3] > 128) {
            red += source[neighborOffset];
            green += source[neighborOffset + 1];
            blue += source[neighborOffset + 2];
            opaqueCount += 1;
          }
        }
      }
      if (opaqueCount > 0) {
        output[offset] = Math.round(red / opaqueCount);
        output[offset + 1] = Math.round(green / opaqueCount);
        output[offset + 2] = Math.round(blue / opaqueCount);
        output[offset + 3] = Math.min(
          255,
          Math.max(centerAlpha, Math.round((255 * opaqueCount) / 8)),
        );
      }
    }
  }
  return {
    ...image,
    width,
    height,
    bitDepth: 8,
    frames: [{ data: output, durationMs: image.frames[0].durationMs }],
  };
}

function paletteOf(data, channels) {
  const values = new Map();
  for (let offset = 0; offset < data.length; offset += 4) {
    const color = Array.from(data.subarray(offset, offset + channels));
    values.set(color.join(','), color);
  }
  return [...values.values()].sort((left, right) => left.join(',').localeCompare(right.join(',')));
}

function compareBytes(left, right) {
  if (left.length !== right.length)
    throw new Error('Cannot compare raster buffers of different sizes.');
  let changedPixels = 0;
  let absoluteError = 0;
  let squaredError = 0;
  const channelCount = left.length / 4;
  for (let offset = 0; offset < left.length; offset += 4) {
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(left[offset + channel] - right[offset + channel]);
      if (difference !== 0) pixelChanged = true;
      absoluteError += difference;
      squaredError += difference * difference;
    }
    if (pixelChanged) changedPixels += 1;
  }
  const meanAbsoluteError = absoluteError / left.length;
  const mse = squaredError / left.length;
  return {
    changedPixels,
    changedPixelPercent: Number(((100 * changedPixels) / channelCount).toFixed(4)),
    meanAbsoluteErrorRgba: Number(meanAbsoluteError.toFixed(6)),
    psnrRgbaDb: mse === 0 ? null : Number((10 * Math.log10((255 * 255) / mse)).toFixed(6)),
    exactRgbaMatch: changedPixels === 0,
  };
}

export function inspectOutput(source, baseline, output, focusPixel = null) {
  const sourceData = source.frames[0].data;
  const baselineData = baseline.frames[0].data;
  const outputData = output.frames[0].data;
  const sourceRgb = new Set(paletteOf(sourceData, 3).map((color) => color.join(',')));
  const sourceRgba = new Set(paletteOf(sourceData, 4).map((color) => color.join(',')));
  const sourceAlpha = new Set();
  for (let offset = 3; offset < sourceData.length; offset += 4) sourceAlpha.add(sourceData[offset]);

  const outputRgb = paletteOf(outputData, 3);
  const outputRgba = paletteOf(outputData, 4);
  const introducedRgbColors = outputRgb.filter((color) => !sourceRgb.has(color.join(',')));
  const introducedRgbaColors = outputRgba.filter((color) => !sourceRgba.has(color.join(',')));
  let introducedRgbPixels = 0;
  let introducedRgbaPixels = 0;
  let introducedAlphaPixels = 0;
  let intermediateAlphaPixels = 0;
  let alphaDifferencePixels = 0;
  for (let offset = 0; offset < outputData.length; offset += 4) {
    const rgb = `${outputData[offset]},${outputData[offset + 1]},${outputData[offset + 2]}`;
    const rgba = `${rgb},${outputData[offset + 3]}`;
    if (!sourceRgb.has(rgb)) introducedRgbPixels += 1;
    if (!sourceRgba.has(rgba)) introducedRgbaPixels += 1;
    if (!sourceAlpha.has(outputData[offset + 3])) introducedAlphaPixels += 1;
    if (outputData[offset + 3] > 0 && outputData[offset + 3] < 255) intermediateAlphaPixels += 1;
    if (outputData[offset + 3] !== baselineData[offset + 3]) alphaDifferencePixels += 1;
  }

  let focusBlock = null;
  if (focusPixel) {
    const factor = output.width / source.width;
    const palette = new Map();
    let changedFromBaseline = 0;
    for (let y = focusPixel.y * factor; y < (focusPixel.y + 1) * factor; y += 1) {
      for (let x = focusPixel.x * factor; x < (focusPixel.x + 1) * factor; x += 1) {
        const offset = (y * output.width + x) * 4;
        const rgba = Array.from(outputData.subarray(offset, offset + 4));
        palette.set(rgba.join(','), rgba);
        if (rgba.some((channel, index) => channel !== baselineData[offset + index])) {
          changedFromBaseline += 1;
        }
      }
    }
    focusBlock = {
      sourcePixel: focusPixel,
      pixels: factor * factor,
      changedFromNearestPixels: changedFromBaseline,
      paletteRgba: [...palette.values()].sort((left, right) =>
        left.join(',').localeCompare(right.join(',')),
      ),
    };
  }

  return {
    comparisonToNearestNeighbor: compareBytes(baselineData, outputData),
    sourcePaletteRgbaCount: sourceRgba.size,
    outputPaletteRgbaCount: outputRgba.length,
    introducedRgbColors,
    introducedRgbPixels,
    introducedRgbaColors,
    introducedRgbaPixels,
    introducedAlphaPixels,
    intermediateAlphaPixels,
    alphaDifferencePixels,
    focusBlock,
  };
}

export function percentileNearestRank(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

export function timeFunction(operation, { warmups = 10, runs = 100 } = {}) {
  for (let index = 0; index < warmups; index += 1) operation();
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const start = performance.now();
    operation();
    samples.push(performance.now() - start);
  }
  return {
    warmups,
    runs,
    medianMs: Number(percentileNearestRank(samples, 0.5).toFixed(6)),
    p95Ms: Number(percentileNearestRank(samples, 0.95).toFixed(6)),
  };
}
