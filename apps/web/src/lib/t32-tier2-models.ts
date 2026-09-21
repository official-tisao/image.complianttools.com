import modelAssetRegister from '../../../../docs/model-assets.json';

export type T32ModelFactor = 2 | 4;

export interface T32ModelDefinition {
  readonly variant: 'x2plus' | 'x4plus';
  readonly factor: T32ModelFactor;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface T32ModelSources {
  readonly primaryUrl: string;
  readonly fallbackUrl: string;
}

interface EncodedTier2RuntimeConfig {
  readonly schemaVersion: number;
  readonly tier2?: {
    readonly x2?: { readonly primaryUrlBase64?: string; readonly fallbackUrlBase64?: string };
    readonly x4?: { readonly primaryUrlBase64?: string; readonly fallbackUrlBase64?: string };
  };
}

interface CachedModelRecord {
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly blob: Blob;
}

interface RegisteredModelAsset {
  readonly onnxConversion?: {
    readonly filename: string;
    readonly sizeBytes: number;
    readonly sha256: string;
  };
}

function registeredModel(filename: string): Omit<T32ModelDefinition, 'variant' | 'factor'> {
  const register = modelAssetRegister.assets as RegisteredModelAsset[];
  const conversion = register.find(
    (asset) => asset.onnxConversion?.filename === filename,
  )?.onnxConversion;
  if (!conversion) throw new Error(`No T32 model conversion is registered for ${filename}.`);
  return {
    filename: conversion.filename,
    sizeBytes: conversion.sizeBytes,
    sha256: conversion.sha256,
  };
}

export const T32_MODELS: Readonly<Record<T32ModelFactor, T32ModelDefinition>> = {
  2: { variant: 'x2plus', factor: 2, ...registeredModel('RealESRGAN_x2plus.onnx') },
  4: { variant: 'x4plus', factor: 4, ...registeredModel('RealESRGAN_x4plus.onnx') },
};

const DB_NAME = 'ctimg-t32-models';
const DB_STORE = 'registered-models';
const DB_VERSION = 1;
let runtimeConfigPromise: Promise<EncodedTier2RuntimeConfig> | undefined;

function decodeBase64Url(value: string | undefined): string {
  if (!value) return '';
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes).trim();
  } catch {
    return '';
  }
}

function checkedUrl(value: string, base: string): string {
  if (!value) return '';
  try {
    const url = new URL(value, base);
    if (url.protocol === 'https:' || url.origin === new URL(base).origin) return url.href;
  } catch {
    // An invalid deployment value behaves as an unavailable source.
  }
  return '';
}

export async function loadT32ModelSources(factor: T32ModelFactor): Promise<T32ModelSources> {
  runtimeConfigPromise ??= (async () => {
    const response = await fetch('/t32-runtime-config.json', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('The advanced model delivery settings could not be loaded.');
    return (await response.json()) as EncodedTier2RuntimeConfig;
  })();
  let config: EncodedTier2RuntimeConfig;
  try {
    config = await runtimeConfigPromise;
  } catch (cause) {
    runtimeConfigPromise = undefined;
    throw cause;
  }
  if (config.schemaVersion !== 1) throw new Error('The advanced model settings are unsupported.');
  const entry = factor === 2 ? config.tier2?.x2 : config.tier2?.x4;
  const base = globalThis.location?.href ?? 'https://image.complianttools.com/';
  return {
    primaryUrl: checkedUrl(decodeBase64Url(entry?.primaryUrlBase64), base),
    fallbackUrl: checkedUrl(decodeBase64Url(entry?.fallbackUrlBase64), base),
  };
}

export function t32Tier2SupportIssue(): string {
  if (typeof WebAssembly === 'undefined' || !WebAssembly.validate) {
    return 'This browser does not support WebAssembly, which the experimental model needs.';
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return 'This browser does not support the SHA-256 check required before using a model.';
  }
  if (typeof indexedDB === 'undefined') {
    return 'This browser cannot save the verified model for local use.';
  }
  return '';
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser cannot save the model in persistent storage.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) {
        request.result.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('The browser could not open model storage.'));
    request.onblocked = () => reject(new Error('Model storage is busy in another browser tab.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('The browser could not read its saved model.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error('The browser could not save the model.'));
    transaction.onerror = () => reject(new Error('The browser could not save the model.'));
  });
}

async function deleteCachedModel(definition: T32ModelDefinition): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DB_STORE, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(DB_STORE).delete(definition.sha256);
    await done;
  } finally {
    database.close();
  }
}

