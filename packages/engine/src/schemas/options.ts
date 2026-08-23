import { z } from 'zod';

const cssColor = z.string().regex(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i, 'Use a hex colour.');

export const ExportOptionsSchema = z.object({
  format: z
    .enum(['same', 'avif', 'bmp', 'exr', 'gif', 'jpeg', 'jxl', 'png', 'qoi', 'tga', 'tiff', 'webp'])
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

export const MetadataRemovalOptionsSchema = z
  .object({
    preset: z
      .enum(['keep', 'all', 'gps', 'except-orientation-copyright', 'maker-notes', 'custom'])
      .default('keep'),
    selectedTags: z.array(z.number().int().min(0).max(0xffff)).default([]),
  })
  .superRefine((value, context) => {
    if (value.preset === 'custom' && value.selectedTags.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['selectedTags'],
        message: 'Select at least one EXIF field to remove.',
      });
  });

export const RawToolOptionsSchema = z.object({
  instantPreview: z.boolean().default(true),
  demosaic: z.enum(['linear', 'vng', 'ppg', 'dcb', 'ahd']).default('ahd'),
  whiteBalance: z.enum(['as-shot', 'camera', 'auto', 'daylight', 'custom']).default('as-shot'),
  temperatureKelvin: z.number().min(2_000).max(50_000).default(6_500),
  tint: z.number().min(-150).max(150).default(0),
  highlightRecovery: z.enum(['clip', 'unclip', 'blend', 'rebuild']).default('clip'),
  outputColorSpace: z.enum(['srgb', 'display-p3', 'adobe-rgb', 'gray']).default('srgb'),
  outputBitDepth: z.coerce
    .number()
    .pipe(z.union([z.literal(8), z.literal(16)]))
    .default(8),
  gamma: z.number().min(0.1).max(5).default(2.2),
  exposureEv: z.number().min(-3).max(3).default(0),
  noiseReductionThreshold: z.number().min(0).max(100).default(0),
  chromaticAberrationCorrection: z.boolean().default(false),
});

export const PdfToImageOptionsSchema = z.object({
  pageNumber: z.number().int().min(1).default(1),
  dpi: z.number().min(18).max(600).default(72),
});

export const SvgRasterizeToolOptionsSchema = z
  .object({
    mode: z.enum(['original', 'width', 'height', 'scale']).default('original'),
    value: z.number().positive().max(32_768).default(1),
  })
  .superRefine((value, context) => {
    if ((value.mode === 'width' || value.mode === 'height') && !Number.isInteger(value.value))
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'SVG output dimensions must be whole pixels.',
      });
    if (value.mode === 'scale' && value.value > 100)
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'SVG scale factor must not exceed 100.',
      });
  });

export const CbzToolOptionsSchema = z.object({
  operation: z.enum(['create', 'extract', 'pdf']).default('create'),
});

export const Base64ToolOptionsSchema = z.object({
  mode: z.enum(['encode', 'decode']).default('encode'),
});

export const GifConverterToolOptionsSchema = z.object({
  output: z.enum(['frames', 'apng', 'webp', 'mp4', 'webm']).default('frames'),
});

const embeddedFormats = [
  'alpha1',
  'alpha2',
  'alpha4',
  'alpha8',
  'indexed1',
  'indexed2',
  'indexed4',
  'indexed8',
  'raw',
  'raw-alpha',
  'raw-chroma',
  'rgb332',
  'rgb565',
  'rgb565be',
  'rgb565a8',
  'rgb888',
  'bgr888',
  'argb8888',
  'rgba8888',
  'xrgb8888',
  'gray8',
  'mono1',
] as const;

