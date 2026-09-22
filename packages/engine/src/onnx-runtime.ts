/**
 * P4-14 — lazy ONNX Runtime Web integration.
 *
 * Runtime code is imported only after an explicit model-open request. It prefers WebGPU,
 * retries on WASM if session creation fails, and keeps the caller's Tier 1 path independent.
 * Model fetching/caching is owned by the caller so the runtime never fetches weights eagerly.
 */

import type { InferenceSession as OrtInferenceSession, Tensor as OrtTensor } from 'onnxruntime-web';
import type { RuntimeCapabilities } from './capabilities.js';

export interface OnnxSessionConfig {
  /** A URL/path supplied by the consented model loader, usually an app-owned cached object URL. */
  readonly modelPath?: string;
  /** Already-loaded model bytes supplied by a consented model loader. */
  readonly modelData?: Uint8Array | ArrayBuffer;
  /** Set only when the loader has confirmed this source is backed by its persistent cache. */
  readonly cachedModelPath?: string;
  readonly modelName: string;
  readonly modelSizeBytes?: number;
  /** Must be true before modelPath or modelData can be opened by ONNX Runtime. */
  readonly consentGranted?: boolean;
  readonly webGpuPreferred?: boolean;
  readonly tileSize?: number;
}

export interface OnnxTile {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly index: number;
}

export interface OnnxProgress {
  readonly loadedTiles: number;
  readonly totalTiles: number;
  readonly phase: 'download' | 'inference' | 'complete';
}

export type OnnxProgressCallback = (p: OnnxProgress) => void;
export type OnnxTileFeeds = OrtInferenceSession.FeedsType;
export type OnnxTileOutputs = OrtInferenceSession.ReturnType;
export type OnnxTileFeedFactory = (tile: OnnxTile) => OnnxTileFeeds | Promise<OnnxTileFeeds>;
export type OnnxCancellationSignal = AbortSignal | { readonly cancelled: boolean };
export type OnnxExecutionBackend = 'webgpu' | 'wasm' | 'unavailable';

export interface OnnxRuntimeState {
  readonly capabilities: RuntimeCapabilities;
  readonly sessionConfig: OnnxSessionConfig | null;
  readonly cached: boolean;
  readonly tier1FallbackAvailable: boolean;
  readonly backend: OnnxExecutionBackend;
  readonly session: OrtInferenceSession | null;
}

export function computeTiles(width: number, height: number, tileSize: number = 256): OnnxTile[] {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError('ONNX tile dimensions must be positive integers.');
  }
  if (!Number.isInteger(tileSize) || tileSize <= 0) {
    throw new RangeError('ONNX tile size must be a positive integer.');
  }

  const tiles: OnnxTile[] = [];
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  let index = 0;
  for (let y = 0; y < tilesY; y++) {
    for (let x = 0; x < tilesX; x++) {
      tiles.push({
        x: x * tileSize,
        y: y * tileSize,
        width: Math.min(tileSize, width - x * tileSize),
        height: Math.min(tileSize, height - y * tileSize),
        index: index++,
      });
    }
  }
  return tiles;
}

export function hasOnnxAcceleration(capabilities: RuntimeCapabilities): 'webgpu' | 'wasm' | 'none' {
  if (capabilities.webGpu) return 'webgpu';
  if (capabilities.wasmSimd || capabilities.wasmThreads) return 'wasm';
  return 'none';
}

export function modelDownloadInfo(config: OnnxSessionConfig) {
  const consented = config.consentGranted === true;
  return {
    name: config.modelName,
    sizeBytes: config.modelSizeBytes,
    consented,
    cachedPath: consented ? config.cachedModelPath : undefined,
  };
}

export function initOnnxRuntime(
  capabilities: RuntimeCapabilities,
  sessionConfig: OnnxSessionConfig | null = null,
): OnnxRuntimeState {
  return {
    capabilities,
    sessionConfig,
    cached: sessionConfig ? !!modelDownloadInfo(sessionConfig).cachedPath : false,
    tier1FallbackAvailable: true,
    backend: 'unavailable',
    session: null,
  };
}

type OrtModule = typeof import('onnxruntime-web');

