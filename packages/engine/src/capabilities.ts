import type { FormatId } from './types.js';

export interface FormatCapability {
  readonly id: FormatId;
  readonly decode: 'ready' | 'lazy' | 'unavailable';
  readonly encode: 'ready' | 'lazy' | 'unavailable';
  readonly animation: boolean;
  readonly lazyBytes?: number;
  readonly unavailableReason?: string;
}

export interface RuntimeCapabilities {
  readonly wasmSimd: boolean;
  readonly wasmThreads: boolean;
  readonly webGpu: boolean;
  readonly webGl2: boolean;
  readonly offscreenCanvas: boolean;
  readonly fileSystemAccess: boolean;
  readonly opfs: boolean;
  readonly webCodecs: boolean;
}

export interface CapabilityEnvironment {
  readonly WebAssembly?: Pick<typeof WebAssembly, 'validate'>;
  readonly SharedArrayBuffer?: unknown;
  readonly Atomics?: unknown;
  readonly crossOriginIsolated?: boolean;
  readonly OffscreenCanvas?: unknown;
  readonly ImageDecoder?: unknown;
  readonly VideoFrame?: unknown;
  readonly showOpenFilePicker?: unknown;
  readonly navigator?: {
    readonly gpu?: unknown;
    readonly storage?: { readonly getDirectory?: unknown };
  };
  readonly document?: {
    createElement(name: string): { getContext(name: string): unknown };
  };
}

// A tiny valid WASM module containing one SIMD instruction. Feature probing is
// intentionally executable and contains no browser-name or user-agent checks.
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  11,
]);

export function probeRuntimeCapabilities(
  environment: CapabilityEnvironment = globalThis as CapabilityEnvironment,
): RuntimeCapabilities {
  let webGl2 = false;
  try {
    webGl2 = environment.document?.createElement('canvas').getContext('webgl2') != null;
  } catch {
    webGl2 = false;
  }

  return {
    wasmSimd: environment.WebAssembly?.validate(SIMD_PROBE) ?? false,
    wasmThreads:
      environment.crossOriginIsolated === true &&
      environment.SharedArrayBuffer !== undefined &&
      environment.Atomics !== undefined,
    webGpu: environment.navigator?.gpu !== undefined,
    webGl2,
    offscreenCanvas: environment.OffscreenCanvas !== undefined,
    fileSystemAccess: typeof environment.showOpenFilePicker === 'function',
    opfs: typeof environment.navigator?.storage?.getDirectory === 'function',
    webCodecs: environment.ImageDecoder !== undefined || environment.VideoFrame !== undefined,
  };
}

export async function probeCapabilities(
  environment: CapabilityEnvironment = globalThis as CapabilityEnvironment,
): Promise<FormatCapability[]> {
  const runtime = probeRuntimeCapabilities(environment);
  const browserDecode = runtime.webCodecs ? 'ready' : 'lazy';
  return [
    { id: 'jpeg', decode: browserDecode, encode: 'lazy', animation: false, lazyBytes: 195_000 },
    { id: 'png', decode: browserDecode, encode: 'lazy', animation: false, lazyBytes: 165_000 },
    { id: 'webp', decode: browserDecode, encode: 'lazy', animation: true, lazyBytes: 210_000 },
    { id: 'gif', decode: browserDecode, encode: 'lazy', animation: true, lazyBytes: 180_000 },
    { id: 'avif', decode: browserDecode, encode: 'lazy', animation: true, lazyBytes: 1_900_000 },
    { id: 'bmp', decode: 'lazy', encode: 'lazy', animation: false, lazyBytes: 45_000 },
    { id: 'tiff', decode: 'lazy', encode: 'lazy', animation: true, lazyBytes: 620_000 },
    { id: 'jxl', decode: 'lazy', encode: 'lazy', animation: true, lazyBytes: 1_200_000 },
  ];
}
