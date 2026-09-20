import type { CropRect } from './geometry.js';

const MAX_ANALYSIS_SIDE = 256;
const CANDIDATE_DIVISIONS = 16;

export interface SmartCropImageData {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number.`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cropOffsetForNearestThird(
  imageLength: number,
  cropLength: number,
  originalOffset: number,
): number {
  const maxOffset = Math.max(0, imageLength - cropLength);
  if (maxOffset === 0) return 0;

  const original = clamp(originalOffset, 0, maxOffset);
  const thirds = [
    clamp(imageLength / 2 - cropLength / 3, 0, maxOffset),
    clamp(imageLength / 2 - (cropLength * 2) / 3, 0, maxOffset),
  ];
  return thirds.reduce((best, candidate) =>
    Math.abs(candidate - original) < Math.abs(best - original) ? candidate : best,
  );
}

/** Return the largest crop matching `targetRatio`, centred inside the source dimensions. */
export function centerCropRect(
  imageWidth: number,
  imageHeight: number,
  targetRatio: number,
): CropRect {
  assertPositiveFinite(imageWidth, 'imageWidth');
  assertPositiveFinite(imageHeight, 'imageHeight');
  assertPositiveFinite(targetRatio, 'targetRatio');

  let width = imageWidth;
  let height = imageHeight;
  if (imageWidth / imageHeight > targetRatio) {
    width = imageHeight * targetRatio;
  } else {
    height = imageWidth / targetRatio;
  }

  return {
    x: (imageWidth - width) / 2,
    y: (imageHeight - height) / 2,
    width,
    height,
  };
}

/** Move a crop so the source image centre aligns to the nearest legal rule-of-thirds point. */
export function ruleOfThirdsCropRect(
  imageWidth: number,
  imageHeight: number,
  crop: CropRect,
): CropRect {
  assertPositiveFinite(imageWidth, 'imageWidth');
  assertPositiveFinite(imageHeight, 'imageHeight');
  assertPositiveFinite(crop.width, 'crop.width');
  assertPositiveFinite(crop.height, 'crop.height');
  if (!Number.isFinite(crop.x) || !Number.isFinite(crop.y)) {
    throw new RangeError('Crop offsets must be finite numbers.');
  }

  const width = Math.min(imageWidth, crop.width);
  const height = Math.min(imageHeight, crop.height);
  return {
    x: cropOffsetForNearestThird(imageWidth, width, crop.x),
    y: cropOffsetForNearestThird(imageHeight, height, crop.y),
    width,
    height,
  };
}

/** Scale analysis to a bounded preview while preserving the source aspect ratio. */
export function smartCropAnalysisSize(
  imageWidth: number,
  imageHeight: number,
): { readonly width: number; readonly height: number; readonly scale: number } {
  assertPositiveFinite(imageWidth, 'imageWidth');
  assertPositiveFinite(imageHeight, 'imageHeight');
  const scale = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(imageWidth, imageHeight));
  return {
    width: Math.max(1, Math.round(imageWidth * scale)),
    height: Math.max(1, Math.round(imageHeight * scale)),
    scale,
  };
}

function candidateOffsets(maxOffset: number, preferred: number): number[] {
  if (maxOffset <= 0) return [0];
  const candidates = new Set<number>([0, maxOffset, clamp(preferred, 0, maxOffset)]);
  for (let index = 1; index < CANDIDATE_DIVISIONS; index += 1) {
    candidates.add(Math.round((maxOffset * index) / CANDIDATE_DIVISIONS));
  }
  return [...candidates].sort((left, right) => left - right);
}

function saliencyIntegral(image: SmartCropImageData): Float64Array {
  const { width, height, data } = image;
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  const gray = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      gray[y * width + x] =
        0.2126 * (data[offset] ?? 0) +
        0.7152 * (data[offset + 1] ?? 0) +
        0.0722 * (data[offset + 2] ?? 0);
    }
  }

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      const top = Math.max(0, y - 1);
      const bottom = Math.min(height - 1, y + 1);
      const dx = Math.abs(gray[y * width + right]! - gray[y * width + left]!);
      const dy = Math.abs(gray[bottom * width + x]! - gray[top * width + x]!);
      const colorDx =
        Math.abs((data[(y * width + right) * 4] ?? 0) - (data[(y * width + left) * 4] ?? 0)) +
        Math.abs(
          (data[(y * width + right) * 4 + 1] ?? 0) - (data[(y * width + left) * 4 + 1] ?? 0),
        ) +
        Math.abs(
          (data[(y * width + right) * 4 + 2] ?? 0) - (data[(y * width + left) * 4 + 2] ?? 0),
        );
      const colorDy =
        Math.abs((data[(bottom * width + x) * 4] ?? 0) - (data[(top * width + x) * 4] ?? 0)) +
        Math.abs(
          (data[(bottom * width + x) * 4 + 1] ?? 0) - (data[(top * width + x) * 4 + 1] ?? 0),
        ) +
        Math.abs(
          (data[(bottom * width + x) * 4 + 2] ?? 0) - (data[(top * width + x) * 4 + 2] ?? 0),
        );
      const saliency = Math.hypot(dx, dy) + (colorDx + colorDy) / 12;
      rowSum += saliency;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1]! + rowSum;
    }
  }
  return integral;
}

function rectangleSum(
  integral: Float64Array,
  stride: number,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  const right = x + width;
  const bottom = y + height;
  return (
    integral[bottom * stride + right]! -
    integral[y * stride + right]! -
    integral[bottom * stride + x]! +
    integral[y * stride + x]!
  );
}

/**
 * Choose a crop location from low-resolution colour and edge contrast.
 * This is a small deterministic heuristic, not subject or face recognition.
 */
export function approximateSaliencyCropRect(
  baseCrop: CropRect,
  image: SmartCropImageData,
  scale: number,
): CropRect {
  assertPositiveFinite(image.width, 'image.width');
  assertPositiveFinite(image.height, 'image.height');
  assertPositiveFinite(scale, 'scale');
  assertPositiveFinite(baseCrop.width, 'baseCrop.width');
  assertPositiveFinite(baseCrop.height, 'baseCrop.height');
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height)) {
    throw new RangeError('Analysis dimensions must be positive integers.');
  }
  if (image.data.length < image.width * image.height * 4) {
    throw new RangeError('Image data does not contain enough RGBA pixels.');
  }
  if (!Number.isFinite(baseCrop.x) || !Number.isFinite(baseCrop.y)) {
    throw new RangeError('Crop offsets must be finite numbers.');
  }

  const sourceWidth = image.width / scale;
  const sourceHeight = image.height / scale;
  const cropWidth = Math.min(sourceWidth, baseCrop.width);
  const cropHeight = Math.min(sourceHeight, baseCrop.height);
  const cropAnalysisWidth = Math.max(1, Math.min(image.width, Math.round(cropWidth * scale)));
  const cropAnalysisHeight = Math.max(1, Math.min(image.height, Math.round(cropHeight * scale)));
  const maxX = image.width - cropAnalysisWidth;
  const maxY = image.height - cropAnalysisHeight;
  if (maxX === 0 && maxY === 0) {
    return { x: 0, y: 0, width: cropWidth, height: cropHeight };
  }

  const integral = saliencyIntegral(image);
  const stride = image.width + 1;
  const xCandidates = candidateOffsets(maxX, baseCrop.x * scale);
  const yCandidates = candidateOffsets(maxY, baseCrop.y * scale);
  const preferredX = clamp(baseCrop.x * scale, 0, maxX);
  const preferredY = clamp(baseCrop.y * scale, 0, maxY);
  let bestX = preferredX;
  let bestY = preferredY;
  let bestScore = -Infinity;
  let bestDistance = Infinity;

  for (const y of yCandidates) {
    for (const x of xCandidates) {
      const score = rectangleSum(integral, stride, x, y, cropAnalysisWidth, cropAnalysisHeight);
      const distance = Math.abs(x - preferredX) + Math.abs(y - preferredY);
      if (score > bestScore || (score === bestScore && distance < bestDistance)) {
        bestScore = score;
        bestDistance = distance;
        bestX = x;
        bestY = y;
      }
    }
  }

  return {
    x: clamp(bestX / scale, 0, Math.max(0, sourceWidth - cropWidth)),
    y: clamp(bestY / scale, 0, Math.max(0, sourceHeight - cropHeight)),
    width: cropWidth,
    height: cropHeight,
  };
}
