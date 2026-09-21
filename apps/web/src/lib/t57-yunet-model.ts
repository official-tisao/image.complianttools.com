import modelAssetRegister from '../../../../docs/model-assets.json';

export interface T57ModelDownloadProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number;
  readonly fromCache: boolean;
}

export interface T57LoadedYuNetModel {
  readonly bytes: Uint8Array;
  readonly sourceUrl: string;
  readonly fromCache: boolean;
}

interface T57YuNetAsset {
  readonly id: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly sourceUrl: string;
}

interface EncodedRuntimeConfig {
  readonly schemaVersion?: number;
  readonly faceDetection?: { readonly yunetUrlBase64?: string };
}

interface CachedModelRecord {
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly blob: Blob;
}

const foundAsset = (modelAssetRegister.assets as T57YuNetAsset[]).find(
  (entry) => entry.id === 'opencv-zoo-yunet-face-detection-2023mar',
);

if (!foundAsset) throw new Error('No pinned YuNet model is registered for T57.');
const asset: T57YuNetAsset = foundAsset;

export const T57_YUNET_MODEL = asset;

const DATABASE_NAME = 'ctimg-t57-models';
const DATABASE_STORE = 'registered-models';
const DATABASE_VERSION = 1;
let databasePromise: Promise<IDBDatabase> | undefined;
let sourceUrlPromise: Promise<string> | undefined;

function decodeBase64(value: string | undefined): string {
  if (!value) return '';
  try {
    return new TextDecoder()
      .decode(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)))
      .trim();
  } catch {
    return '';
  }
}

function validateSourceUrl(value: string): string {
  const url = new URL(value, globalThis.location?.href ?? 'https://image.complianttools.com/');
  const sameOrigin = url.origin === globalThis.location?.origin;
  if (url.protocol !== 'https:' && !sameOrigin) {
    throw new Error('The face model URL must use HTTPS or the application origin.');
  }
  if (url.username || url.password) {
    throw new Error('The face model URL must not contain credentials.');
  }
  return url.href;
}

export async function loadT57YuNetModelUrl(): Promise<string> {
  sourceUrlPromise ??= (async () => {
    const response = await fetch('/t32-runtime-config.json', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('The face model delivery settings could not be loaded.');
    const config = (await response.json()) as EncodedRuntimeConfig;
    if (config.schemaVersion !== 1) {
      throw new Error('The face model delivery settings are unsupported.');
    }
    return validateSourceUrl(decodeBase64(config.faceDetection?.yunetUrlBase64) || asset.sourceUrl);
  })();
  try {
    return await sourceUrlPromise;
  } catch (cause) {
    sourceUrlPromise = undefined;
    throw cause;
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('This browser cannot verify the face model with SHA-256.');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'));
  }
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DATABASE_STORE)) {
          request.result.createObjectStore(DATABASE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open the face model cache.'));
      request.onblocked = () =>
        reject(new Error('The face model cache is blocked by another tab.'));
    }).catch((cause: unknown) => {
      databasePromise = undefined;
      throw cause;
    });
  }
  return databasePromise;
}

async function readCachedModel(): Promise<Uint8Array | undefined> {
  try {
    const database = await openDatabase();
    const record = await new Promise<CachedModelRecord | undefined>((resolve, reject) => {
      const request = database
        .transaction(DATABASE_STORE, 'readonly')
        .objectStore(DATABASE_STORE)
        .get(asset.id);
      request.onsuccess = () => resolve(request.result as CachedModelRecord | undefined);
      request.onerror = () =>
        reject(request.error ?? new Error('Could not read the face model cache.'));
    });
    if (
      !record ||
      !(record.blob instanceof Blob) ||
      record.sizeBytes !== asset.sizeBytes ||
      record.sha256 !== asset.sha256
    ) {
      return undefined;
    }
    const bytes = new Uint8Array(await record.blob.arrayBuffer());
    if (bytes.byteLength !== asset.sizeBytes || (await sha256(bytes)) !== asset.sha256) {
      return undefined;
    }
    return bytes;
  } catch {
    // A browser with disabled IndexedDB can still use the model for this session.
    return undefined;
  }
}

async function writeCachedModel(bytes: Uint8Array): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DATABASE_STORE, 'readwrite');
      transaction.objectStore(DATABASE_STORE).put(
        {
          sha256: asset.sha256,
          sizeBytes: asset.sizeBytes,
          blob: new Blob([bytes], { type: 'application/octet-stream' }),
        } satisfies CachedModelRecord,
        asset.id,
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not cache the face model.'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Face model caching was aborted.'));
    });
  } catch {
    // Inference can continue with verified bytes held in memory for this session.
  }
}

export async function downloadT57YuNetModel(
  onProgress?: (progress: T57ModelDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<T57LoadedYuNetModel> {
  const sourceUrl = await loadT57YuNetModelUrl();
  const cachedBytes = await readCachedModel();
  if (cachedBytes) {
    onProgress?.({
      loadedBytes: cachedBytes.byteLength,
      totalBytes: asset.sizeBytes,
      fromCache: true,
    });
    return { bytes: cachedBytes, sourceUrl, fromCache: true };
  }

  const response = await fetch(sourceUrl, {
    cache: 'default',
    credentials: 'omit',
    mode: 'cors',
    signal,
  });
  if (!response.ok) {
    throw new Error(`The face model host returned HTTP ${response.status}.`);
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > asset.sizeBytes) {
    throw new Error('The downloaded face model is larger than its registered size.');
  }

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          loadedBytes += value.byteLength;
          if (loadedBytes > asset.sizeBytes) {
            await reader.cancel();
            throw new Error('The downloaded face model is larger than its registered size.');
          }
          chunks.push(value);
          onProgress?.({
            loadedBytes,
            totalBytes:
              Number.isFinite(contentLength) && contentLength > 0 ? contentLength : asset.sizeBytes,
            fromCache: false,
          });
        }
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    const bytes = new Uint8Array(await response.arrayBuffer());
    chunks.push(bytes);
    loadedBytes = bytes.byteLength;
  }

  const bytes = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (bytes.byteLength !== asset.sizeBytes) {
    throw new Error('The downloaded face model has an unexpected byte count.');
  }
  if ((await sha256(bytes)) !== asset.sha256) {
    throw new Error('The downloaded face model failed its SHA-256 check.');
  }

  await writeCachedModel(bytes);
  onProgress?.({
    loadedBytes: bytes.byteLength,
    totalBytes: asset.sizeBytes,
    fromCache: false,
  });
  return { bytes, sourceUrl, fromCache: false };
}
