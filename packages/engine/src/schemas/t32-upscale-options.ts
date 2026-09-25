import { z } from 'zod';
import type { OptionDescription } from './options.js';

/** The route-level Tier 1 choices; selecting a value never starts processing by itself. */
export const T32UpscaleOptionsSchema = z.object({
  method: z.enum(['dcci', 'nedi']).default('dcci'),
  factor: z.union([z.literal(2), z.literal(4)]).default(2),
});

export type T32UpscaleOptions = z.infer<typeof T32UpscaleOptionsSchema>;

export const t32UpscaleToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't32.method': {
    label: 'Scaling method',
    control: 'select',
    group: 'Upscale',
    advanced: false,
    options: ['dcci', 'nedi'],
    optionLabels: { dcci: 'DCCI', nedi: 'NEDI' },
    defaultValue: 'dcci',
  },
  't32.factor': {
    label: 'Scale factor',
    control: 'select',
    group: 'Upscale',
    advanced: false,
    options: ['2', '4'],
    optionLabels: { '2': '2×', '4': '4×' },
    defaultValue: 2,
  },
};
