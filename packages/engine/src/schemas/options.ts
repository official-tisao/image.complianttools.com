import { z } from 'zod';

const cssColor = z.string().regex(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i, 'Use a hex colour.');

export const ExportOptionsSchema = z.object({
  format: z
    .enum(['same', 'avif', 'bmp', 'gif', 'jpeg', 'jxl', 'png', 'qoi', 'tga', 'tiff', 'webp'])
    .default('same'),
  quality: z.number().min(1).max(100).default(82),
  lossless: z.boolean().default(false),
  nearLossless: z.union([z.number().min(0).max(100), z.literal('off')]).default('off'),
  effort: z.number().int().min(0).max(10).default(4),
  progressive: z.boolean().default(false),
  chromaSubsampling: z
    .enum(['keep', '4:4:4', '4:4:0', '4:2:2', '4:2:0', '4:1:1', '4:1:0'])
    .default('keep'),
  bitDepth: z
    .union([
      z.literal('keep'),
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(10),
      z.literal(12),
      z.literal(16),
    ])
    .default('keep'),
  colorSpace: z.enum(['keep', 'srgb', 'display-p3', 'adobe-rgb', 'gray', 'cmyk']).default('keep'),
  iccProfile: z
    .union([z.enum(['preserve', 'convert', 'strip']), z.string().startsWith('embed:')])
    .default('preserve'),
  dpi: z.union([z.literal('keep'), z.number().int().positive()]).default('keep'),
  dpiUnit: z.enum(['none', 'inches', 'cm']).default('none'),
  resampleWithDpi: z.boolean().default(false),
  stripMetadata: z.enum(['none', 'all', 'gps', 'except-orientation-copyright']).default('none'),
  targetSize: z
    .object({ value: z.number().positive(), unit: z.enum(['KB', 'MB']) })
    .nullable()
    .default(null),
  targetSizeStrategy: z.enum(['quality', 'quality-then-scale', 'scale']).default('quality'),
  backgroundColor: cssColor.default('#FFFFFF'),
  flattenAlpha: z.enum(['auto', 'always', 'never']).default('auto'),
  filenameTemplate: z.string().min(1).default('{name}.{ext}'),
});

export const ResizeOptionsSchema = z
  .object({
    mode: z.enum(['pixels', 'percent', 'reduceBy', 'targetBytes', 'fit']),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    lockAspect: z.boolean().default(true),
    scale: z.number().min(1).max(1000).optional(),
    percent: z.number().min(1).max(99).optional(),
    value: z.number().positive().optional(),
    unit: z.enum(['KB', 'MB']).optional(),
    fitMode: z.enum(['contain', 'cover', 'fill', 'inside', 'outside', 'pad']).default('contain'),
    padColor: cssColor.default('#00000000'),
    padAnchor: z
      .enum([
        'top-left',
        'top',
        'top-right',
        'left',
        'center',
        'right',
        'bottom-left',
        'bottom',
        'bottom-right',
      ])
      .default('center'),
    algorithm: z
      .enum([
        'lanczos3',
        'lanczos2',
        'mitchell',
        'catmull-rom',
        'bicubic',
        'bilinear',
        'box',
        'nearest',
        'magic-kernel',
      ])
      .default('lanczos3'),
    sharpenAfterResize: z.number().min(0).max(100).default(0),
    allowUpscale: z.boolean().default(false),
    roundTo: z.number().int().min(1).default(1),
    maxPixels: z.number().int().positive().default(268_435_456),
  })
  .superRefine((value, context) => {
    if (value.mode === 'pixels' && value.width === undefined && value.height === undefined)
      context.addIssue({ code: 'custom', message: 'Width or height is required.' });
    if (value.mode === 'percent' && value.scale === undefined)
      context.addIssue({ code: 'custom', message: 'Scale is required.' });
    if (value.mode === 'reduceBy' && value.percent === undefined)
      context.addIssue({ code: 'custom', message: 'Reduction percentage is required.' });
    if (value.mode === 'targetBytes' && (value.value === undefined || value.unit === undefined))
      context.addIssue({ code: 'custom', message: 'Target size and unit are required.' });
    if (value.mode === 'fit' && (value.width === undefined || value.height === undefined))
      context.addIssue({ code: 'custom', message: 'Fit width and height are required.' });
  });

