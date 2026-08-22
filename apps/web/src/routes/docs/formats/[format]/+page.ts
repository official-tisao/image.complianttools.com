const unavailableFormats = {
  jp2: {
    name: 'JPEG 2000',
    reason:
      'No verified permissive browser package exists, and a reproducible, licence-recorded OpenJPEG WASM build has not been produced.',
    alternative: 'Use PNG for lossless interchange or JPEG/AVIF for photographs.',
  },
  pict: {
    name: 'PICT',
    reason: 'PICT is a complex legacy Mac format and the viable decoders are copyleft.',
    alternative: 'Open the file in its source application and export PNG, SVG, or PDF.',
  },
  mng: {
    name: 'MNG',
    reason: 'MNG is a dormant legacy animation format and is deliberately outside the v1 scope.',
    alternative: 'Use APNG for lossless animation or WebP for broader browser workflows.',
  },
  flif: {
    name: 'FLIF',
    reason: 'FLIF is superseded by JPEG XL and its reference decoder is copyleft.',
    alternative: 'Use PNG, WebP, AVIF, or JPEG XL.',
  },
  cdr: {
    name: 'CDR',
    reason: 'CDR is proprietary and undocumented, so a reliable local decoder cannot be shipped.',
    alternative: 'Export SVG or PDF from CorelDRAW before using this site.',
  },
  dwg: {
    name: 'DWG',
    reason: 'DWG is proprietary and no verified permissive browser decoder is available.',
    alternative: 'Export DXF, SVG, or PDF from a CAD application.',
  },
  djvu: {
    name: 'DjVu',
    reason: 'DjVuLibre is GPL-2.0 and no permissive decoder with verified provenance is available.',
    alternative: 'Convert the document to PDF or page images in a trusted desktop application.',
  },
  'heic-encode': {
    name: 'HEIC encoding',
    reason:
      'HEIC encoding is deliberately excluded because HEVC has active patent pools and available browser encoders are GPL or commercial.',
    alternative: 'Export JPEG, PNG, or WebP locally. HEIC decoding remains platform-dependent.',
  },
} as const;