export const EmbeddedToolOptionsSchema = z
  .object({
    target: z
      .enum([
        'generic',
        'generic-bin',
        'lvgl-v8',
        'lvgl-v8-bin',
        'lvgl-v9',
        'lvgl-v9-bin',
        'adafruit',
        'esp-idf',
      ])
      .default('generic'),
    outputName: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, 'Output name must be a valid C identifier.')
      .default('image_data'),
    alphaByte: z.boolean().default(false),
    chromaKeyed: z.boolean().default(false),
    chromaKey: cssColor.default('#00ff00'),
    bigEndian: z.boolean().default(false),
    storage: z.enum(['const', 'static', 'static-const']).default('static-const'),
    lineWidth: z.number().int().min(1).max(256).default(12),
    dithering: z.enum(['none', 'ordered']).default('none'),
    format: z.enum(embeddedFormats).default('rgb565'),
  })
  .superRefine((value, context) => {
    const allowed: Partial<Record<typeof value.target, readonly (typeof value.format)[]>> = {
      generic: embeddedFormats.filter(
        (format) => format !== 'raw' && format !== 'raw-alpha' && format !== 'raw-chroma',
      ),
      'generic-bin': [
        'rgb565',
        'rgb565be',
        'rgb888',
        'bgr888',
        'argb8888',
        'rgba8888',
        'gray8',
        'mono1',
      ],
      'lvgl-v8-bin': ['rgb332', 'rgb565', 'rgb565be', 'rgb888'],
      'lvgl-v9-bin': ['rgb332', 'rgb565', 'rgb565be', 'rgb888'],
      'lvgl-v8': [
        'alpha1',
        'alpha2',
        'alpha4',
        'alpha8',
        'indexed1',
        'indexed2',
        'indexed4',
        'indexed8',
        'raw',
        'raw-alpha',
        'raw-chroma',
        'rgb565',
        'rgb565be',
        'rgb565a8',
        'rgb888',
        'argb8888',
      ],
      'lvgl-v9': ['rgb565', 'rgb565be', 'rgb565a8', 'rgb888', 'xrgb8888', 'argb8888'],
      'esp-idf': ['rgb565', 'rgb565be'],
    };
    const formats = allowed[value.target];
    if (formats && !formats.includes(value.format))
      context.addIssue({
        code: 'custom',
        path: ['format'],
        message: `${value.target} does not support ${value.format}.`,
      });
    if (value.format === 'mono1' && value.alphaByte)
      context.addIssue({
        code: 'custom',
        path: ['alphaByte'],
        message: 'Mono1 output cannot append an alpha byte.',
      });
  });

export type ExportOptionsInput = z.input<typeof ExportOptionsSchema>;
export type ResizeOptions = z.infer<typeof ResizeOptionsSchema>;
export type CropOptions = z.infer<typeof CropOptionsSchema>;
export type RotateOptions = z.infer<typeof RotateOptionsSchema>;
export type MetadataRemovalOptions = z.infer<typeof MetadataRemovalOptionsSchema>;
export type RawToolOptions = z.infer<typeof RawToolOptionsSchema>;
export type PdfToImageOptions = z.infer<typeof PdfToImageOptionsSchema>;
export type SvgRasterizeToolOptions = z.infer<typeof SvgRasterizeToolOptionsSchema>;
export type CbzToolOptions = z.infer<typeof CbzToolOptionsSchema>;
export type Base64ToolOptions = z.infer<typeof Base64ToolOptionsSchema>;
export type GifConverterToolOptions = z.infer<typeof GifConverterToolOptionsSchema>;
export type EmbeddedToolOptions = z.infer<typeof EmbeddedToolOptionsSchema>;

export interface OptionDescription {
  label: string;
  help?: string;
  unit?: string;
  control: 'slider' | 'number' | 'select' | 'color' | 'toggle' | 'segmented' | 'text';
  group: string;
  advanced: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  optionLabels?: Readonly<Record<string, string>>;
  pattern?: string;
  defaultValue: unknown;
}

export const phaseOneOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'export.format': {
    label: 'Format',
    help: 'Choose the output format.',
    control: 'select',
    group: 'Output',
    advanced: false,
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

export const metadataRemovalOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'metadata.preset': {
    label: 'Removal preset',
    help: 'Keep everything is the safe no-op default. Select a removal policy explicitly.',
    control: 'select',
    group: 'Metadata',
    advanced: false,
    options: ['keep', 'all', 'gps', 'except-orientation-copyright', 'maker-notes', 'custom'],
    defaultValue: 'keep',
  },
};

