import { z } from 'zod';

import type { OptionDescription } from './options.js';

export const T81AdaptiveResizeOptionsSchema = z
  .object({
    // Zero is accepted by the UI contract so the route can report its typed
    // invalid-dimensions remedy before attempting a worker run.
    width: z.number().int().min(0).max(320).default(1),
    height: z.number().int().min(0).max(320).default(1),
    protectEnabled: z.boolean().default(false),
  })
  .strict();

export type T81AdaptiveResizeOptions = z.infer<typeof T81AdaptiveResizeOptionsSchema>;

export const t81AdaptiveResizeOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't81.width': {
    label: 'Target width',
    control: 'number',
    group: 'Adaptive resize',
    advanced: false,
    unit: 'px',
    min: 0,
    max: 320,
    step: 1,
    defaultValue: 1,
  },
  't81.height': {
    label: 'Target height',
    control: 'number',
    group: 'Adaptive resize',
    advanced: false,
    unit: 'px',
    min: 0,
    max: 320,
    step: 1,
    defaultValue: 1,
  },
  't81.protectEnabled': {
    label: 'Use an approximate protection mask',
    help: 'When enabled, paint an area to bias sampling around its rows and columns. The mask does not lock pixels in place.',
    control: 'toggle',
    group: 'Protection mask',
    advanced: false,
    defaultValue: false,
  },
};
