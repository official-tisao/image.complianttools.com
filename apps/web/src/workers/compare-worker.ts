import { createRaster } from '@complianttools/image-engine/ops/raster';
import {
  approximatePSNR,
  approximateSSIM,
  differenceHash,
  pHash,
  perceptualHash,
  similarityVerdict,
} from '@complianttools/image-engine/cv/analysis-primitives';

type CompareRequest = {
  width: number;
  height: number;
  before: ArrayBuffer;
  after: ArrayBuffer;
};

function hammingDistance(left: readonly number[], right: readonly number[]) {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

self.onmessage = (event: MessageEvent<CompareRequest>) => {
  try {
    const { width, height, before: beforeBuffer, after: afterBuffer } = event.data;
    const before = createRaster(width, height, new Uint8ClampedArray(beforeBuffer));
    const after = createRaster(width, height, new Uint8ClampedArray(afterBuffer));
    const beforeAverage = perceptualHash(before);
    const afterAverage = perceptualHash(after);
    const beforeDifference = differenceHash(before);
    const afterDifference = differenceHash(after);
    const beforePHash = pHash(before);
    const afterPHash = pHash(after);
    const ssim = approximateSSIM(before, after);
    const psnr = approximatePSNR(before, after);

    self.postMessage({
      width,
      height,
      metrics: {
        ssim,
        psnr: Number.isFinite(psnr) ? psnr : null,
        verdict: similarityVerdict(ssim),
        averageHash: {
          distance: hammingDistance(beforeAverage, afterAverage),
          bits: beforeAverage.length,
        },
        differenceHash: {
          distance: hammingDistance(beforeDifference, afterDifference),
          bits: beforeDifference.length,
        },
        pHash: {
          distance: hammingDistance(beforePHash, afterPHash),
          bits: beforePHash.length,
        },
      },
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
