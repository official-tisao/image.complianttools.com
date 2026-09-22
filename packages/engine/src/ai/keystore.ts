/**
 * P5-03 — AI credential keystore (README §16.2, §16.3, §16.6; PLAN.md P5-03).
 * Four storage modes: session (default), encrypted (IndexedDB AES-GCM-256),
 * plaintext (IndexedDB unencrypted, opt-in with warning), never (prompt per request).
 * PBKDF2-SHA-256 600 000 iterations; AES-GCM-256; non-extractable CryptoKey.
 * Idle timeout default 30 min (§16.3); zero on lock / expiry / explicit lock.
 */
export type StorageMode = 'session' | 'encrypted' | 'plaintext' | 'never';
export const DEFAULT_IDLE_TIMEOUT_MIN = 30;
export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_SALT_BYTES = 16;
export const AES_IV_BYTES = 12;
export const DERIVED_KEY_BITS = 256;

export interface KeystoreRecord {
  v: 1;
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: number;
  hint?: string;
}

export interface ProviderCredentials {
  providerId: string;
  fields: Record<string, string>;
}

function encodeBase64Url(buf: Uint8Array): string {
  const binary = Array.from(buf)
    .map((b) => String.fromCharCode(b))
    .join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeBase64Url(str: string): Uint8Array {
  const padding = 4 - (str.length % 4);
  const padded = padding < 4 ? str + '='.repeat(padding) : str;
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return new Uint8Array(Array.from(binary).map((c) => c.charCodeAt(0)));
}

export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passphraseKey,
    { name: 'AES-GCM', length: DERIVED_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
}
export function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
}

export async function encryptCredentials(
  passphrase: string,
  payload: Record<string, unknown>,
): Promise<KeystoreRecord> {
  const salt = generateSalt();
  const iv = generateIv();
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(payload)),
    ),
  );
  return {
    v: 1,
    salt: encodeBase64Url(salt),
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(ciphertext),
    createdAt: Date.now(),
  };
}

export async function decryptCredentials(
  passphrase: string,
  record: KeystoreRecord,
): Promise<Record<string, unknown>> {
  const salt = decodeBase64Url(record.salt);
  const iv = decodeBase64Url(record.iv);
  const ciphertext = decodeBase64Url(record.ciphertext);
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>;
}

export const SESSION_ONLY_KEY = 'ct-keystore-session-v1';
export const ENCRYPTED_STORE_KEY = 'ct-keystore-encrypted-v1';
export const PLAINTEXT_STORE_KEY = 'ct-keystore-plaintext-v1';

export function lockKeystore(): void {
  sessionStorage.removeItem(SESSION_ONLY_KEY);
}
export async function clearAllStoredCredentials(): Promise<void> {
  if (typeof indexedDB !== 'undefined') {
    indexedDB.deleteDatabase(ENCRYPTED_STORE_KEY);
    indexedDB.deleteDatabase(PLAINTEXT_STORE_KEY);
  }
}
export function isSessionExpired(
  lastActiveMs: number,
  timeoutMin = DEFAULT_IDLE_TIMEOUT_MIN,
): boolean {
  return Date.now() - lastActiveMs > timeoutMin * 60 * 1000;
}
export function redactCredentialFields(msg: string, fields: Record<string, string>): string {
  let safe = msg;
  for (const [k, v] of Object.entries(fields)) {
    if (v && v.length > 0) safe = safe.split(v).join('[redacted]');
    if (k && k.length > 0) safe = safe.split(k).join('[redacted-key]');
  }
  return safe;
}
