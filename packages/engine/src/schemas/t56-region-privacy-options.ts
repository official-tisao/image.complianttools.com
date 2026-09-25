import { z } from 'zod';

export const T56RegionPrivacyOptionsSchema = z
  .object({
    effect: z.enum(['blur', 'pixelate', 'solid', 'noise']).default('blur'),
    intensity: z.number().int().min(2).max(32).default(12),
  })
  .strict();

export type T56RegionPrivacyOptions = z.infer<typeof T56RegionPrivacyOptionsSchema>;

export const t56RegionPrivacyOptionDescriptions = {
  't56.effect': {
    label: 'Privacy effect',
    help: 'Choose how marked rectangles are changed before export.',
    control: 'segmented',
    group: 'Region privacy',
    advanced: false,
    options: ['blur', 'pixelate', 'solid', 'noise'],
    optionLabels: { blur: 'Blur', pixelate: 'Pixelate', solid: 'Solid fill', noise: 'Noise' },
    defaultValue: 'blur',
  },
  't56.intensity': {
    label: 'Effect strength',
    help: 'Blur radius, pixel block size, or noise amount.',
    control: 'slider',
    group: 'Region privacy',
    advanced: false,
    min: 2,
    max: 32,
    step: 2,
    unit: 'px',
    defaultValue: 12,
  },
} as const;