const supportedFormats = {
  apng: {
    name: 'APNG',
    summary: 'Animated PNG stores lossless RGBA frames in standard PNG chunks.',
    notes:
      'The local codec handles frame offsets, source/over blending, loop metadata, and none/background/previous disposal.',
  },
  avif: {
    name: 'AVIF',
    summary: 'AVIF is an AV1-based image format designed for efficient still-image compression.',
    notes:
      'The pinned local WASM decoder is fixture-tested. Browser export remains hidden until its worker delivery path is build-verified, so the converter never advertises an encoder it cannot execute.',
  },
  bmp: {
    name: 'BMP/DIB',
    summary:
      'BMP is an uncompressed Windows raster format suited to simple interchange and debugging.',
    notes:
      'The local codec reads and writes 32-bit RGBA pixels. BMP files are usually much larger than PNG.',
  },
  cbz: {
    name: 'CBZ',
    summary: 'CBZ is a ZIP archive whose naturally ordered image files form comic-book pages.',
    notes:
      'The local codec reads and writes bounded CBZ archives, rejects traversal paths, and orders numbered pages naturally. CBR/RAR remains unavailable pending verified permissive RAR provenance.',
  },
  fits: {
    name: 'FITS',
    summary: 'FITS is a block-aligned scientific image container widely used in astronomy.',
    notes:
      'The local codec reads and writes safe 8-bit primary grayscale images; higher-dimensional scientific datasets are outside this raster workflow.',
  },
  exr: {
    name: 'OpenEXR',
    summary: 'OpenEXR stores high-dynamic-range half- and floating-point image channels.',
    notes:
      'The local parser is file-fixture tested for uncompressed scanlines and can read several compressed variants. Encoding and complete ZIP/PIZ interoperability evidence are not yet available, so OpenEXR remains incomplete for v1.',
  },
  gif: {
    name: 'GIF',
    summary: 'GIF stores indexed still images and animations with LZW compression.',
    notes:
      'The local codec decodes animation and encodes GIF89a frames with transparency, looping, frame differencing, and deterministic palette reduction. Advanced quantizer choices remain under development.',
  },
  jxl: {
    name: 'JPEG XL',
    summary: 'JPEG XL is a modern still-image format supporting lossless and lossy coding.',
    notes:
      'The pinned local WASM decoder is fixture-tested. Browser export remains hidden until its worker delivery path is build-verified.',
  },
  hdr: {
    name: 'Radiance HDR',
    summary: 'Radiance RGBE stores high-dynamic-range colour using a shared exponent.',
    notes:
      'The local decoder tone-maps RGBE to an 8-bit raster, while export converts the current raster back to RGBE.',
  },
  ico: {
    name: 'ICO',
    summary: 'ICO bundles one or more Windows icon images.',
    notes:
      'The local decoder selects the largest supported 32-bit BMP or PNG payload. Export writes a standards-compliant 32-bit BMP payload and alpha mask.',
  },
  cur: {
    name: 'CUR',
    summary: 'CUR is the Windows cursor counterpart to ICO and adds a pixel hotspot.',
    notes: 'The local codec reads BMP and PNG payloads and validates the hotspot when exporting.',
  },
  dds: {
    name: 'DDS',
    summary: 'DirectDraw Surface stores GPU-oriented block-compressed texture data.',
    notes:
      'The local codec reads and writes single-mip BC1, BC2, BC3, BC4, and BC5 textures. BC7, mip chains, and cubemaps remain unavailable and are not advertised as complete support.',
  },
  pcx: {
    name: 'PCX',
    summary: 'PCX is a legacy indexed raster format using scanline run-length encoding.',
    notes:
      'The local codec supports exact opaque palettes within the PCX palette limit and rejects alpha rather than discarding it.',
  },
  pfm: {
    name: 'PFM',
    summary: 'Portable FloatMap stores floating-point RGB or grayscale samples.',
    notes:
      'The local codec handles little-endian RGB data and the format’s bottom-to-top row order.',
  },
  pnm: {
    name: 'PPM/PGM/PBM/PNM',
    summary:
      'The Netpbm family provides deliberately simple monochrome, grayscale, and RGB raster interchange.',
    notes: 'The local decoder supports ASCII and binary P1–P6 variants; export provides RGB PPM.',
  },
  png: {
    name: 'PNG',
    summary: 'PNG provides lossless raster compression with full alpha transparency.',
    notes:
      'The pinned local WASM codec round-trips RGBA pixels exactly. The generic exporter also offers local lossless PNG optimization.',
  },
  pam: {
    name: 'PAM',
    summary: 'PAM extends Netpbm with explicit tuple types and alpha channels.',
    notes: 'The local codec round-trips 8-bit RGB_ALPHA pixels without discarding transparency.',
  },
  qoi: {
    name: 'QOI',
    summary: 'Quite OK Image is a small, lossless RGB/RGBA format with a simple streaming codec.',
    notes:
      'The local implementation preserves RGBA exactly and checks hostile dimensions before allocation.',
  },
  sgi: {
    name: 'SGI/RGB',
    summary: 'SGI RGB stores planar colour channels used by legacy graphics workflows.',
    notes:
      'The local codec reads and writes uncompressed RGB/RGBA images. SGI RLE remains an explicitly reported variant limitation.',
  },
  'sun-raster': {
    name: 'Sun Raster',
    summary: 'Sun Raster is a legacy workstation bitmap format with padded scanlines.',
    notes:
      'The local codec reads and writes opaque 24-bit RGB data and rejects alpha instead of silently flattening it.',
  },
  tga: {
    name: 'TGA',
    summary: 'TGA is a straightforward raster format common in texture and game-asset workflows.',
    notes:
      'The local codec round-trips RGBA and reads true-colour run-length packets with strict packet bounds.',
  },
  tiff: {
    name: 'TIFF',
    summary:
      'TIFF is a flexible tagged raster container used in scanning, publishing, and archival workflows.',
    notes:
      'The local UTIF-backed codec round-trips RGBA raster pages. Preserve an original when relying on specialized TIFF tags or uncommon compression variants.',
  },
  wbmp: {
    name: 'WBMP',
    summary: 'Wireless Bitmap is a compact one-bit monochrome format.',
    notes:
      'The local Type-0 codec uses MSB-first rows and rejects unsupported headers and hostile dimensions.',
  },
  webp: {
    name: 'WebP',
    summary: 'WebP supports compact lossy and lossless still images with alpha transparency.',
    notes:
      'The pinned local WASM codec is round-trip tested and the generic exporter exposes quality and lossless modes without uploading source pixels.',
  },
  xbm: {
    name: 'XBM/XPM',
    summary: 'XBM and XPM represent bitmap pixels as portable C source text.',
    notes:
      'The local codecs validate C identifiers, palette structure, payload size, and exact binary transparency.',
  },
} as const;

const formatReferences = { ...unavailableFormats, ...supportedFormats };

export const csr = false;
export const entries = () => Object.keys(formatReferences).map((format) => ({ format }));

export const load = ({ params }: { params: { format: string } }) => {
  const format = formatReferences[params.format as keyof typeof formatReferences];
  if (!format) throw new Error(`Unknown format reference: ${params.format}`);
  return format;
};
