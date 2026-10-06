/**
 * P6-01 tool option schemas — T13, T15, T18, T21, T74. README §4, §6.10, §10.2.
 *
 * Every schema here is `.strict()` and every default is a no-op: with no user input the tool
 * produces the same bytes the previous shell produced, so adopting these controls cannot change
 * a default export. README §10.2, PLAN.md STCC item 3.
 */

import { z } from 'zod';

import type { OptionDescription } from './options.js';

/* ------------------------------------------------------------------ T13 ---- */

export const T13VideoGifOptionsSchema = z
  .object({
    trimStart: z.number().min(0).max(3600).default(0),
    // Zero is accepted as an intermediate UI value so the route can report its typed
    // "trim end must follow trim start" remedy instead of silently clamping the range.
    trimEnd: z.number().min(0).max(3600).default(5),
    frameRate: z.number().int().min(1).max(60).default(10),
    skipFrames: z.number().int().min(1).max(1000).default(1),
    maxFrames: z.number().int().min(1).max(5000).default(300),
    // Zero means "keep the decoded size"; it is the no-op default.
    scaleWidth: z.number().int().min(0).max(4096).default(320),
  })
  .strict();

export type T13VideoGifOptions = z.infer<typeof T13VideoGifOptionsSchema>;

export const t13VideoGifOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't13.trimStart': {
    label: 'Trim start (seconds)',
    control: 'number',
    group: 'Trim',
    advanced: false,
    unit: 's',
    min: 0,
    max: 3600,
    step: 0.1,
    defaultValue: 0,
  },
  't13.trimEnd': {
    label: 'Trim end (seconds)',
    help: 'Must be later than the trim start. The clip length limits the real end.',
    control: 'number',
    group: 'Trim',
    advanced: false,
    unit: 's',
    min: 0,
    max: 3600,
    step: 0.1,
    defaultValue: 5,
  },
  't13.frameRate': {
    label: 'Frames per second',
    help: 'How many frames to sample from the trimmed range.',
    control: 'slider',
    group: 'Sampling',
    advanced: false,
    min: 1,
    max: 60,
    step: 1,
    unit: 'fps',
    defaultValue: 10,
  },
  't13.skipFrames': {
    label: 'Keep every Nth frame',
    control: 'number',
    group: 'Sampling',
    advanced: false,
    min: 1,
    max: 1000,
    step: 1,
    defaultValue: 1,
  },
  't13.maxFrames': {
    label: 'Frame limit',
    help: 'Samples beyond this count are reported as skipped rather than silently dropped.',
    control: 'number',
    group: 'Sampling',
    advanced: true,
    min: 1,
    max: 5000,
    step: 1,
    defaultValue: 300,
  },
  't13.scaleWidth': {
    label: 'Output width (pixels)',
    help: 'Scales the longest edge to this width. 0 keeps the decoded video size.',
    control: 'number',
    group: 'Output',
    advanced: false,
    min: 0,
    max: 4096,
    step: 1,
    defaultValue: 320,
  },
};

/* ------------------------------------------------------------------ T15 ---- */

export const T15SpritesheetOptionsSchema = z
  .object({
    mode: z.enum(['pack', 'slice']).default('pack'),
    // 0 derives a near-square grid from the frame count, so it is the no-op default.
    columns: z.number().int().min(0).max(4096).default(0),
    rows: z.number().int().min(0).max(4096).default(0),
    padding: z.number().int().min(0).max(512).default(0),
    trim: z.enum(['none', 'horizontal', 'both']).default('none'),
    emitAtlas: z.boolean().default(true),
  })
  .strict();

export type T15SpritesheetOptions = z.infer<typeof T15SpritesheetOptionsSchema>;

