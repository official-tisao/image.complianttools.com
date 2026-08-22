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

export const csr = false;
export const entries = () => Object.keys(unavailableFormats).map((format) => ({ format }));

export const load = ({ params }: { params: { format: string } }) => {
  const format = unavailableFormats[params.format as keyof typeof unavailableFormats];
  if (!format) throw new Error(`Unknown format reference: ${params.format}`);
  return format;
};
