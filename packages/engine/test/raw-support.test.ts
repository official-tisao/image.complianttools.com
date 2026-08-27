import { describe, expect, it } from 'vitest';

import {
  rawPreviewExtensionCapability,
  rawPreviewExtensionError,
  unavailableRawPreviewExtensions,
  verifiedRawPreviewExtensions,
} from '../src/index.js';

describe('RAW Stage 1 extension capability', () => {
  it.each(['CR2', 'photo.nef', '.dng', 'capture.3FR'])(
    '%s remains on the verified preview path',
    (name) => {
      expect(rawPreviewExtensionCapability(name)).toMatchObject({ available: true });
      expect(rawPreviewExtensionError(name)).toBeNull();
    },
  );

  it.each(['legacy.ptx', 'capture.cap', 'camera.bay', 'image.k25'])(
    '%s reports a specific unavailable reason',
    (name) => {
      const error = rawPreviewExtensionError(name);
      expect(error).toMatchObject({ kind: 'codec-unavailable' });
      expect(error?.remedy).toContain('export DNG, TIFF, or JPEG');
      expect(error && 'reason' in error ? error.reason : '').toContain('no hash-pinned');
    },
  );

  it('distinguishes verified Minolta files that have no embedded rendering', () => {
    for (const extension of ['mrw', 'mdc']) {
      const error = rawPreviewExtensionError(extension);
      expect(error && 'reason' in error ? error.reason : '').toContain('no');
      expect(error && 'reason' in error ? error.reason : '').toContain('embedded camera rendering');
    }
  });

  it('keeps the capability lists disjoint and stable', () => {
    expect(verifiedRawPreviewExtensions.length).toBeGreaterThanOrEqual(24);
    expect(unavailableRawPreviewExtensions.length).toBeGreaterThanOrEqual(12);
    expect(
      verifiedRawPreviewExtensions.filter((item) => unavailableRawPreviewExtensions.includes(item)),
    ).toEqual([]);
    expect([...verifiedRawPreviewExtensions, ...unavailableRawPreviewExtensions].sort()).toEqual([
      '3fr',
      'arw',
      'bay',
      'cap',
      'cr2',
      'cr3',
      'crf',
      'crw',
      'cs1',
      'dcr',
      'dcs',
      'dng',
      'drf',
      'erf',
      'fff',
      'iiq',
      'k25',
      'kdc',
      'mdc',
      'mef',
      'mos',
      'mrw',
      'nef',
      'nrw',
      'orf',
      'pef',
      'ptx',
      'raf',
      'raw',
      'rw2',
      'rwl',
      'rwz',
      'sr2',
      'srf',
      'srw',
      'x3f',
    ]);
  });
});
