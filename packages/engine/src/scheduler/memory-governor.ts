import type { InputMeta, Plan } from '../types.js';

export const DEFAULT_TILE_SIZE = 512;

export function memoryBudgetBytes(deviceMemoryGb = 4, wasm32 = false): number {
  const hinted = deviceMemoryGb * 1024 ** 3 * 0.25;
  return Math.floor(Math.min(hinted, wasm32 ? 512 * 1024 ** 2 : 1.5 * 1024 ** 3));
}

export function projectPeakBytes(
  meta: Pick<InputMeta, 'width' | 'height'>,
  concurrentBuffers = 2,
  bytesPerChannel = 1,
): number {
  return meta.width * meta.height * 4 * bytesPerChannel * (1 + concurrentBuffers);
}

export function chooseMemoryStrategy(
  meta: InputMeta,
  concurrentBuffers = 2,
): Pick<
  Plan,
  'estimatedPeakBytes' | 'memoryStrategy' | 'tileSize' | 'largestWorkableDimension' | 'warnings'
> {
  const estimatedPeakBytes = projectPeakBytes(meta, concurrentBuffers);
  const budget = memoryBudgetBytes(meta.deviceMemoryGb, meta.wasm32);
  const largestWorkableDimension = Math.floor(Math.sqrt(budget / (4 * (1 + concurrentBuffers))));
  if (estimatedPeakBytes <= budget)
    return { estimatedPeakBytes, memoryStrategy: 'whole', warnings: [] };
  const reduced = projectPeakBytes(meta, 1);
  if (reduced <= budget)
    return {
      estimatedPeakBytes: reduced,
      memoryStrategy: 'reduced-concurrency',
      warnings: ['Concurrency reduced to stay within the memory budget.'],
    };
  if (meta.width * meta.height <= 100_000_000)
    return {
      estimatedPeakBytes: Math.min(budget, DEFAULT_TILE_SIZE ** 2 * 4 * 4),
      memoryStrategy: 'tiled',
      tileSize: DEFAULT_TILE_SIZE,
      warnings: ['Processing will use 512 px tiles to stay within the memory budget.'],
    };
  if (meta.width * meta.height <= 150_000_000)
    return {
      estimatedPeakBytes: Math.min(budget, DEFAULT_TILE_SIZE ** 2 * 4 * 3),
      memoryStrategy: 'opfs-spill',
      tileSize: DEFAULT_TILE_SIZE,
      warnings: ['Intermediates will spill to origin-private storage.'],
    };
  return {
    estimatedPeakBytes,
    memoryStrategy: 'refuse',
    largestWorkableDimension,
    warnings: [
      `This ${meta.width}×${meta.height} image needs ${Math.ceil(estimatedPeakBytes / 1024 ** 2)} MB. The largest workable square image is ${largestWorkableDimension}×${largestWorkableDimension}; no pixels were downsampled.`,
    ],
  };
}