export const CropOptionsSchema = z.object({
  mode: z.enum(['rect', 'edges']).default('rect'),
  x: z.number().min(0).default(0),
  y: z.number().min(0).default(0),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  cropTop: z.number().min(0).default(0),
  cropBottom: z.number().min(0).default(0),
  cropLeft: z.number().min(0).default(0),
  cropRight: z.number().min(0).default(0),
  unit: z.enum(['px', 'percent']).default('px'),
  aspect: z.string().default('free'),
  autoTrim: z.enum(['off', 'border', 'alpha', 'content']).default('off'),
  tolerance: z.number().min(0).max(100).default(0),
  outputRounding: z.number().int().positive().default(1),
});

export const RotateOptionsSchema = z.object({
  angle: z.number().min(-360).max(360).default(0),
  snap90: z.boolean().default(false),
  expandCanvas: z.boolean().default(true),
  fillColor: cssColor.default('#00000000'),
  interpolation: z.enum(['bicubic', 'bilinear', 'nearest']).default('bicubic'),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),
  applyExifOrientation: z.boolean().default(true),
});

export type ExportOptionsInput = z.input<typeof ExportOptionsSchema>;
export type ResizeOptions = z.infer<typeof ResizeOptionsSchema>;
export type CropOptions = z.infer<typeof CropOptionsSchema>;
export type RotateOptions = z.infer<typeof RotateOptionsSchema>;

export interface OptionDescription {
  label: string;
  help?: string;
  unit?: string;
  control: 'slider' | 'number' | 'select' | 'color' | 'toggle' | 'segmented' | 'text';
  group: string;
  advanced: boolean;
  min?: number;
  max?: number;
  options?: readonly string[];
  defaultValue: unknown;
}

export const phaseOneOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'export.format': {
    label: 'Format',
    help: 'Choose the output format.',
    control: 'select',
    group: 'Output',
    advanced: false,
    options: ['same', 'jpeg', 'png', 'webp'],
    defaultValue: 'same',
  },
  'export.quality': {
    label: 'Quality',
    help: 'Higher values preserve more detail.',
    control: 'slider',
    group: 'Output',
    advanced: false,
    unit: '%',
    min: 1,
    max: 100,
    defaultValue: 82,
  },
  'export.lossless': {
    label: 'Use lossless encoding',
    control: 'toggle',
    group: 'Output',
    advanced: false,
    defaultValue: false,
  },
  'export.progressive': {
    label: 'Use progressive encoding',
    control: 'toggle',
    group: 'Output',
    advanced: true,
    defaultValue: false,
  },
  'export.stripMetadata': {
    label: 'Metadata',
    control: 'select',
    group: 'Output',
    advanced: true,
    options: ['none', 'all', 'gps', 'except-orientation-copyright'],
    defaultValue: 'none',
  },
  'export.filenameTemplate': {
    label: 'Filename template',
    control: 'text',
    group: 'Output',
    advanced: true,
    defaultValue: '{name}.{ext}',
  },
  'resize.mode': {
    label: 'Resize mode',
    control: 'segmented',
    group: 'Resize',
    advanced: false,
    options: ['pixels', 'percent', 'reduceBy', 'targetBytes', 'fit'],
    defaultValue: 'pixels',
  },
  'resize.width': {
    label: 'Width',
    control: 'number',
    group: 'Resize',
    advanced: false,
    unit: 'px',
    min: 1,
    defaultValue: 1200,
  },
  'resize.height': {
    label: 'Height',
    control: 'number',
    group: 'Resize',
    advanced: false,
    unit: 'px',
    min: 1,
    defaultValue: 800,
  },
  'resize.value': {
    label: 'Target size',
    help: 'Searches quality and dimensions using bounded attempts.',
    control: 'number',
    group: 'Resize',
    advanced: false,
    min: 1,
    defaultValue: 200,
  },
  'resize.unit': {
    label: 'Target size unit',
    control: 'select',
    group: 'Resize',
    advanced: false,
    options: ['KB', 'MB'],
    defaultValue: 'KB',
  },
  'resize.algorithm': {
    label: 'Algorithm',
    control: 'select',
    group: 'Resize',
    advanced: true,
    options: [
      'lanczos3',
      'lanczos2',
      'mitchell',
      'catmull-rom',
      'bicubic',
      'bilinear',
      'box',
      'nearest',
      'magic-kernel',
    ],
    defaultValue: 'lanczos3',
  },
  'resize.allowUpscale': {
    label: 'Allow enlargement',
    control: 'toggle',
    group: 'Resize',
    advanced: true,
    defaultValue: false,
  },
};
