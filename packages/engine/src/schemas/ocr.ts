import { z } from 'zod';

import type { OptionDescription } from './options.js';
import { tessdataRegistry } from '../ocr-tessdata-catalog.js';

const languageCodes = new Set(
  tessdataRegistry
    .filter((entry) => entry.kind === 'language' || entry.kind === 'alias')
    .map((entry) => entry.lang),
);
const scriptCodes = new Set(
  tessdataRegistry.filter((entry) => entry.kind === 'script').map((entry) => entry.lang),
);

export const OcrToolOptionsSchema = z
  .object({
    mode: z.enum(['language', 'script', 'orientation', 'equation']).default('language'),
    language: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .default('eng'),
    script: z
      .string()
      .min(1)
      .max(64)
      .regex(/^script\/[A-Za-z0-9_-]+$/u)
      .default('script/Latin'),
    psm: z.number().int().min(0).max(13).default(3),
  })
  .strict()
  .superRefine((options, context) => {
    if (options.mode === 'language' && !languageCodes.has(options.language)) {
      context.addIssue({
        code: 'custom',
        path: ['language'],
        message: 'Choose a language or variant from the registered T62 catalogue.',
      });
    }
    if (options.mode === 'script' && !scriptCodes.has(options.script)) {
      context.addIssue({
        code: 'custom',
        path: ['script'],
        message: 'Choose a script model from the registered T62 catalogue.',
      });
    }
    if (options.mode === 'equation' && !languageCodes.has(options.language)) {
      context.addIssue({
        code: 'custom',
        path: ['language'],
        message: 'Choose a registered base language for the equation helper.',
      });
    }
  });

export type OcrToolOptions = z.infer<typeof OcrToolOptionsSchema>;

export const ocrToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'ocr.mode': {
    label: 'Recognition mode',
    help: 'Choose a language, script model, orientation helper, or equation helper.',
    control: 'segmented',
    group: 'Recognition',
    advanced: false,
    options: ['language', 'script', 'orientation', 'equation'],
    optionLabels: {
      language: 'Language or variant',
      script: 'Script model',
      orientation: 'Page orientation',
      equation: 'Equation recognition',
    },
    defaultValue: 'language',
  },
  'ocr.language': {
    label: 'Language or variant',
    help: 'The selected model is loaded on demand from the local cache or its registered pinned tessdata_fast source.',
    control: 'select',
    group: 'Recognition',
    advanced: false,
    options: ['eng'],
    defaultValue: 'eng',
  },
  'ocr.script': {
    label: 'Script model',
    help: 'Script models may cover more than one language and are separate from language models. The selected model is fetched only when OCR runs; the large Latin script model (85.2 MiB) uses a pinned official raw-source URL.',
    control: 'select',
    group: 'Recognition',
    advanced: false,
    options: ['script/Latin'],
    defaultValue: 'script/Latin',
  },
  'ocr.psm': {
    label: 'Page layout mode',
    help: 'Automatic page layout is the default; choose another mode for a known text arrangement.',
    control: 'number',
    group: 'Recognition',
    advanced: true,
    min: 0,
    max: 13,
    step: 1,
    defaultValue: 3,
  },
};
