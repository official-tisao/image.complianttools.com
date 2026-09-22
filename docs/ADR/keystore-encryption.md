# ADR: PBKDF2-SHA-256 selected over Argon2id for credential key derivation

- **Status:** Active
- **Date:** 2026-09-22
- **Scope:** P5-03 — AI credential keystore (§16.3)
- **References:** README §16.3, PLAN.md P5-03

## Decision

Use **PBKDF2-SHA-256 at 600 000 iterations** (16-byte salt) for deriving the AES-GCM-256 encryption
key from the user's passphrase. Do **not** use Argon2id.

## Reasoning

- README §16.3 explicitly documents PBKDF2-SHA-256 with 600 000 iterations as the derivation
  mechanism (`passphrase ──PBKDF2-SHA-256, 600 000 iterations ──▶ 256-bit key`).
- The repository specification treats this as a fixed parameter; substituting Argon2id would change
  the documented wire format (`IndexedDB record: { v: 1, salt, iv, ciphertext, ... }`) and break
  inter-operability.
- The bundle does not include an Argon2id WASM dependency; adding one would increase the bundle
  size and introduce a new unverified dependency that would need its own clearance review (§25.4).
- PBKDF2-SHA-256 is natively available in the `crypto.subtle` Web Crypto API (`deriveKey` with
  `PBKDF2`), requires no external WASM download, and satisfies the security contract when paired
  with AES-GCM-256 and a per-credential random 12-byte IV.
- The ADR does not claim PBKDF2-SHA-256 is superior to Argon2id in all contexts; it records the
  repository-level decision that PBKDF2-SHA-256 is the mechanism specified for this product version.

## Security invariants preserved

- 600 000 iterations (exact, not approximate; not configurable downward).
- 16-byte random salt, generated per encryption operation.
- Derived key lives in a non-extractable `CryptoKey`; it is never serialized or written to storage.
- AES-GCM-256 with a 12-byte random IV; no AAD reuse.
- A wrong passphrase produces an AES-GCM authentication failure, reported cleanly with no lockout
  and no brute-force counter (there is nothing to brute-force remotely per §16.3).

## Consequences

- The keystore uses the native Web Crypto `deriveBits` / `deriveKey` with the `PBKDF2` algorithm name.
- No WASM bundle for Argon2id is required.
- Migration to Argon2id in a future version would require a new record version (`v: 2`) and an
  explicit migration path, not a silent substitution.

## Verification

- Implementation uses exactly 600 000 iterations in `deriveKey`.
- Tests verify the derived key is non-extractable (`extractable: false`).
- Tests assert wrong passphrase produces clean failure, not a crash or hang.
- The `credential-leak` harness (§16.6, §22.1) asserts no passphrase, salt, IV, or derived-key bytes
  reach logs, errors, or diagnostic bundles.
