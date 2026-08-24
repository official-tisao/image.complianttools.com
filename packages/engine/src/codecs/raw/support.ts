import type { EngineError } from '../../types.js';

const verifiedPreviewExtensions = new Set([
  '3fr',
  'arw',
  'cr2',
  'cr3',
  'crw',
  'dcr',
  'dng',
  'erf',
  'fff',
  'iiq',
  'kdc',
  'mos',
  'nef',
  'nrw',
  'orf',
  'pef',
  'raf',
  'raw',
  'rw2',
  'rwl',
  'sr2',
  'srf',
  'srw',
  'x3f',
]);

const unavailableReasons: Readonly<Record<string, string>> = {
  bay: 'Casio BAY preview extraction has no hash-pinned redistributable real-file corpus or published container conformance evidence.',
  cap: 'Phase One CAP preview extraction has no hash-pinned redistributable real-file corpus or published container conformance evidence; verified Phase One support is limited to IIQ.',
  crf: 'Canon CRF preview extraction has no hash-pinned redistributable real-file corpus or published container conformance evidence; verified Canon support is limited to CR2, CR3, and CRW.',
  cs1: 'Sinar CaptureShop CS1 preview extraction has no hash-pinned redistributable real-file corpus or published container conformance evidence.',
  dcs: 'Kodak DCS preview extraction has no hash-pinned redistributable real-file corpus or published container conformance evidence.',
  drf: 'Kodak DRF preview extraction has no hash-pinned redistributable real-file corpus or published container conformance evidence.',
  k25: 'Kodak K25 preview extraction has no hash-pinned redistributable real-file corpus or published container conformance evidence.',
  mdc: 'The verified Minolta MDC sample contains no structurally valid embedded camera rendering, and this build does not ship a proprietary sensor-data decoder.',
  mef: 'Mamiya MEF preview extraction has no hash-pinned redistributable real-file corpus or published container conformance evidence.',
  mrw: 'The verified Minolta MRW samples contain metadata TIFF blocks but no embedded camera rendering, and this build does not ship a proprietary sensor-data decoder.',
  ptx: 'Pentax PTX preview extraction has no hash-pinned redistributable real-file corpus or published container conformance evidence; verified Pentax support is limited to PEF.',
  rwz: 'Rawzor RWZ preview extraction has no hash-pinned redistributable real-file corpus or published container conformance evidence.',
};

export type RawPreviewExtensionCapability = Readonly<
  { extension: string; available: true } | { extension: string; available: false; reason: string }
>;

export function rawPreviewExtensionCapability(
  filenameOrExtension: string,
): RawPreviewExtensionCapability {
  const extension = filenameOrExtension.toLowerCase().replace(/^.*\./u, '').replace(/^\./u, '');
  const reason = unavailableReasons[extension];
  if (reason) return { extension, available: false, reason };
  return { extension, available: true };
}

export function rawPreviewExtensionError(filenameOrExtension: string): EngineError | null {
  const capability = rawPreviewExtensionCapability(filenameOrExtension);
  if (capability.available) return null;
  return {
    kind: 'codec-unavailable',
    format: capability.extension,
    reason: capability.reason,
    remedy:
      'Open this file in the camera maker’s software and export DNG, TIFF, or JPEG, then process that exported file locally.',
  };
}

export const verifiedRawPreviewExtensions = Object.freeze([...verifiedPreviewExtensions].sort());
export const unavailableRawPreviewExtensions = Object.freeze(
  Object.keys(unavailableReasons).sort(),
);
