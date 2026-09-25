import { z } from 'zod';

import type { OptionDescription } from './options.js';

export const T79GeneratorOptionsSchema = z
  .object({
    width: z.number().int().min(16).max(512).default(256),
    height: z.number().int().min(16).max(512).default(256),
    seed: z.number().int().min(-2_147_483_648).max(2_147_483_647).default(42),
    mode: z.enum(['fbm', 'value-noise', 'radial-gradient']).default('fbm'),
  })
  .strict();

export type T79GeneratorOptions = z.infer<typeof T79GeneratorOptionsSchema>;

export const t79GeneratorOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'generator.width': {
    label: 'Width in pixels',
    help: 'Whole-number dimensions from 16 to 512 pixels.',
    control: 'number',
    group: 'Pattern dimensions',
    advanced: false,
    min: 16,
    max: 512,
    step: 1,
    unit: 'px',
    defaultValue: 256,
  },
  'generator.height': {
    label: 'Height in pixels',
    help: 'Whole-number dimensions from 16 to 512 pixels.',
    control: 'number',
    group: 'Pattern dimensions',
    advanced: false,
    min: 16,
    max: 512,
    step: 1,
    unit: 'px',
    defaultValue: 256,
  },
  'generator.seed': {
    label: 'Seed',
    help: 'The same pattern and seed produce the same pixels.',
    control: 'number',
    group: 'Pattern',
    advanced: false,
    min: -2_147_483_648,
    max: 2_147_483_647,
    step: 1,
    unit: '',
    defaultValue: 42,
  },
  'generator.mode': {
    label: 'Pattern',
    control: 'segmented',
    group: 'Pattern',
    advanced: false,
    options: ['fbm', 'value-noise', 'radial-gradient'],
    optionLabels: {
      fbm: 'Fractal noise (seeded)',
      'value-noise': 'Value noise (seeded)',
      'radial-gradient': 'Radial gradient',
    },
    defaultValue: 'fbm',
  },
};

export const T79GeneratorErrorRemedies = {
  'invalid-options': 'Use whole-number dimensions from 16 to 512 pixels and a signed 32-bit seed.',
  'worker-unavailable': 'Use a browser that supports module workers, then reload this page.',
  'worker-failed': 'Reload the page and try again in a browser that supports module workers.',
  'canvas-unavailable': 'Use a browser with local Canvas 2D support, then try again.',
  'png-encoding-failed': 'Try again with smaller dimensions so the browser can encode the PNG.',
  'processing-failed': 'Try a smaller pattern or another seed. No image data was uploaded.',
  cancelled: 'Choose Generate preview to start a new pattern.',
} as const;

export type T79GeneratorErrorKind = keyof typeof T79GeneratorErrorRemedies;

export class T79GeneratorError extends Error {
  readonly remedy: string;

  constructor(
    readonly kind: T79GeneratorErrorKind,
    detail?: string,
  ) {
    const remedy = T79GeneratorErrorRemedies[kind];
    super(detail ?? remedy);
    this.name = 'T79GeneratorError';
    this.remedy = remedy;
  }
}

export function isT79GeneratorErrorKind(value: unknown): value is T79GeneratorErrorKind {
  return typeof value === 'string' && Object.hasOwn(T79GeneratorErrorRemedies, value);
}