export const t15SpritesheetOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't15.mode': {
    label: 'Operation',
    control: 'segmented',
    group: 'Spritesheet',
    advanced: false,
    options: ['pack', 'slice'],
    optionLabels: { pack: 'Pack frames into a sheet', slice: 'Slice a sheet into frames' },
    defaultValue: 'pack',
  },
  't15.columns': {
    label: 'Columns',
    help: '0 derives a near-square grid from the number of frames.',
    control: 'number',
    group: 'Grid',
    advanced: false,
    min: 0,
    max: 4096,
    step: 1,
    defaultValue: 0,
  },
  't15.rows': {
    label: 'Rows (slicing only)',
    help: '0 derives the row count from the sheet height.',
    control: 'number',
    group: 'Grid',
    advanced: false,
    min: 0,
    max: 4096,
    step: 1,
    defaultValue: 0,
  },
  't15.padding': {
    label: 'Cell padding (pixels)',
    control: 'number',
    group: 'Grid',
    advanced: false,
    min: 0,
    max: 512,
    step: 1,
    defaultValue: 0,
  },
  't15.trim': {
    label: 'Trim transparent edges',
    help: 'Reports each trimmed cell as its smaller bounding box in the JSON atlas.',
    control: 'select',
    group: 'Grid',
    advanced: true,
    options: ['none', 'horizontal', 'both'],
    optionLabels: {
      none: 'Keep every pixel',
      horizontal: 'Trim left and right',
      both: 'Trim on both axes',
    },
    defaultValue: 'none',
  },
  't15.emitAtlas': {
    label: 'Also export the JSON atlas',
    control: 'toggle',
    group: 'Output',
    advanced: false,
    defaultValue: true,
  },
};

/* ------------------------------------------------------------------ T18 ---- */

export const T18HtmlToImageOptionsSchema = z
  .object({
    width: z.number().int().min(64).max(4096).default(1200),
    padding: z.number().int().min(0).max(256).default(64),
    fontSize: z.number().int().min(6).max(200).default(18),
    background: z
      .string()
      .regex(/^#[0-9a-f]{6}$/iu, 'Use a six-digit hex colour.')
      .default('#ffffff'),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/iu, 'Use a six-digit hex colour.')
      .default('#1c1a17'),
  })
  .strict();

export type T18HtmlToImageOptions = z.infer<typeof T18HtmlToImageOptionsSchema>;

export const t18HtmlToImageOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't18.width': {
    label: 'Output width (pixels)',
    control: 'number',
    group: 'Canvas',
    advanced: false,
    min: 64,
    max: 4096,
    step: 1,
    unit: 'px',
    defaultValue: 1200,
  },
  't18.padding': {
    label: 'Padding (pixels)',
    control: 'number',
    group: 'Canvas',
    advanced: false,
    min: 0,
    max: 256,
    step: 1,
    unit: 'px',
    defaultValue: 64,
  },
  't18.fontSize': {
    label: 'Base font size (pixels)',
    help: 'Also the basis for rem and em units in the pasted CSS.',
    control: 'number',
    group: 'Text',
    advanced: false,
    min: 6,
    max: 200,
    step: 1,
    unit: 'px',
    defaultValue: 18,
  },
  't18.background': {
    label: 'Background',
    control: 'color',
    group: 'Canvas',
    advanced: false,
    defaultValue: '#ffffff',
  },
  't18.color': {
    label: 'Text colour',
    help: 'Used wherever the pasted HTML does not set a colour.',
    control: 'color',
    group: 'Text',
    advanced: false,
    defaultValue: '#1c1a17',
  },
};

/* ------------------------------------------------------------------ T21 ---- */

