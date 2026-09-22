import { z } from 'zod';

import type { OptionDescription } from './options.js';

/** Bounded matching controls for the local duplicate finder. */
export const T61DuplicateOptionsSchema = z
  .object({
    averageDistance: z.number().int().min(0).max(64).default(6),
    differenceDistance: z.number().int().min(0).max(56).default(6),
    aspectRatioTolerance: z.number().int().min(0).max(50).default(10),
  })
  .strict();

export type T61DuplicateOptions = z.infer<typeof T61DuplicateOptionsSchema>;

export const t61DuplicateOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't61.averageDistance': {
    label: 'Average hash distance',
    help: 'Allow this many differing bits in the 64-bit average hash for a possible visual match.',
    control: 'slider',
    group: 'Duplicate matching',
    advanced: false,
    min: 0,
    max: 64,
    step: 1,
    unit: 'bits',
    defaultValue: 6,
  },
  't61.differenceDistance': {
    label: 'Difference hash distance',
    help: 'Allow this many differing bits in the 56-bit difference hash for a possible visual match.',
    control: 'slider',
    group: 'Duplicate matching',
    advanced: false,
    min: 0,
    max: 56,
    step: 1,
    unit: 'bits',
    defaultValue: 6,
  },
  't61.aspectRatioTolerance': {
    label: 'Aspect ratio tolerance',
    help: 'Allow this percentage difference between image aspect ratios before comparing hashes.',
    control: 'slider',
    group: 'Duplicate matching',
    advanced: false,
    min: 0,
    max: 50,
    step: 1,
    unit: '%',
    defaultValue: 10,
  },
};
