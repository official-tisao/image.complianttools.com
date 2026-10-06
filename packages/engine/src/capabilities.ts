import type { FormatId } from './types.js';
import { codecCapabilities } from './codecs/registry.js';

export interface FormatCapability {
  readonly id: FormatId;
  readonly decode: 'ready' | 'lazy' | 'unavailable';
  readonly encode: 'ready' | 'lazy' | 'unavailable';
  readonly animation: boolean;
  readonly lazyBytes?: number;
  readonly unavailableReason?: string;
  readonly decodeUnavailableReason?: string;
  readonly encodeUnavailableReason?: string;
}

export interface RuntimeCapabilities {
  readonly wasmSimd: boolean;
  readonly wasmThreads: boolean;
  readonly webGpu: boolean;
  readonly webGl2: boolean;
  readonly offscreenCanvas: boolean;
  readonly fileSystemAccess: boolean;
  /**
   * The directory half of the File System Access API, which README §7.2 lists separately: T74
   * folder input and folder output need it, and `fileSystemAccess` alone does not imply it. A
   * browser may expose the file picker without the directory picker, and reporting the pair as
   * one flag is how T74 ended up offering a "watch this folder" button that cannot work.
   */
  readonly fileSystemDirectoryAccess: boolean;
  /** Whether save-as can ask the user for a destination through the platform file picker. */
  readonly saveFilePicker: boolean;
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
  readonly showDirectoryPicker?: unknown;
  readonly showSaveFilePicker?: unknown;
  readonly FileSystemDirectoryHandle?: unknown;
  readonly FileSystemWritableFileStream?: unknown;
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
    // The picker alone is not enough: without the handle constructors there is nothing to
    // enumerate and nothing to write through, so this reports what the tool can actually do.
    fileSystemDirectoryAccess:
      typeof environment.showDirectoryPicker === 'function' &&
      typeof environment.FileSystemDirectoryHandle === 'function' &&
      typeof environment.FileSystemWritableFileStream === 'function',
    saveFilePicker: typeof environment.showSaveFilePicker === 'function',
    opfs: typeof environment.navigator?.storage?.getDirectory === 'function',
    webCodecs: environment.ImageDecoder !== undefined || environment.VideoFrame !== undefined,
  };
}

export async function probeCapabilities(
  environment: CapabilityEnvironment = globalThis as CapabilityEnvironment,
): Promise<FormatCapability[]> {
  const runtime = probeRuntimeCapabilities(environment);
  return codecCapabilities(runtime);
}

/** Browser location access stays behind the engine's platform capability boundary. */
export function getBrowserOrigin(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.origin;
}

/** Report whether browser connectivity is explicitly offline. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Convert packed RGBA samples to a canvas for browser-only adapters such as OCR. */
export function createCanvasFromRgba(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): HTMLCanvasElement {
  if (typeof document === 'undefined' || typeof ImageData === 'undefined') {
    throw new Error('Canvas image conversion requires a browser document.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not create a 2D canvas.');
  context.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas;
}
