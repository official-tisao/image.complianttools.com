import { z } from 'zod';

import type { OptionDescription } from './options.js';

const hexColour = z.string().regex(/^#[0-9a-f]{6}$/iu, 'Use a six-digit hexadecimal colour.');

export const T41ThresholdOptionsSchema = z
  .object({
    mode: z.enum(['off', 'fixed', 'otsu', 'adaptive']).default('off'),
    value: z.number().int().min(0).max(255).default(128),
  })
  .strict();
export type T41ThresholdOptions = z.infer<typeof T41ThresholdOptionsSchema>;

export const t41ThresholdOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't41.mode': {
    label: 'Threshold mode',
    help: 'Keep the source unchanged, use a fixed level, or choose an automatic method.',
    control: 'segmented',
    group: 'Threshold',
    advanced: false,
    options: ['off', 'fixed', 'otsu', 'adaptive'],
    optionLabels: { off: 'Off', fixed: 'Fixed', otsu: 'Otsu', adaptive: 'Adaptive' },
    defaultValue: 'off',
  },
  't41.value': {
    label: 'Fixed threshold',
    help: 'Pixels at or above this luma become white; darker pixels become black.',
    control: 'slider',
    group: 'Threshold',
    advanced: false,
    min: 0,
    max: 255,
    step: 1,
    unit: 'luma',
    defaultValue: 128,
  },
};

export const T43SharpenBlurOptionsSchema = z
  .object({
    operation: z.enum(['sharpen', 'gaussian']).default('sharpen'),
    amount: z.number().min(0).max(300).default(100),
    radius: z.number().min(1).max(8).default(1),
  })
  .strict();
export type T43SharpenBlurOptions = z.infer<typeof T43SharpenBlurOptionsSchema>;

export const t43SharpenBlurOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't43.operation': {
    label: 'Operation',
    help: 'Apply a local unsharp mask or a three-pass Gaussian approximation.',
    control: 'segmented',
    group: 'Sharpen and blur',
    advanced: false,
    options: ['sharpen', 'gaussian'],
    optionLabels: { sharpen: 'Sharpen', gaussian: 'Gaussian blur' },
    defaultValue: 'sharpen',
  },
  't43.amount': {
    label: 'Sharpen amount',
    help: 'Increase edge contrast while preserving the alpha channel.',
    control: 'slider',
    group: 'Sharpen and blur',
    advanced: false,
    min: 0,
    max: 300,
    step: 1,
    unit: '%',
    defaultValue: 100,
  },
  't43.radius': {
    label: 'Radius',
    help: 'Use a bounded local neighbourhood for the selected operation.',
    control: 'slider',
    group: 'Sharpen and blur',
    advanced: false,
    min: 1,
    max: 8,
    step: 1,
    unit: 'px',
    defaultValue: 1,
  },
};

export const T47DuotoneOptionsSchema = z
  .object({
    shadowColor: hexColour.default('#000000'),
    highlightColor: hexColour.default('#ffffff'),
    midpoint: z.number().min(0).max(1).default(0.5),
  })
  .strict();
export type T47DuotoneOptions = z.infer<typeof T47DuotoneOptionsSchema>;

export const t47DuotoneOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't47.shadowColor': {
    label: 'Shadow colour',
    help: 'Colour assigned to the darkest luminance values.',
    control: 'color',
    group: 'Duotone',
    advanced: false,
    defaultValue: '#000000',
  },
  't47.highlightColor': {
    label: 'Highlight colour',
    help: 'Colour assigned to the brightest luminance values.',
    control: 'color',
    group: 'Duotone',
    advanced: false,
    defaultValue: '#ffffff',
  },
  't47.midpoint': {
    label: 'Midpoint',
    help: 'Set where the shadow-to-highlight transition occurs.',
    control: 'slider',
    group: 'Duotone',
    advanced: false,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.5,
  },
};
