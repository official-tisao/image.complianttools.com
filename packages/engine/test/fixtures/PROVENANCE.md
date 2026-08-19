# Fixture provenance

The Phase 2 codec tests currently use byte fixtures constructed inline in their test files. They are
self-generated from the public file-format specifications, contain no photographs or personal data,
and are therefore not subject to third-party asset licensing.

The adversarial corpus in `adversarial-codecs.test.ts` is also self-generated: empty input, wrong magic,
truncated input, 1×1 and 30,000×1 QOI images, a QOI header declaring an unsafe pixel count, an EXIF
IFD claiming 12,000 entries, an EXIF copyright field with an invalid value offset, truncated QOI multi-byte pixel opcodes, and SVGs with external HTTPS and nested active-document references. Each
malformed input must return normally with an error and must never allocate from hostile declared dimensions
or cause a local SVG workflow to request network resources.
