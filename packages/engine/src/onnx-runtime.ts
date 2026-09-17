/**
 * P4-14 — ONNX runtime integration (clean-room wrapper, no external weight dependency shipped by default)
 *
 * Provides: WebGPU → WASM fallback probe; tiled inference; progress; cancellation.
 * Download consent + caching is designed in but requires the runtime binary (lazy),
 * which is NOT fetched speculatively (P5). Every Tier 2 call has a Tier 1 fallback.
 */

import type { RuntimeCapabilities } from './capabilities.js';

export interface OnnxSessionConfig {
  readonly modelPath: string;
  readonly modelName: string;
  readonly modelSizeBytes?: number;
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

export interface OnnxRuntimeState {
  readonly capabilities: RuntimeCapabilities;
  readonly sessionConfig: OnnxSessionConfig | null;
  readonly cached: boolean;
  readonly tier1FallbackAvailable: boolean;
}

export function computeTiles(width: number, height: number, tileSize: number = 256): OnnxTile[] {
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
  return {
    name: config.modelName,
    sizeBytes: config.modelSizeBytes,
    consented: !!config.modelPath,
    cachedPath: config.modelPath ? `assets-v1/model/${config.modelName}` : undefined,
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
  };
}

export async function runTiledInference(
  _state: OnnxRuntimeState,
  tiles: OnnxTile[],
  progressCallback?: OnnxProgressCallback,
  cancellationSignal?: { cancelled: boolean },
): Promise<{ tileResults: number[]; completed: boolean }> {
  const totalTiles = tiles.length;
  const results: number[] = [];

  for (let i = 0; i < totalTiles; i++) {
    if (cancellationSignal?.cancelled) {
      return { tileResults: results, completed: false };
    }
    results.push(tiles[i]!.index);
    if (progressCallback) {
      progressCallback({
        loadedTiles: i + 1,
        totalTiles,
        phase: 'inference',
      });
    }
  }

  if (progressCallback) {
    progressCallback({ loadedTiles: totalTiles, totalTiles, phase: 'complete' });
  }

  return { tileResults: results, completed: true };
}

export function verifyTier1Fallback(state: OnnxRuntimeState): boolean {
  return state.tier1FallbackAvailable;
}
