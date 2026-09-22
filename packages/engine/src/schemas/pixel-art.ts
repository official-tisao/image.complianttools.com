import { z } from 'zod';

import type { OptionDescription } from './options.js';

/**
 * T70 options. The disabled default is an exact pass-through; scaling only
 * begins after the user explicitly enables it.
 */
export const PixelArtToolOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    factor: z.enum(['2', '3', '4']).default('2'),
  })
  .strict();

export type PixelArtToolOptions = z.infer<typeof PixelArtToolOptionsSchema>;

export const pixelArtToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'pixelArt.enabled': {
    label: 'Enable pixel-art scaling',
    help: 'Off by default. With this option off, the original PNG is downloaded byte-for-byte unchanged.',
    control: 'toggle',
    group: 'Pixel-art scaling',
    advanced: false,
    defaultValue: false,
  },
  'pixelArt.factor': {
    label: 'Integer scale factor',
    help: 'Applied only when scaling is enabled. The supported factors are 2×, 3×, and 4×.',
    control: 'segmented',
    group: 'Pixel-art scaling',
    advanced: false,
    options: ['2', '3', '4'],
    optionLabels: { '2': '2×', '3': '3×', '4': '4×' },
    defaultValue: '2',
  },
};

export type PixelArtToolErrorKind =
  | 'unsupported-file'
  | 'file-too-large'
  | 'image-too-large'
  | 'invalid-options'
  | 'decode-failed'
  | 'processing-failed';

const remedies: Readonly<Record<PixelArtToolErrorKind, string>> = {
  'unsupported-file': 'Choose a valid PNG image; this tool currently accepts PNG only.',
  'file-too-large': 'Choose a PNG smaller than 32 MiB.',
  'image-too-large':
    'Choose a smaller image or use a lower scale factor so the output stays within 16 megapixels.',
  'invalid-options': 'Choose a scale factor of 2×, 3×, or 4×, then try again.',
  'decode-failed': 'Export a valid, non-animated PNG and choose it again.',
  'processing-failed':
    'Try a smaller PNG or a lower scale factor. Your original file is unchanged.',
};

export class PixelArtToolError extends Error {
  constructor(
    readonly kind: PixelArtToolErrorKind,
    readonly remedy: string = remedies[kind],
    readonly detail?: string,
  ) {
    super(detail ?? remedies[kind]);
    this.name = 'PixelArtToolError';
  }
}

export function pixelArtToolError(kind: PixelArtToolErrorKind, detail?: string): PixelArtToolError {
  return new PixelArtToolError(kind, remedies[kind], detail);
}
