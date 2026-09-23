import { z } from 'zod';

export const T58RedactOptionsSchema = z
  .object({ style: z.enum(['solid', 'noise']).default('solid') })
  .strict();

export type T58RedactOptions = z.infer<typeof T58RedactOptionsSchema>;

export const t58RedactOptionDescriptions = {
  't58.style': {
    label: 'Redaction fill',
    help: 'Both choices replace source pixels; solid is the clearest irreversible redaction.',
    control: 'segmented',
    group: 'Redaction',
    advanced: false,
    options: ['solid', 'noise'],
    optionLabels: { solid: 'Solid black', noise: 'Opaque noise' },
    defaultValue: 'solid',
  },
} as const;
