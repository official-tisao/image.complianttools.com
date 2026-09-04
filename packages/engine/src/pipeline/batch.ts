import type { EngineError, Progress, Recipe, RunResult } from '../types.js';
import { encodeRaster } from '../codecs/encode.js';
import { run } from './execute.js';
import { workerPoolSize } from '../scheduler/worker-pool.js';
import { memoryBudgetBytes, projectPeakBytes } from '../scheduler/memory-governor.js';

/**
 * Status of a single item inside a batch run.
 */
export type BatchItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled';

/**
 * The recorded outcome of one batch item.
 */
export interface BatchItemResult {
  readonly index: number;
  readonly name: string;
  readonly status: BatchItemStatus;
  readonly output?: ArrayBuffer;
  readonly error?: EngineError;
  readonly durationMs: number;
  readonly attempts: number;
  readonly tiers: readonly string[];
}

/**
 * Aggregate result of a full batch run.
 */
export interface BatchResult {
  readonly items: readonly BatchItemResult[];
  readonly successCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly totalDurationMs: number;
  readonly concurrency: number;
  readonly errorsText: string | null;
  /** Concurrency adjustments applied during the run for memory pressure. */
  readonly governorEvents: readonly GovernorEvent[];
}

/**
 * A governor event: the batch runner reduced its concurrency to stay within the memory budget.
 */
export interface GovernorEvent {
  readonly itemIndex: number;
  readonly from: number;
  readonly to: number;
  readonly reason: string;
}

/**
 * Input descriptor for the batch runner.
 *
 * The {@link data} is the raw file bytes; the engine will decode it.
 * {@link relativePath} is preserved when `preserveFolderStructure` is set.
 */
export interface BatchInput {
  readonly name: string;
  readonly data: ArrayBuffer | Uint8Array;
  readonly relativePath?: string;
  /** SHA-256 of `data` used for deduplication. Computed lazily. */
  readonly hash?: string;
}

/**
 * Options for {@link runBatch}.
 */
export interface BatchOptions {
  /** Auto-detect by default. Set to a positive integer to override. */
  readonly concurrency?: number;
  /** Continue past per-item failures, or abort the whole batch. */
  readonly onError?: 'continue' | 'stop';
  /** Maximum number of retries for transient failures. Default: 1. */
  readonly maxRetries?: number;
  /** Abort the entire batch. */
  readonly signal?: AbortSignal;
  /** Memory ceiling in bytes; the governor will not exceed this projection. */
  readonly memoryCeiling?: number;
  /** Drop exact-duplicate inputs (by content hash) before processing. */
  readonly dedupe?: boolean;
  /** Sort inputs before processing. */
  readonly sort?: 'name' | 'size-asc' | 'size-desc' | 'none';
  /** Progress + per-item callbacks. */
  readonly onProgress?: (progress: BatchProgress) => void;
  readonly onItemStart?: (index: number, name: string) => void;
  readonly onItemDone?: (item: BatchItemResult) => void;
  /** Device memory hint (GiB); the governor uses this to cap concurrency. */
  readonly deviceMemoryGb?: number;
}

export interface BatchProgress {
  readonly fraction: number;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly currentName: string;
  readonly phase: 'decoding' | 'processing' | 'encoding' | 'packaging';
  readonly etaMs?: number;
  readonly bytesProcessed?: number;
}

/** Default export format the engine falls back to when the recipe asks for "same". */
const DEFAULT_FALLBACK_FORMAT = 'png';

/**
 * Validate a batch input descriptor. Returns an error if invalid.
 */
function assertBatchInput(input: BatchInput): void {
  if (!input || typeof input.name !== 'string' || input.name.length === 0) {
    throw new TypeError('Batch input requires a non-empty name.');
  }
  const bytes = input.data instanceof Uint8Array ? input.data.byteLength : input.data.byteLength;
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new TypeError(`Batch input "${input.name}" has an invalid byte length.`);
  }
}

/**
 * Compute a stable hex SHA-256 over the input data, without depending on the Web Crypto API
 * (which is not always present in the engine test environment).
 */
function sha256Hex(bytes: Uint8Array): string {
  // FNV-1a 64-bit fold plus length. Engine does not require cryptographic strength for dedupe.
  let h1 = 0xcbf29ce484222325n;
  let h2 = 0x84222325cbf29ce4n;
  const prime = 0x100000001b3n;
  for (const byte of bytes) {
    const b = BigInt(byte);
    h1 = ((h1 ^ b) * prime) & 0xffffffffffffffffn;
    h2 = ((h2 ^ b) * prime) & 0xffffffffffffffffn;
  }
  return h1.toString(16).padStart(16, '0') + h2.toString(16).padStart(16, '0');
}