async function digestSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readCachedT32Model(
  definition: T32ModelDefinition,
): Promise<Uint8Array | undefined> {
  const database = await openDatabase();
  let record: CachedModelRecord | undefined;
  try {
    const transaction = database.transaction(DB_STORE, 'readonly');
    const done = transactionDone(transaction);
    record = (await requestResult(transaction.objectStore(DB_STORE).get(definition.sha256))) as
      CachedModelRecord | undefined;
    await done;
  } finally {
    database.close();
  }
  if (!record) return undefined;
  if (
    record.sha256 !== definition.sha256 ||
    record.sizeBytes !== definition.sizeBytes ||
    !(record.blob instanceof Blob) ||
    record.blob.size !== definition.sizeBytes
  ) {
    await deleteCachedModel(definition);
    return undefined;
  }
  const bytes = new Uint8Array(await record.blob.arrayBuffer());
  if ((await digestSha256(bytes)) !== definition.sha256) {
    await deleteCachedModel(definition);
    return undefined;
  }
  return bytes;
}

export interface T32ModelDownloadProgress {
  readonly receivedBytes: number;
  readonly totalBytes: number;
  readonly source: 'primary' | 'fallback';
}

class RetryableSourceError extends Error {}
class ModelIntegrityError extends Error {}

async function fetchModelBytes(
  url: string,
  source: 'primary' | 'fallback',
  definition: T32ModelDefinition,
  signal: AbortSignal,
  onProgress: (progress: T32ModelDownloadProgress) => void,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      signal,
    });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new RetryableSourceError('The source could not be reached (network or CORS failure).');
  }

  if (response.type === 'opaque' || response.status === 0) {
    throw new RetryableSourceError('The source response is hidden by browser CORS policy.');
  }
  if (response.status === 403) {
    throw new RetryableSourceError('The primary model host returned HTTP 403.');
  }
  if (!response.ok) throw new Error(`The model host returned HTTP ${response.status}.`);

  const declaredLength = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > 0 &&
    declaredLength !== definition.sizeBytes
  ) {
    throw new ModelIntegrityError(
      'The model host returned an unexpected content length; the file was rejected.',
    );
  }
  if (!response.body) throw new Error('The model response did not contain a readable file.');

  const bytes = new Uint8Array(definition.sizeBytes);
  const reader = response.body.getReader();
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (receivedBytes + value.byteLength > definition.sizeBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ModelIntegrityError('The downloaded model is larger than its registered size.');
      }
      bytes.set(value, receivedBytes);
      receivedBytes += value.byteLength;
      onProgress({ receivedBytes, totalBytes: definition.sizeBytes, source });
    }
  } catch (cause) {
    if (signal.aborted) throw cause;
    if (cause instanceof ModelIntegrityError) throw cause;
    throw new RetryableSourceError('The model transfer ended early (network or CORS failure).');
  }
  if (receivedBytes !== definition.sizeBytes) {
    throw new ModelIntegrityError(
      'The downloaded model is smaller than its registered size; the file was rejected.',
    );
  }
  return bytes;
}

async function saveCachedModel(definition: T32ModelDefinition, bytes: Uint8Array): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DB_STORE, 'readwrite');
    const done = transactionDone(transaction);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    transaction.objectStore(DB_STORE).put(
      {
        sha256: definition.sha256,
        sizeBytes: definition.sizeBytes,
        blob,
      } satisfies CachedModelRecord,
      definition.sha256,
    );
    await done;
  } catch (cause) {
    throw new Error(
      cause instanceof Error && cause.message.includes('storage')
        ? cause.message
        : 'The verified model could not be saved in browser storage. Check available storage and try again.',
    );
  } finally {
    database.close();
  }
}

export async function downloadAndCacheT32Model(
  definition: T32ModelDefinition,
  sources: T32ModelSources,
  signal: AbortSignal,
  onProgress: (progress: T32ModelDownloadProgress) => void,
): Promise<Uint8Array> {
  if (!sources.primaryUrl) {
    throw new Error('The primary model URL is not configured.');
  }

  let bytes: Uint8Array;
  try {
    bytes = await fetchModelBytes(sources.primaryUrl, 'primary', definition, signal, onProgress);
  } catch (cause) {
    if (!(cause instanceof RetryableSourceError) || !sources.fallbackUrl || signal.aborted)
      throw cause;
    onProgress({ receivedBytes: 0, totalBytes: definition.sizeBytes, source: 'fallback' });
    bytes = await fetchModelBytes(sources.fallbackUrl, 'fallback', definition, signal, onProgress);
  }

  if ((await digestSha256(bytes)) !== definition.sha256) {
    throw new ModelIntegrityError(
      'The downloaded model SHA-256 did not match the registered file; it was rejected.',
    );
  }
  await saveCachedModel(definition, bytes);
  return bytes;
}