export const T21CompressToSizeOptionsSchema = z
  .object({
    targetValue: z.number().min(1).max(100_000).default(200),
    targetUnit: z.enum(['KB', 'MB']).default('KB'),
    format: z.enum(['jpeg', 'webp']).default('jpeg'),
    // README §6 lists the documented dimension search: when quality alone cannot reach the
    // budget, scale the image down and search again.
    strategy: z.enum(['quality', 'quality-then-scale']).default('quality-then-scale'),
    tolerancePercent: z.number().min(0.1).max(20).default(2),
    background: z
      .string()
      .regex(/^#[0-9a-f]{6}$/iu, 'Use a six-digit hex colour.')
      .default('#ffffff'),
  })
  .strict();

export type T21CompressToSizeOptions = z.infer<typeof T21CompressToSizeOptionsSchema>;

export const t21CompressToSizeOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't21.targetValue': {
    label: 'Target size',
    help: 'The budget to search toward. The result reports the bytes it actually reached.',
    control: 'number',
    group: 'Target',
    advanced: false,
    min: 1,
    max: 100_000,
    step: 1,
    defaultValue: 200,
  },
  't21.targetUnit': {
    label: 'Target unit',
    control: 'segmented',
    group: 'Target',
    advanced: false,
    options: ['KB', 'MB'],
    optionLabels: { KB: 'KB (1,000 bytes)', MB: 'MB (1,000,000 bytes)' },
    defaultValue: 'KB',
  },
  't21.format': {
    label: 'Output format',
    control: 'segmented',
    group: 'Output',
    advanced: false,
    options: ['jpeg', 'webp'],
    optionLabels: { jpeg: 'JPEG', webp: 'WebP' },
    defaultValue: 'jpeg',
  },
  't21.strategy': {
    label: 'Search strategy',
    help: 'With the dimension search on, the encoder also scales the image down when quality alone cannot reach the budget.',
    control: 'segmented',
    group: 'Search',
    advanced: false,
    options: ['quality', 'quality-then-scale'],
    optionLabels: {
      quality: 'Quality only',
      'quality-then-scale': 'Quality, then dimensions',
    },
    defaultValue: 'quality-then-scale',
  },
  't21.tolerancePercent': {
    label: 'Tolerance (%)',
    help: 'A result within this percentage of the target stops the search early.',
    control: 'slider',
    group: 'Search',
    advanced: true,
    min: 0.1,
    max: 20,
    step: 0.1,
    unit: '%',
    defaultValue: 2,
  },
  't21.background': {
    label: 'Flatten transparency onto',
    control: 'color',
    group: 'Output',
    advanced: false,
    defaultValue: '#ffffff',
  },
};

/* ------------------------------------------------------------------ T74 ---- */

export const T74FolderWatchOptionsSchema = z
  .object({
    format: z.enum(['webp', 'jpeg']).default('webp'),
    quality: z.number().int().min(1).max(100).default(82),
    // Only images are picked up; the engine cannot decode everything a folder may contain.
    recursive: z.boolean().default(false),
    // 0 polls once a second, the interval the File System Access API is probed with.
    pollIntervalMs: z.number().int().min(250).max(30_000).default(1000),
    skipExisting: z.boolean().default(false),
  })
  .strict();

export type T74FolderWatchOptions = z.infer<typeof T74FolderWatchOptionsSchema>;

export const t74FolderWatchOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't74.format': {
    label: 'Output format',
    control: 'segmented',
    group: 'Output',
    advanced: false,
    options: ['webp', 'jpeg'],
    optionLabels: { webp: 'WebP', jpeg: 'JPEG' },
    defaultValue: 'webp',
  },
  't74.quality': {
    label: 'Quality',
    control: 'slider',
    group: 'Output',
    advanced: false,
    min: 1,
    max: 100,
    step: 1,
    defaultValue: 82,
  },
  't74.recursive': {
    label: 'Include subfolders',
    control: 'toggle',
    group: 'Scope',
    advanced: false,
    defaultValue: false,
  },
  't74.pollIntervalMs': {
    label: 'Poll interval (ms)',
    help: 'How often the watched folder is re-read. The browser exposes no change event for a directory handle.',
    control: 'number',
    group: 'Scope',
    advanced: true,
    min: 250,
    max: 30_000,
    step: 250,
    unit: 'ms',
    defaultValue: 1000,
  },
  't74.skipExisting': {
    label: 'Ignore files already present',
    help: 'On, the first sweep records the folder without processing it; off, existing files are processed too.',
    control: 'toggle',
    group: 'Scope',
    advanced: false,
    defaultValue: false,
  },
};