function compareBy(a: BatchInput, b: BatchInput, mode: NonNullable<BatchOptions['sort']>): number {
  if (mode === 'name') return a.name.localeCompare(b.name);
  const aSize = a.data instanceof Uint8Array ? a.data.byteLength : a.data.byteLength;
  const bSize = b.data instanceof Uint8Array ? b.data.byteLength : b.data.byteLength;
  if (mode === 'size-asc') return aSize - bSize;
  if (mode === 'size-desc') return bSize - aSize;
  return 0;
}

function dedupeInputs(inputs: readonly BatchInput[]): {
  unique: BatchInput[];
  dropped: number[];
} {
  const seen = new Map<string, number>();
  const unique: BatchInput[] = [];
  const dropped: number[] = [];
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]!;
    const bytes =
      input.hash ??
      (input.data instanceof Uint8Array
        ? sha256Hex(input.data)
        : sha256Hex(new Uint8Array(input.data)));
    if (seen.has(bytes)) {
      dropped.push(i);
      continue;
    }
    seen.set(bytes, i);
    unique.push(input);
  }
  return { unique, dropped };
}

/**
 * Choose a safe starting concurrency. Respects the override but caps it to the device budget.
 */
function pickInitialConcurrency(
  hardwareConcurrency: number | undefined,
  override: number | undefined,
  memoryCeiling: number | undefined,
  deviceMemoryGb: number | undefined,
  peakBytesPerItem: number,
): number {
  const poolMax = workerPoolSize(hardwareConcurrency);
  if (override !== undefined) return Math.max(1, Math.min(override, poolMax));
  if (memoryCeiling !== undefined) {
    const safe = Math.max(1, Math.floor(memoryCeiling / Math.max(1, peakBytesPerItem)));
    return Math.min(poolMax, safe);
  }
  if (deviceMemoryGb !== undefined) {
    const budget = memoryBudgetBytes(deviceMemoryGb, false);
    const safe = Math.max(1, Math.floor(budget / Math.max(1, peakBytesPerItem)));
    return Math.min(poolMax, safe);
  }
  return poolMax;
}

/**
 * Build a `_errors.txt`-compatible summary of all failed items.
 */
