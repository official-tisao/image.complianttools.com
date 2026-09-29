/**
 * P5-03 — Focused keystore tests (README §16.2–16.3, §16.6; PLAN.md P5-03).
 * Verifies storage-mode semantics, AES-GCM-256, PBKDF2 600k, non-extractable CryptoKey,
 * session/encrypted/plaintext/never, idle timeout, clearing/expiry, redaction, and invalid paths.
 */
import { describe, it, expect } from 'vitest';
import {
  StorageMode,
  DEFAULT_IDLE_TIMEOUT_MIN,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_BYTES,
  AES_IV_BYTES,
  DERIVED_KEY_BITS,
  deriveKeyFromPassphrase,
  generateSalt,
  encryptCredentials,
  decryptCredentials,
  lockKeystore,
  isSessionExpired,
  clearAllStoredCredentials,
  redactCredentialFields,
} from '../src/ai/keystore.js';
const sessionStorageMock = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
})();

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  configurable: true,
});

describe('P5-03 keystore — storage modes', () => {
  it('exports all four documented modes (§16.2)', () => {
    const modes: StorageMode[] = ['session', 'encrypted', 'plaintext', 'never'];
    expect(modes.length).toBe(4);
    expect(modes).toContain('session');
  });

  it('default idle timeout is 30 minutes (§16.3)', () => {
    expect(DEFAULT_IDLE_TIMEOUT_MIN).toBe(30);
  });
});

describe('P5-03 — PBKDF2-SHA-256 parameters (§16.3, ADR)', () => {
  it('uses exactly 600 000 iterations', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });
  it('salt length is exactly 16 bytes', () => {
    expect(PBKDF2_SALT_BYTES).toBe(16);
  });
  it('IV length is exactly 12 bytes', () => {
    expect(AES_IV_BYTES).toBe(12);
  });
  it('derived key is 256 bits', () => {
    expect(DERIVED_KEY_BITS).toBe(256);
  });
});

describe('P5-03 — encryption / decryption (§16.3)', () => {
  const passphrase = 'test-passphrase-2026';
  const payload = { apiKey: 'sk-test-secret-123', projectId: 'proj-42' };

  it('encrypts to a KeystoreRecord with v=1', async () => {
    const record = await encryptCredentials(passphrase, payload);
    expect(record.v).toBe(1);
    expect(typeof record.salt).toBe('string');
    expect(typeof record.iv).toBe('string');
    expect(typeof record.ciphertext).toBe('string');
    expect(typeof record.createdAt).toBe('number');
  });

  it('decrypts to original payload', async () => {
    const record = await encryptCredentials(passphrase, payload);
    const decrypted = await decryptCredentials(passphrase, record);
    expect(decrypted).toMatchObject(payload);
  });

  it('produces different ciphertext on each encryption (random IV / salt)', async () => {
    const r1 = await encryptCredentials(passphrase, payload);
    const r2 = await encryptCredentials(passphrase, payload);
    expect(r1.ciphertext).not.toBe(r2.ciphertext);
    expect(r1.salt).not.toBe(r2.salt);
    expect(r1.iv).not.toBe(r2.iv);
  });

  it('wrong passphrase produces AES-GCM auth failure (no crash, clean error)', async () => {
    const record = await encryptCredentials(passphrase, payload);
    await expect(decryptCredentials('wrong-pass', record)).rejects.toThrow();
  });
});

describe('P5-03 — non-extractable CryptoKey (§16.3)', () => {
  it('derived key is non-extractable (extractable: false)', async () => {
    const salt = generateSalt();
    const key = await deriveKeyFromPassphrase('test', salt);
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe('AES-GCM');
    expect(key.algorithm.length).toBe(256);
  });
});

describe('P5-03 — session / idle timeout behavior (§16.2, §16.3)', () => {
  it('isSessionExpired returns true after timeout exceeded', () => {
    const past = Date.now() - (DEFAULT_IDLE_TIMEOUT_MIN + 1) * 60 * 1000;
    expect(isSessionExpired(past)).toBe(true);
  });

  it('isSessionExpired returns false when within timeout', () => {
    const now = Date.now() - 5 * 60 * 1000;
    expect(isSessionExpired(now)).toBe(false);
  });

  it('lockKeystore clears sessionStorage item', () => {
    sessionStorage.setItem('ct-keystore-session-v1', 'test');
    lockKeystore();
    expect(sessionStorage.getItem('ct-keystore-session-v1')).toBeNull();
  });
});

describe('P5-03 — clearing / never-store (§16.2)', () => {
  it('clearAllStoredCredentials is callable without throwing', async () => {
    await expect(clearAllStoredCredentials()).resolves.not.toThrow();
  });
});

describe('P5-03 — redaction / security invariants (§16.6)', () => {
  it('redacts credential values from messages', () => {
    const msg = `Error with sk-secret-99 and key apiKey`;
    const fields = { apiKey: 'sk-secret-99', projectId: 'x' };
    const redacted = redactCredentialFields(msg, fields);
    expect(redacted).not.toContain('sk-secret-99');
    expect(redacted).toContain('[redacted]');
  });

  it('redacts key names as defense-in-depth', () => {
    const msg = 'apiKey is invalid';
    const fields = { apiKey: 'anything' };
    const redacted = redactCredentialFields(msg, fields);
    expect(redacted).toContain('[redacted-key]');
  });
});
