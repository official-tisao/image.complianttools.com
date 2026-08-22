# Fixture provenance

The Phase 2 codec tests currently use byte fixtures constructed inline in their test files. They are
self-generated from the public file-format specifications, contain no photographs or personal data,
and are therefore not subject to third-party asset licensing.

The AVIF and JPEG XL round-trip fixtures are one-pixel rasters generated locally during the test and
encoded/decoded with the exact pinned WASM assets in the installed `@jsquash/avif` and
`@jsquash/jxl` packages. Their malformed cases are zero-byte self-generated inputs.

The JPEG, PNG, and WebP production fixtures are a generated 2×2 RGBA colour grid. Tests encode and
decode it inside a worker using the exact pinned jSquash WASM assets; malformed cases use zero bytes.

The OpenEXR fixture is a generated standards-structured 1×1 uncompressed scanline file containing
half-float B, G, R, and A channels. It is constructed from the public OpenEXR container layout and
contains no third-party visual content.

The adversarial corpus in `adversarial-codecs.test.ts` is also self-generated. Empty input and wrong
magic are exercised through the typed error boundary for BMP, CUR, DDS, FITS, GIF, Radiance HDR,
ICO, PCX, PFM, PNM/PAM, QOI, SGI, Sun Raster, TGA, TIFF, WBMP, XBM, and XPM. The remaining cases include
truncated input, 1×1 and 30,000×1 QOI images, a QOI header declaring an unsafe pixel count, an EXIF
IFD claiming 12,000 entries, an EXIF copyright field with an invalid value offset, a QOI payload deliberately named with a JPEG extension, truncated QOI multi-byte pixel opcodes, and SVGs with external HTTPS and nested active-document references. Each
malformed input must return normally with an error and must never allocate from hostile declared dimensions
or cause a local SVG workflow to request network resources.