export const rawToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'raw.instantPreview': {
    label: 'Extract embedded preview first',
    help: "Downloads the camera's embedded JPEG before developing DNG pixels.",
    control: 'toggle',
    group: 'RAW',
    advanced: false,
    defaultValue: true,
  },
  'raw.demosaic': {
    label: 'Demosaic',
    control: 'select',
    group: 'RAW',
    advanced: false,
    options: ['ahd', 'vng', 'ppg', 'dcb', 'linear'],
    defaultValue: 'ahd',
  },
  'raw.whiteBalance': {
    label: 'White balance',
    control: 'select',
    group: 'RAW',
    advanced: false,
    options: ['as-shot', 'camera', 'auto', 'daylight', 'custom'],
    defaultValue: 'as-shot',
  },
  'raw.temperatureKelvin': {
    label: 'Custom temperature',
    help: 'Used only when white balance is custom.',
    unit: 'K',
    control: 'number',
    group: 'RAW',
    advanced: true,
    min: 2_000,
    max: 50_000,
    defaultValue: 6_500,
  },
  'raw.tint': {
    label: 'Custom tint',
    help: 'Used only when white balance is custom.',
    control: 'number',
    group: 'RAW',
    advanced: true,
    min: -150,
    max: 150,
    defaultValue: 0,
  },
  'raw.highlightRecovery': {
    label: 'Highlight recovery',
    control: 'select',
    group: 'RAW',
    advanced: false,
    options: ['clip', 'unclip', 'blend', 'rebuild'],
    defaultValue: 'clip',
  },
  'raw.outputColorSpace': {
    label: 'Output colour space',
    control: 'select',
    group: 'Output',
    advanced: false,
    options: ['srgb', 'display-p3', 'adobe-rgb', 'gray'],
    defaultValue: 'srgb',
  },
  'raw.outputBitDepth': {
    label: 'Output bit depth',
    control: 'select',
    group: 'Output',
    advanced: false,
    options: ['8', '16'],
    defaultValue: 8,
  },
  'raw.gamma': {
    label: 'Gamma',
    control: 'number',
    group: 'RAW',
    advanced: true,
    min: 0.1,
    max: 5,
    step: 0.1,
    defaultValue: 2.2,
  },
  'raw.exposureEv': {
    label: 'Exposure',
    unit: 'EV',
    control: 'number',
    group: 'RAW',
    advanced: false,
    min: -3,
    max: 3,
    step: 0.1,
    defaultValue: 0,
  },
  'raw.noiseReductionThreshold': {
    label: 'Noise-reduction threshold',
    control: 'number',
    group: 'RAW',
    advanced: true,
    min: 0,
    max: 100,
    defaultValue: 0,
  },
  'raw.chromaticAberrationCorrection': {
    label: 'Chromatic-aberration correction',
    control: 'toggle',
    group: 'RAW',
    advanced: true,
    defaultValue: false,
  },
};

export const pdfToImageOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'pdf.pageNumber': {
    label: 'Page',
    control: 'number',
    group: 'PDF',
    advanced: false,
    min: 1,
    step: 1,
    defaultValue: 1,
  },
  'pdf.dpi': {
    label: 'Output DPI',
    help: "Controls raster dimensions relative to PDF's 72 DPI coordinate system.",
    unit: 'DPI',
    control: 'number',
    group: 'PDF',
    advanced: false,
    min: 18,
    max: 600,
    step: 1,
    defaultValue: 72,
  },
};

export const svgRasterizeOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'svg.mode': {
    label: 'Output sizing',
    control: 'select',
    group: 'SVG',
    advanced: false,
    options: ['original', 'width', 'height', 'scale'],
    optionLabels: {
      original: 'Intrinsic dimensions',
      width: 'Explicit width',
      height: 'Explicit height',
      scale: 'Scale factor',
    },
    defaultValue: 'original',
  },
  'svg.value': {
    label: 'Dimension or scale value',
    help: 'Ignored for intrinsic dimensions. Width and height use whole pixels; scale is capped at 100×.',
    control: 'number',
    group: 'SVG',
    advanced: false,
    min: 0.01,
    max: 32_768,
    step: 0.01,
    defaultValue: 1,
  },
};

