import { z } from 'zod';

import type { OptionDescription } from './options.js';

export const T60CompareOptionsSchema = z
  .object({
    mode: z.enum(['split', 'side', 'onion', 'difference', 'output']).default('split'),
    split: z.number().int().min(0).max(100).default(50),
    opacity: z.number().int().min(0).max(100).default(50),
    gain: z.number().int().min(1).max(20).default(4),
  })
  .strict();

export type T60CompareOptions = z.infer<typeof T60CompareOptionsSchema>;

export const t60CompareOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  mode: {
    label: 'Comparison mode',
    help: 'Choose how the two images appear in the comparison viewer.',
    control: 'select',
    group: 'Comparison view',
    advanced: false,
    options: ['split', 'side', 'onion', 'difference', 'output'],
    optionLabels: {
      split: 'Before and after',
      side: 'Side by side',
      onion: 'Onion blend',
      difference: 'Difference',
      output: 'Output only',
    },
    defaultValue: 'split',
  },
  split: {
    label: 'Split position',
    help: 'Set how much of the after image covers the before image.',
    control: 'slider',
    group: 'Split view',
    advanced: false,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    defaultValue: 50,
  },
  opacity: {
    label: 'Onion opacity',
    help: 'Set the opacity of the overlaid after image.',
    control: 'slider',
    group: 'Onion view',
    advanced: false,
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    defaultValue: 50,
  },
  gain: {
    label: 'Difference gain',
    help: 'Increase gain to make smaller pixel differences easier to see.',
    control: 'slider',
    group: 'Difference view',
    advanced: false,
    min: 1,
    max: 20,
    step: 1,
    unit: '×',
    defaultValue: 4,
  },
};
