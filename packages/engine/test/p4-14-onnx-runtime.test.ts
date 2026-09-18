import { describe, it, expect } from 'vitest';
import {
  computeTiles,
  hasOnnxAcceleration,
  modelDownloadInfo,
  initOnnxRuntime,
  runTiledInference,
  verifyTier1Fallback,
} from '../src/onnx-runtime.js';

describe('P4-14 ONNX runtime integration', () => {
  it('computeTiles splits a region correctly', () => {
    const tiles = computeTiles(512, 512, 256);
    expect(tiles.length).toBe(4);
    expect(tiles[0]).toEqual({ x: 0, y: 0, width: 256, height: 256, index: 0 });
    expect(tiles[3]).toEqual({ x: 256, y: 256, width: 256, height: 256, index: 3 });
  });

  it('computeTiles handles non-divisible dimensions', () => {
    const tiles = computeTiles(300, 400, 256);
    expect(tiles.length).toBe(4); // 2x2 with partial tiles
    expect(tiles.some((t) => t.width < 256 || t.height < 256)).toBe(true);
  });

  it('hasOnnxAcceleration chooses webgpu when available', () => {
    expect(
      hasOnnxAcceleration({
        webGpu: true,
        wasmSimd: false,
        wasmThreads: false,
        webGl2: false,
        offscreenCanvas: true,
        fileSystemAccess: false,
        opfs: false,
        webCodecs: false,
      }),
    ).toBe('webgpu');
  });

  it('hasOnnxAcceleration falls back to wasm', () => {
    expect(
      hasOnnxAcceleration({
        webGpu: false,
        wasmSimd: true,
        wasmThreads: false,
        webGl2: false,
        offscreenCanvas: true,
        fileSystemAccess: false,
        opfs: false,
        webCodecs: false,
      }),
    ).toBe('wasm');
  });

  it('hasOnnxAcceleration returns none without gpu or wasm', () => {
    expect(
      hasOnnxAcceleration({
        webGpu: false,
        wasmSimd: false,
        wasmThreads: false,
        webGl2: false,
        offscreenCanvas: true,
        fileSystemAccess: false,
        opfs: false,
        webCodecs: false,
      }),
    ).toBe('none');
  });

  it('modelDownloadInfo exposes size and consent state', () => {
    const info = modelDownloadInfo({
      modelPath: 'assets-v1/model/test',
      modelName: 'test-model',
      modelSizeBytes: 41943040,
    });
    expect(info.name).toBe('test-model');
    expect(info.sizeBytes).toBe(41943040);
    expect(info.consented).toBe(true);
    expect(info.cachedPath).toBe('assets-v1/model/test-model');
  });

  it('modelDownloadInfo shows unconsented when path missing', () => {
    const info = modelDownloadInfo({ modelPath: '', modelName: 'test', modelSizeBytes: 1024 });
    expect(info.consented).toBe(false);
  });

  it('initOnnxRuntime creates state with tier1 fallback', () => {
    const state = initOnnxRuntime(
      {
        webGpu: true,
        wasmSimd: false,
        wasmThreads: false,
        webGl2: false,
        offscreenCanvas: true,
        fileSystemAccess: false,
        opfs: false,
        webCodecs: false,
      },
      { modelPath: 'm', modelName: 'n' },
    );
    expect(state.capabilities.webGpu).toBe(true);
    expect(state.tier1FallbackAvailable).toBe(true);
    expect(state.cached).toBe(true);
  });

  it('runTiledInference processes all tiles and reports complete', async () => {
    const tiles = computeTiles(256, 256, 128); // 4 tiles
    const progressCalls: { loadedTiles: number; totalTiles: number; phase: string }[] = [];
    const result = await runTiledInference(
      initOnnxRuntime({
        webGpu: false,
        wasmSimd: false,
        wasmThreads: false,
        webGl2: false,
        offscreenCanvas: true,
        fileSystemAccess: false,
        opfs: false,
        webCodecs: false,
      }),
      tiles,
      (p) =>
        progressCalls.push({
          loadedTiles: p.loadedTiles,
          totalTiles: p.totalTiles,
          phase: p.phase,
        }),
    );
    expect(result.completed).toBe(true);
    expect(result.tileResults.length).toBe(4);
    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1]!.phase).toBe('complete');
  });

  it('runTiledInference respects cancellation', async () => {
    const tiles = computeTiles(256, 256, 128);
    const signal = { cancelled: false };
    signal.cancelled = true;
    const result = await runTiledInference(
      initOnnxRuntime({
        webGpu: false,
        wasmSimd: false,
        wasmThreads: false,
        webGl2: false,
        offscreenCanvas: true,
        fileSystemAccess: false,
        opfs: false,
        webCodecs: false,
      }),
      tiles,
      undefined,
      signal,
    );
    expect(result.completed).toBe(false);
  });

  it('verifyTier1Fallback is always true', () => {
    expect(
      verifyTier1Fallback(
        initOnnxRuntime({
          webGpu: false,
          wasmSimd: false,
          wasmThreads: false,
          webGl2: false,
          offscreenCanvas: true,
          fileSystemAccess: false,
          opfs: false,
          webCodecs: false,
        }),
      ),
    ).toBe(true);
  });
});