export const cbzToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'cbz.operation': {
    label: 'Operation',
    control: 'select',
    group: 'Comic archive',
    advanced: false,
    options: ['create', 'extract', 'pdf'],
    optionLabels: {
      create: 'Images to CBZ',
      extract: 'CBZ/ZIP to image files',
      pdf: 'CBZ/ZIP to PDF',
    },
    defaultValue: 'create',
  },
};

export const base64ToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'base64.mode': {
    label: 'Direction',
    control: 'select',
    group: 'Base64',
    advanced: false,
    options: ['encode', 'decode'],
    optionLabels: { encode: 'Image to Base64', decode: 'Base64 to file' },
    defaultValue: 'encode',
  },
};

export const gifConverterToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'gif.output': {
    label: 'Output',
    help: 'MP4 and WebM require a compatible local WebCodecs encoder.',
    control: 'select',
    group: 'GIF',
    advanced: false,
    options: ['frames', 'apng', 'webp', 'mp4', 'webm'],
    optionLabels: {
      frames: 'Separate PNG frames',
      apng: 'Animated PNG (APNG)',
      webp: 'Animated WebP',
      mp4: 'MP4 video',
      webm: 'WebM video',
    },
    defaultValue: 'frames',
  },
};

export const embeddedToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'embedded.target': {
    label: 'Target',
    control: 'select',
    group: 'Embedded',
    advanced: false,
    options: [
      'generic',
      'generic-bin',
      'lvgl-v9',
      'lvgl-v9-bin',
      'lvgl-v8',
      'lvgl-v8-bin',
      'adafruit',
      'esp-idf',
    ],
    optionLabels: {
      generic: 'Generic C array',
      'generic-bin': 'Generic raw binary',
      'lvgl-v9': 'LVGL v9 image descriptor',
      'lvgl-v9-bin': 'LVGL v9 binary',
      'lvgl-v8': 'LVGL v8 image descriptor',
      'lvgl-v8-bin': 'LVGL v8 binary',
      adafruit: 'Adafruit GFX 1-bit bitmap',
      'esp-idf': 'ESP-IDF / TFT_eSPI array',
    },
    defaultValue: 'generic',
  },
  'embedded.dithering': {
    label: 'Dithering',
    control: 'select',
    group: 'Embedded',
    advanced: false,
    options: ['none', 'ordered'],
    optionLabels: { none: 'None', ordered: 'Ordered Bayer' },
    defaultValue: 'none',
  },
  'embedded.alphaByte': {
    label: 'Append alpha byte',
    control: 'toggle',
    group: 'Embedded',
    advanced: true,
    defaultValue: false,
  },
  'embedded.bigEndian': {
    label: 'Big-endian byte order',
    control: 'toggle',
    group: 'Embedded',
    advanced: true,
    defaultValue: false,
  },
  'embedded.chromaKeyed': {
    label: 'Enable chroma key',
    control: 'toggle',
    group: 'Embedded',
    advanced: true,
    defaultValue: false,
  },
  'embedded.chromaKey': {
    label: 'Chroma key colour',
    help: 'Used only when chroma key is enabled.',
    control: 'color',
    group: 'Embedded',
    advanced: true,
    defaultValue: '#00ff00',
  },
  'embedded.storage': {
    label: 'Storage qualifier',
    control: 'select',
    group: 'C source',
    advanced: true,
    options: ['static-const', 'const', 'static'],
    optionLabels: { 'static-const': 'static const', const: 'const', static: 'static' },
    defaultValue: 'static-const',
  },
  'embedded.lineWidth': {
    label: 'Bytes per source line',
    control: 'number',
    group: 'C source',
    advanced: true,
    min: 1,
    max: 256,
    step: 1,
    defaultValue: 12,
  },
  'embedded.format': {
    label: 'Pixel format',
    control: 'select',
    group: 'Embedded',
    advanced: false,
    options: embeddedFormats,
    defaultValue: 'rgb565',
  },
  'embedded.outputName': {
    label: 'C symbol name',
    control: 'text',
    group: 'C source',
    advanced: false,
    pattern: '[A-Za-z_][A-Za-z0-9_]*',
    defaultValue: 'image_data',
  },
};
