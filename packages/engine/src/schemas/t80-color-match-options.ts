import { z } from 'zod';

import type { OptionDescription } from './options.js';

export const T80ColorMatchOptionsSchema = z
  .object({
    method: z.enum(['reinhard', 'histogram']).default('reinhard'),
  })
  .strict();

export type T80ColorMatchOptions = z.infer<typeof T80ColorMatchOptionsSchema>;

export const t80ColorMatchOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't80.method': {
    label: 'Colour transfer method',
    help: 'Choose the local statistical method used to match the source distribution to the reference.',
    control: 'segmented',
    group: 'Colour matching',
    advanced: false,
    options: ['reinhard', 'histogram'],
    optionLabels: {
      reinhard: 'Reinhard statistical transfer',
      histogram: 'Per-channel histogram matching',
    },
    defaultValue: 'reinhard',
  },
};