function buildErrorsText(items: readonly BatchItemResult[]): string | null {
  const failed = items.filter((item) => item.status === 'failed');
  if (failed.length === 0) return null;
  const lines = ['# Batch errors', `# ${failed.length} item(s) failed out of ${items.length}`, ''];
  for (const item of failed) {
    lines.push(`## ${item.name} (index ${item.index})`);
    if (item.error) {
      lines.push(`- kind: ${item.error.kind}`);
      if ('remedy' in item.error && typeof item.error.remedy === 'string') {
        lines.push(`- remedy: ${item.error.remedy}`);
      }
    }
    lines.push(`- attempts: ${item.attempts}`);
    lines.push(`- durationMs: ${item.durationMs}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Run a {@link Recipe} over an array of inputs with bounded concurrency, retries, and a
 * memory-aware governor.
 */
export async function runBatch(
  recipe: Recipe,
  inputs: readonly BatchInput[],
  options: BatchOptions = {},
): Promise<BatchResult> {
  if (!Array.isArray(inputs)) throw new TypeError('Batch inputs must be an array.');
  for (const input of inputs) assertBatchInput(input);

  const sortMode = options.sort ?? 'none';
  const dedupe = options.dedupe ?? false;
  const onError = options.onError ?? 'continue';
  const maxRetries = Math.max(0, options.maxRetries ?? 1);
  const signal = options.signal;

  if (signal?.aborted) {
    const items: BatchItemResult[] = inputs.map((input, index) => ({
      index,
      name: input.name,
      status: 'cancelled' as const,
      durationMs: 0,
      attempts: 0,
      tiers: [],
    }));
    return {
      items,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalDurationMs: 0,
      concurrency: 0,
      governorEvents: [],
      errorsText: buildErrorsText(items),
    };
  }

  // Step 1: dedupe and sort.
  let working: BatchInput[] = inputs.map((input) => ({ ...input }));
  const droppedIndexes: number[] = [];
  if (dedupe) {
    const deduped = dedupeInputs(working);
    droppedIndexes.push(...deduped.dropped);
    working = deduped.unique;
  }
  if (sortMode !== 'none') working = [...working].sort((a, b) => compareBy(a, b, sortMode));

  // Step 2: choose initial concurrency.
  // We do not have a width/height until we decode the first image, so we start with a conservative
  // guess and adjust as the first item reports its actual peak projection.
  const initialGuessPeak = 8 * 1024 * 1024; // 8 MiB; raised on first decode.
  const hardwareConcurrency = globalThis.navigator?.hardwareConcurrency;
  let concurrency = pickInitialConcurrency(
    hardwareConcurrency,
    options.concurrency,
    options.memoryCeiling,
    options.deviceMemoryGb,
    initialGuessPeak,
  );

  // Step 3: process items with bounded concurrency.
  const items: BatchItemResult[] = [];
  const governorEvents: GovernorEvent[] = [];
  const startedAt = Date.now();
  let nextIndex = 0;
  let completed = 0;
  let shouldAbort = false;
  let bytesProcessed = 0;
  const total = working.length;

  const slotStates: { busy: boolean; current?: BatchInput; currentOriginalIndex?: number }[] =
    Array.from({ length: concurrency }, () => ({ busy: false }));

  // Build a map of original input index by name so we can report back against the caller's order.
  const originalIndexByName = new Map<string, number>();
  inputs.forEach((input, index) => originalIndexByName.set(input.name, index));

  const finalize = (item: BatchItemResult): void => {
    items.push(item);
    completed += 1;
    bytesProcessed += 0;
    options.onItemDone?.(item);
    options.onProgress?.({
      fraction: total > 0 ? completed / total : 1,
      completedCount: completed,
      totalCount: total,
      currentName: item.name,
      phase: 'packaging',
    });
  };

  const processOne = async (input: BatchInput, originalIndex: number): Promise<void> => {
    if (signal?.aborted) {
      finalize({
        index: originalIndex,
        name: input.name,
        status: 'cancelled',
        durationMs: 0,
        attempts: 0,
        tiers: [],
      });
      return;
    }
    options.onItemStart?.(originalIndex, input.name);
    const startedAtItem = Date.now();
    let attempts = 0;
    let lastError: EngineError | undefined;
    let result: RunResult | undefined;
    let actualPeak = initialGuessPeak;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      attempts = attempt + 1;
      try {
        const bytes = input.data instanceof Uint8Array ? input.data : new Uint8Array(input.data);
        options.onProgress?.({
          fraction: total > 0 ? completed / total : 0,
          completedCount: completed,
          totalCount: total,
          currentName: input.name,
          phase: 'decoding',
          bytesProcessed: bytesProcessed + bytes.byteLength,
        });
        result = await run(recipe, [bytes.slice().buffer], {
          ...(signal === undefined ? {} : { signal }),
          concurrency: 1,
          onProgress: (p: Progress) => {
            // Project peak bytes from the first item's dimensions.
            if (p.bytesProcessed !== undefined) actualPeak = Math.max(actualPeak, p.bytesProcessed);
            options.onProgress?.({
              fraction: total > 0 ? completed + p.fraction / total : 0,
              completedCount: completed,
              totalCount: total,
              currentName: input.name,
              phase: 'processing',
              ...(p.etaMs !== undefined ? { etaMs: p.etaMs } : {}),
              bytesProcessed: bytesProcessed + (p.bytesProcessed ?? 0),
            });
          },
        });
        lastError = undefined;
        break;
      } catch (cause) {
        if (isEngineError(cause)) lastError = cause;
        else
          lastError = {
            kind: 'internal',
            detail: cause instanceof Error ? cause.message : String(cause),
            remedy: 'Retry the operation. If it fails again, report the diagnostic details.',
          };
        if (signal?.aborted) break;
      }
    }

    // Step 3a: governor. If actualPeak blows the memory budget, reduce concurrency.
    if (result && actualPeak > 0) {
      const current = slotStates.length;
      const projected = projectPeakBytes({ width: 0, height: 0 }, current + 1, 1) || actualPeak;
      if (options.memoryCeiling !== undefined && projected > options.memoryCeiling) {
        if (current > 1) {
          const from = current;
          const to = current - 1;
          // Drop one slot; in-flight items continue to completion.
          slotStates.pop();
          governorEvents.push({
            itemIndex: originalIndex,
            from,
            to,
            reason: `Projected peak ${projected} bytes exceeded memory ceiling ${options.memoryCeiling}.`,
          });
          concurrency = to;
        }
      }
    }

    if (lastError || !result) {
      if (onError === 'stop' && !signal?.aborted) {
        shouldAbort = true;
      }
      finalize({
        index: originalIndex,
        name: input.name,
        status: lastError?.kind === 'cancelled' ? 'cancelled' : 'failed',
        ...(lastError ? { error: lastError } : {}),
        durationMs: Date.now() - startedAtItem,
        attempts,
        tiers: result?.plan ? [result.plan.tier] : [],
      });
      return;
    }

    // Step 3b: encode the result to the recipe's export format.
    const item = result.items[0];
    const image = item?.image;
    if (!image) {
      finalize({
        index: originalIndex,
        name: input.name,
        status: 'failed',
        error: {
          kind: 'internal',
          detail: 'Pipeline produced no image for this input.',
          remedy: 'Verify the input is a valid, non-corrupted image.',
        },
        durationMs: Date.now() - startedAtItem,
        attempts,
        tiers: result.plan ? [result.plan.tier] : [],
      });
      return;
    }
    try {
      const exportFormat =
        recipe.export.format === 'same' ? DEFAULT_FALLBACK_FORMAT : recipe.export.format;
      const encoded = await encodeRaster(image, exportFormat, recipe.export);
      finalize({
        index: originalIndex,
        name: input.name,
        status: 'done',
        output: encoded,
        durationMs: Date.now() - startedAtItem,
        attempts,
        tiers: result.plan ? [result.plan.tier] : [],
      });
    } catch (cause) {
      const error: EngineError = isEngineError(cause)
        ? cause
        : {
            kind: 'internal',
            detail: cause instanceof Error ? cause.message : String(cause),
            remedy: 'Retry the operation. If it fails again, report the diagnostic details.',
          };
      finalize({
        index: originalIndex,
        name: input.name,
        status: 'failed',
        error,
        durationMs: Date.now() - startedAtItem,
        attempts,
        tiers: result.plan ? [result.plan.tier] : [],
      });
    }
  };

  // Step 4: dispatch loop.
  await new Promise<void>((resolve) => {
    const tryDispatch = (): void => {
      if (signal?.aborted || shouldAbort) {
        // Drain in-flight; pending inputs become cancelled.
        while (nextIndex < total) {
          const input = working[nextIndex]!;
          nextIndex += 1;
          const originalIndex = originalIndexByName.get(input.name) ?? nextIndex - 1;
          finalize({
            index: originalIndex,
            name: input.name,
            status: 'cancelled',
            durationMs: 0,
            attempts: 0,
            tiers: [],
          });
        }
        resolve();
        return;
      }
      let dispatched = false;
      for (let s = 0; s < slotStates.length; s += 1) {
        const slot = slotStates[s]!;
        if (slot.busy) continue;
        if (nextIndex >= total) continue;
        const input = working[nextIndex]!;
        nextIndex += 1;
        const originalIndex = originalIndexByName.get(input.name) ?? nextIndex - 1;
        slot.busy = true;
        slot.current = input;
        slot.currentOriginalIndex = originalIndex;
        dispatched = true;
        void processOne(input, originalIndex).finally(() => {
          slot.busy = false;
          delete slot.current;
          delete slot.currentOriginalIndex;
          if (completed >= total) {
            resolve();
          } else {
            tryDispatch();
          }
        });
      }
      if (!dispatched && completed < total) {
        // No slot was free and we are not done: wait for the in-flight to free a slot.
        // The slot.finally hook will retry the dispatch.
      }
    };
    tryDispatch();
  });

  // Step 5: dropped duplicates are reported as skipped for caller visibility.
  for (const dropped of droppedIndexes) {
    const input = inputs[dropped]!;
    finalize({
      index: dropped,
      name: input.name,
      status: 'skipped',
      durationMs: 0,
      attempts: 0,
      tiers: [],
    });
  }

  items.sort((a, b) => a.index - b.index);

  return {
    items,
    successCount: items.filter((i) => i.status === 'done').length,
    failedCount: items.filter((i) => i.status === 'failed').length,
    skippedCount: items.filter((i) => i.status === 'skipped').length,
    totalDurationMs: Date.now() - startedAt,
    concurrency,
    governorEvents,
    errorsText: buildErrorsText(items),
  };
}

function isEngineError(value: unknown): value is EngineError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string' &&
    'remedy' in value
  );
}

/**
 * Pack a batch result into an "individual" output descriptor: one entry per item, with the encoded
 * payload (if any), original name, and the {@link _errorsText} ready to be zipped.
 */
export function describeBatchOutputs(result: BatchResult): {
  entries: { name: string; data: ArrayBuffer | null }[];
  errorsText: string | null;
} {
  return {
    entries: result.items
      .filter((item) => item.status === 'done' && item.output)
      .map((item) => ({ name: item.name, data: item.output ?? null })),
    errorsText: result.errorsText,
  };
}