async function openSession(
  ort: OrtModule,
  config: OnnxSessionConfig,
  executionProviders: ('webgpu' | 'wasm')[],
): Promise<OrtInferenceSession> {
  if (config.modelData instanceof Uint8Array || config.modelData instanceof ArrayBuffer) {
    return ort.InferenceSession.create(config.modelData, { executionProviders });
  }
  if (config.modelPath)
    return ort.InferenceSession.create(config.modelPath, { executionProviders });
  throw new Error('An ONNX model path or byte buffer is required.');
}

/** Create a float input tensor without requiring consumers to depend on ONNX Runtime directly. */
export async function createFloatOnnxTensor(
  data: Float32Array,
  dimensions: readonly number[],
): Promise<OrtTensor> {
  const ort = await import('onnxruntime-web/wasm');
  return new ort.Tensor('float32', data, [...dimensions]);
}

/**
 * Opens the model only when called. Call this after the user consents and the model loader has
 * provided a cached URL or bytes. A failed WebGPU session is retried with the WASM build.
 */
export async function openOnnxRuntime(state: OnnxRuntimeState): Promise<OnnxRuntimeState> {
  const config = state.sessionConfig;
  if (!config) throw new Error('No ONNX model is configured.');
  if (config.consentGranted !== true) {
    throw new Error('ONNX model loading requires explicit user consent.');
  }
  if (!config.modelPath && !config.modelData) {
    throw new Error('The consented ONNX model has no available path or bytes.');
  }
  if (typeof WebAssembly === 'undefined') {
    throw new Error('This browser does not support WebAssembly ONNX inference.');
  }

  let webGpuFailure: unknown;
  if (config.webGpuPreferred !== false && state.capabilities.webGpu) {
    try {
      const ort = await import('onnxruntime-web/webgpu');
      const session = await openSession(ort, config, ['webgpu', 'wasm']);
      return { ...state, backend: 'webgpu', session };
    } catch (error) {
      webGpuFailure = error;
    }
  }

  try {
    const ort = await import('onnxruntime-web/wasm');
    const session = await openSession(ort, config, ['wasm']);
    return { ...state, backend: 'wasm', session };
  } catch (wasmFailure) {
    const detail = webGpuFailure ? ` WebGPU also failed: ${String(webGpuFailure)}` : '';
    throw new Error(
      `Could not create an ONNX Runtime Web session: ${String(wasmFailure)}.${detail}`,
    );
  }
}

/** Run one prepared tensor map through the already-opened ONNX model. */
export async function runOnnxInference(
  state: OnnxRuntimeState,
  feeds: OnnxTileFeeds,
): Promise<OnnxTileOutputs> {
  if (!state.session) throw new Error('Open an ONNX runtime session before inference.');
  return state.session.run(feeds);
}

function isCancelled(signal?: OnnxCancellationSignal): boolean {
  if (!signal) return false;
  return 'aborted' in signal ? signal.aborted : signal.cancelled;
}

/**
 * Runs model-specific tiles sequentially. The caller prepares correctly shaped tensors for the
 * selected model and stitches returned outputs. Cancellation is checked between ONNX calls.
 */
export async function runTiledInference(
  state: OnnxRuntimeState,
  tiles: OnnxTile[],
  feedsForTile: OnnxTileFeedFactory,
  progressCallback?: OnnxProgressCallback,
  cancellationSignal?: OnnxCancellationSignal,
): Promise<{ tileResults: OnnxTileOutputs[]; completed: boolean }> {
  if (!state.session) throw new Error('Open an ONNX runtime session before inference.');
  const totalTiles = tiles.length;
  const results: OnnxTileOutputs[] = [];

  for (let i = 0; i < totalTiles; i++) {
    if (isCancelled(cancellationSignal)) return { tileResults: results, completed: false };
    const feeds = await feedsForTile(tiles[i]!);
    results.push(await state.session.run(feeds));
    progressCallback?.({ loadedTiles: i + 1, totalTiles, phase: 'inference' });
  }

  progressCallback?.({ loadedTiles: totalTiles, totalTiles, phase: 'complete' });
  return { tileResults: results, completed: true };
}

export async function closeOnnxRuntime(state: OnnxRuntimeState): Promise<void> {
  await state.session?.release();
}

export function verifyTier1Fallback(state: OnnxRuntimeState): boolean {
  return state.tier1FallbackAvailable;
}
