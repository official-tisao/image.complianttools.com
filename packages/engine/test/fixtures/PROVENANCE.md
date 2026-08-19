# Fixture provenance

The Phase 2 codec tests currently use byte fixtures constructed inline in their test files. They are
self-generated from the public file-format specifications, contain no photographs or personal data,
and are therefore not subject to third-party asset licensing.

The adversarial corpus in `adversarial-codecs.test.ts` is also self-generated: empty input, wrong magic,
truncated input, and a QOI header declaring an unsafe pixel count. Each must return normally with an error
and must never allocate from the hostile declared dimensions.
