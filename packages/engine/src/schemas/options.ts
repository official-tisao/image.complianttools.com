import { z } from 'zod';

const cssColor = z.string().regex(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i, 'Use a hex colour.');

export const SmartCropOptionsSchema = z.object({
  ratio: z.enum(['original', 'square', 'portrait', 'landscape', 'wide']).default('original'),
  method: z.enum(['center', 'thirds', 'saliency']).default('center'),
});
export type SmartCropOptions = z.infer<typeof SmartCropOptionsSchema>;

export const T63AltTextReviewOptionsSchema = z.object({
  decorative: z.boolean().default(false),
  purposeReviewed: z.boolean().default(false),
  redundancyReviewed: z.boolean().default(false),
  essentialDetailReviewed: z.boolean().default(false),
});
export type T63AltTextReviewOptions = z.infer<typeof T63AltTextReviewOptionsSchema>;
export const T63_ALT_TEXT_MAX_LENGTH = 125;
export const T63AltTextDraftSchema = z.string().max(T63_ALT_TEXT_MAX_LENGTH);

export const TextOptionsSchema = z.object({
  enabled: z.boolean().default(false),
  content: z.string().min(1).default('Text'),
  fontFamily: z.string().default('InterVariable'),
  fontSize: z.number().min(6).max(256).default(32),
  color: z.string().default('#000000'),
  stroke: z.boolean().default(false),
  strokeColor: z.string().default('#000000'),
  strokeWidth: z.number().min(0.5).max(32).default(2),
  shadowX: z.number().min(-50).max(50).default(0),
  shadowY: z.number().min(-50).max(50).default(0),
  shadowBlur: z.number().min(0).max(100).default(0),
  shadowColor: z.string().default('#000000'),
  curve: z.boolean().default(false),
  arc: z.boolean().default(false),
  opacity: z.number().min(0).max(100).default(100),
});
export type TextOptions = z.infer<typeof TextOptionsSchema>;

export const WatermarkOptionsSchema = z.object({
  enabled: z.boolean().default(false),
  kind: z.enum(['none', 'text', 'image']).default('none'),
  textContent: z.string().default(''),
  opacity: z.number().min(0).max(100).default(50),
  scaleWithImage: z.boolean().default(true),
  blendMode: z
    .enum(['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'difference'])
    .default('normal'),
  position: z
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
  rotation: z.number().min(-180).max(180).default(0),
  tiled: z.boolean().default(false),
  diagonalTiled: z.boolean().default(false),
});
export type WatermarkOptions = z.infer<typeof WatermarkOptionsSchema>;

export const LayerOptionsSchema = z.object({
  enabled: z.boolean().default(false),
  layers: z
    .array(
      z.object({
        id: z.string().min(1),
        blendMode: z
          .enum(['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'difference'])
          .default('normal'),
        opacity: z.number().min(0).max(1).default(1),
        visible: z.boolean().default(true),
        order: z.number().int().default(0),
        groupId: z.string().optional(),
      }),
    )
    .default([]),
});
export type LayerOptions = z.infer<typeof LayerOptionsSchema>;

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

export const MetadataRemovalPresetSchema = z.enum([
  'keep',
  'all',
  'gps',
  'except-orientation-copyright',
  'maker-notes',
  'custom',
]);

export const MetadataRemovalOptionsSchema = z
  .object({
    preset: MetadataRemovalPresetSchema.default('keep'),
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

const metadataEditField = z.object({
  enabled: z.boolean().default(false),
  value: z.string().default(''),
});

export const MetadataEditOptionsSchema = z
  .object({
    artist: metadataEditField.default({ enabled: false, value: '' }),
    copyright: metadataEditField.default({ enabled: false, value: '' }),
    imageDescription: metadataEditField.default({ enabled: false, value: '' }),
    userComment: metadataEditField.default({ enabled: false, value: '' }),
    dateTimeOriginal: metadataEditField.default({ enabled: false, value: '' }),
    software: metadataEditField.default({ enabled: false, value: '' }),
    rating: metadataEditField.default({ enabled: false, value: '' }),
    keywords: metadataEditField.default({ enabled: false, value: '' }),
    orientation: metadataEditField.default({ enabled: false, value: '' }),
    latitude: metadataEditField.default({ enabled: false, value: '' }),
    longitude: metadataEditField.default({ enabled: false, value: '' }),
  })
  .superRefine((options, context) => {
    for (const [field, state] of Object.entries(options))
      if (state.enabled && state.value.trim() === '')
        context.addIssue({
          code: 'custom',
          path: [field, 'value'],
          message: 'Enter a value for every enabled metadata field.',
        });
    const gpsEnabled = options.latitude.enabled || options.longitude.enabled;
    if (gpsEnabled && options.latitude.enabled !== options.longitude.enabled)
      context.addIssue({
        code: 'custom',
        path: ['latitude', 'enabled'],
        message: 'Enable both GPS latitude and longitude.',
      });
    const numericBounds = [
      ['rating', options.rating, 0, 5],
      ['orientation', options.orientation, 1, 8],
      ['latitude', options.latitude, -90, 90],
      ['longitude', options.longitude, -180, 180],
    ] as const;
    for (const [field, state, minimum, maximum] of numericBounds) {
      if (!state.enabled) continue;
      const value = Number(state.value);
      if (!Number.isFinite(value) || value < minimum || value > maximum)
        context.addIssue({
          code: 'custom',
          path: [field, 'value'],
          message: `${field} must be between ${minimum} and ${maximum}.`,
        });
    }
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

export const ImageToPdfOptionsSchema = z.object({
  pageSize: z.enum(['image', 'a4', 'letter']).default('image'),
  orientation: z.enum(['auto', 'portrait', 'landscape']).default('auto'),
  marginPoints: z.number().min(0).max(144).default(0),
  ordering: z.enum(['input', 'filename']).default('input'),
  compression: z.enum(['lossless', 'jpeg']).default('lossless'),
  jpegQuality: z.number().min(1).max(100).default(82),
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

export const VectorizeToolOptionsSchema = z.object({
  colors: z.number().int().min(2).max(64).default(16),
  curveTolerance: z.number().min(0.01).max(10).default(1),
});

export const FaviconToolOptionsSchema = z.object({
  siteName: z.string().trim().min(1).max(128).default('Site'),
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

export const HeicConverterToolOptionsSchema = z.object({
  direction: z.enum(['decode', 'encode']).default('decode'),
});
export type HeicConverterToolOptions = z.infer<typeof HeicConverterToolOptionsSchema>;

export const WebpConverterToolOptionsSchema = z.object({
  animated: z.boolean().default(false),
  lossless: z.boolean().default(false),
  quality: z.number().min(0).max(100).default(75),
  nearLossless: z.union([z.number().int().min(0).max(100), z.literal('off')]).default('off'),
  alphaQuality: z.number().int().min(0).max(100).default(100),
  method: z.number().int().min(0).max(6).default(4),
  frameDelayMs: z.number().int().min(10).max(60_000).default(100),
  loopCount: z.number().int().min(0).max(65_535).default(0),
});

export const AvifConverterToolOptionsSchema = z.object({
  direction: z.enum(['decode', 'encode']).default('decode'),
  lossless: z.boolean().default(false),
  quality: z.number().min(0).max(100).default(50),
  speed: z.number().int().min(0).max(10).default(6),
  chroma: z.enum(['444', '422', '420']).default('420'),
  bitDepth: z.union([z.literal(8), z.literal(10), z.literal(12)]).default(8),
});

export const JxlConverterToolOptionsSchema = z.object({
  direction: z.enum(['decode', 'encode']).default('decode'),
  lossless: z.boolean().default(false),
  quality: z.number().min(0).max(100).default(75),
  effort: z.number().int().min(1).max(9).default(7),
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
export type MetadataEditOptions = z.infer<typeof MetadataEditOptionsSchema>;
export type RawToolOptions = z.infer<typeof RawToolOptionsSchema>;
export type PdfToImageOptions = z.infer<typeof PdfToImageOptionsSchema>;
export type ImageToPdfOptions = z.infer<typeof ImageToPdfOptionsSchema>;
export type SvgRasterizeToolOptions = z.infer<typeof SvgRasterizeToolOptionsSchema>;
export type VectorizeToolOptions = z.infer<typeof VectorizeToolOptionsSchema>;
export type FaviconToolOptions = z.infer<typeof FaviconToolOptionsSchema>;
export type CbzToolOptions = z.infer<typeof CbzToolOptionsSchema>;
export type Base64ToolOptions = z.infer<typeof Base64ToolOptionsSchema>;
export type GifConverterToolOptions = z.infer<typeof GifConverterToolOptionsSchema>;
export type WebpConverterToolOptions = z.infer<typeof WebpConverterToolOptionsSchema>;
export type AvifConverterToolOptions = z.infer<typeof AvifConverterToolOptionsSchema>;
export type JxlConverterToolOptions = z.infer<typeof JxlConverterToolOptionsSchema>;
export type EmbeddedToolOptions = z.infer<typeof EmbeddedToolOptionsSchema>;

/**
 * A curve is a list of control points `[input, output]` in 0..255 with `input` strictly
 * increasing. An empty or single-point curve is the identity. The schema enforces a
 * minimum/maximum range; the engine enforces monotonicity and clamps overshooting
 * outputs to the input range (Fritsch–Carlson).
 */
const CurvePointsSchema = z
  .array(z.tuple([z.number().min(0).max(255), z.number().min(0).max(255)]))
  .max(64)
  .default([]);

/**
 * Phase 3 adjustment options (T37), ranges/defaults from README §6.7. `temperature` is a Kelvin
 * value (2000–50000) or the `'detected'` sentinel (default), which is a placeholder until a source
 * ICC/EXIF colour-temperature source is wired up. All numeric defaults are no-ops so the
 * all-defaults path is a true no-op. `clarity` and `dehaze` read a small neighbourhood and the
 * engine routes them through `executeTiled` with a halo (P1-04); the values here are the
 * `amount` only, not the kernel radius, which is fixed in code.
 */
export const AdjustOptionsSchema = z.object({
  brightness: z.number().min(-100).max(100).default(0),
  contrast: z.number().min(-100).max(100).default(0),
  saturation: z.number().min(-100).max(100).default(0),
  exposure: z.number().min(-5).max(5).default(0),
  gamma: z.number().min(0.1).max(5).default(1),
  temperature: z
    .union([z.number().min(2000).max(50000), z.literal('detected')])
    .default('detected'),
  tint: z.number().min(-150).max(150).default(0),
  highlights: z.number().min(-100).max(100).default(0),
  shadows: z.number().min(-100).max(100).default(0),
  // Additional scalar adjustments (P3-02.2+).
  whites: z.number().min(-100).max(100).default(0),
  blacks: z.number().min(-100).max(100).default(0),
  vibrance: z.number().min(-100).max(100).default(0),
  hue: z.number().min(-180).max(180).default(0),
  clarity: z.number().min(-100).max(100).default(0),
  dehaze: z.number().min(-100).max(100).default(0),
  opacity: z.number().min(0).max(100).default(100),
  // Curves (per-step). Per-channel overrides the RGB composite.
  curvesRGB: CurvePointsSchema,
  curvesR: CurvePointsSchema,
  curvesG: CurvePointsSchema,
  curvesB: CurvePointsSchema,
  // Levels (input range remap + output range remap with mid-tone gamma).
  levelsInBlack: z.number().min(0).max(255).default(0),
  levelsGamma: z.number().min(0.1).max(10).default(1),
  levelsInWhite: z.number().min(0).max(255).default(255),
  levelsOutBlack: z.number().min(0).max(255).default(0),
  levelsOutWhite: z.number().min(0).max(255).default(255),
});
export type AdjustOptions = z.infer<typeof AdjustOptionsSchema>;

/**
 * P3-04 enhancement toggles. The schema is a superset of the legacy
 * `'enhance'` step's `radius: number` option (still accepted for backward
 * compatibility) and the new richer option surface from README §6.6.
 * Every field has a documented default so an all-defaults options object
 * is a true no-op.
 */
export const EnhanceOptionsSchema = z
  .object({
    /** Auto-enhance amount 0–100. The new richer path. */
    amount: z.number().min(0).max(100).default(0),
    /** Legacy field: when set, the engine runs `boxBlur` with this radius. */
    radius: z.number().min(0).max(64).default(0),
  })
  .default({ amount: 0, radius: 0 });
export type EnhanceOptions = z.infer<typeof EnhanceOptionsSchema>;

/**
 * P3-04 sharpen. Unsharp mask; `amount` 0–500, `radius` 0.5–64 px,
 * `threshold` 0–255 (only edges above this luma difference get sharpened).
 */
export const SharpenOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    amount: z.number().min(0).max(500).default(100),
    radius: z.number().min(0.5).max(64).default(1),
    threshold: z.number().min(0).max(255).default(0),
  })
  .default({ enabled: false, amount: 100, radius: 1, threshold: 0 });
export type SharpenOptions = z.infer<typeof SharpenOptionsSchema>;

/**
 * P3-04 despeckle. Median filter over a `(2r+1)²` window; `radius` 1–8 px.
 */
export const DespeckleOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    radius: z.number().min(1).max(8).default(1),
  })
  .default({ enabled: false, radius: 1 });
export type DespeckleOptions = z.infer<typeof DespeckleOptionsSchema>;

/**
 * P3-04 antialias. Edge-aware Gaussian smoothing; `amount` 0–100.
 * Uses a 3×3 Gaussian kernel; halo is 1 px.
 */
export const AntialiasOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    amount: z.number().min(0).max(100).default(50),
  })
  .default({ enabled: false, amount: 50 });
export type AntialiasOptions = z.infer<typeof AntialiasOptionsSchema>;

/**
 * P3-04 normalize. Histogram percentile stretch from
 * `lowPercentile` to `highPercentile` (0..100).
 */
export const NormalizeOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    lowPercentile: z.number().min(0).max(100).default(0),
    highPercentile: z.number().min(0).max(100).default(100),
  })
  .default({ enabled: false, lowPercentile: 0, highPercentile: 100 });
export type NormalizeOptions = z.infer<typeof NormalizeOptionsSchema>;

/**
 * P3-04 blur. Six kernel variants from README §6.6. The `angle` field
 * is used by `motion` and `zoom`; `radius` is in pixels.
 */
export const BlurOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    type: z.enum(['gaussian', 'box', 'motion', 'radial', 'lens', 'zoom']).default('gaussian'),
    radius: z.number().min(0.5).max(64).default(2),
    angle: z.number().min(-180).max(180).default(0),
  })
  .default({ enabled: false, type: 'gaussian', radius: 2, angle: 0 });
export type BlurOptions = z.infer<typeof BlurOptionsSchema>;

/**
 * P3-04 denoise. `median` and `bilateral` are implemented; `nlm` is
 * deferred per the spec (NLM is uncleared in README §25.3.2). Calling
 * with `method: 'nlm'` throws the documented error.
 */
export const DenoiseOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    method: z.enum(['median', 'bilateral']).default('median'),
    strength: z.number().min(0).max(100).default(50),
  })
  .default({ enabled: false, method: 'median', strength: 50 });
export type DenoiseOptions = z.infer<typeof DenoiseOptionsSchema>;

/**
 * P3-04 black-and-white threshold. `'off'` means the op is a no-op;
 * `'otsu'` and `'adaptive'` (Sauvola) are auto-threshold algorithms;
 * a numeric value is the literal 0–255 threshold.
 */
export const BlackWhiteThresholdOptionsSchema = z
  .object({
    mode: z
      .union([
        z.literal('off'),
        z.literal('otsu'),
        z.literal('adaptive'),
        z.number().min(0).max(255),
      ])
      .default('off'),
  })
  .default({ mode: 'off' });
export type BlackWhiteThresholdOptions = z.infer<typeof BlackWhiteThresholdOptionsSchema>;

/**
 * P3-04 equalize. CLAHE histogram equalization.
 */
export const EqualizeOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    channels: z.enum(['rgb', 'all', 'gray']).default('rgb'),
    clipLimit: z.number().min(0).max(100).default(40),
  })
  .default({ enabled: false, channels: 'rgb', clipLimit: 40 });
export type EqualizeOptions = z.infer<typeof EqualizeOptionsSchema>;

/**
 * P3-04 deskew. Detect rotation angle and report it.
 */
export const DeskewOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxAngle: z.number().min(-90).max(90).default(20),
    background: z.string().default('#FFFFFF'),
  })
  .default({ enabled: false, maxAngle: 20, background: '#FFFFFF' });
export type DeskewOptions = z.infer<typeof DeskewOptionsSchema>;

/**
 * P3-04 noMultilayer. The engine has no multi-layer concept; the
 * step returns the source raster unchanged. The schema exists so
 * the option can be present in recipes without throwing at parse time.
 */
export const NoMultilayerOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
  })
  .default({ enabled: false });
export type NoMultilayerOptions = z.infer<typeof NoMultilayerOptionsSchema>;

/**
 * P3-05 T40 colour space & depth conversion. `target` is one of the
 * four synthesized ICC profile kinds; `bitDepth` is the per-channel
 * target depth. ICC embed/strip uses `color/icc.ts`.
 */
export const ColorSpaceOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    target: z.enum(['srgb', 'display-p3', 'adobe-rgb-compatible', 'gray']).default('srgb'),
    bitDepth: z.union([z.literal(8), z.literal(16)]).default(8),
    embedIcc: z.boolean().default(false),
    stripIcc: z.boolean().default(false),
  })
  .default({
    enabled: false,
    target: 'srgb',
    bitDepth: 8,
    embedIcc: false,
    stripIcc: false,
  });
export type ColorSpaceOptions = z.infer<typeof ColorSpaceOptionsSchema>;

/**
 * P3-05 T45 colour picker & palette extraction. `count` is the desired
 * number of palette entries; `method` is the algorithm; `seed` is a
 * deterministic start for k-means.
 */
export const PaletteOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    method: z.enum(['kmeans', 'median-cut']).default('kmeans'),
    count: z.number().min(2).max(64).default(8),
    seed: z.number().int().min(0).max(0xffffffff).default(0x5eed0000),
  })
  .default({
    enabled: false,
    method: 'kmeans',
    count: 8,
    seed: 0x5eed0000,
  });
export type PaletteOptions = z.infer<typeof PaletteOptionsSchema>;

/**
 * P3-05 T46 recolour / hue replace. `targetHue` is the hue to match
 * (0–360°); `tolerance` is the hue distance (0–180°); `replacement`
 * is the new colour; `feather` is the soft transition width (0–180°).
 */
export const RecolourOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    targetHue: z.number().min(0).max(360).default(0),
    tolerance: z.number().min(0).max(180).default(15),
    replacement: z
      .object({
        r: z.number().min(0).max(255).default(0),
        g: z.number().min(0).max(255).default(0),
        b: z.number().min(0).max(255).default(0),
      })
      .default({ r: 0, g: 0, b: 0 }),
    feather: z.number().min(0).max(180).default(0),
  })
  .default({
    enabled: false,
    targetHue: 0,
    tolerance: 15,
    replacement: { r: 0, g: 0, b: 0 },
    feather: 0,
  });
export type RecolourOptions = z.infer<typeof RecolourOptionsSchema>;

/** P3-06 T30 Canvas resize. */
export const CanvasResizeOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    width: z.number().int().positive().default(800),
    height: z.number().int().positive().default(600),
    anchor: z
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
    fillColor: z.string().default('#FFFFFF'),
  })
  .default({ enabled: false, width: 800, height: 600, anchor: 'center', fillColor: '#FFFFFF' });
export type CanvasResizeOptions = z.infer<typeof CanvasResizeOptionsSchema>;

/** P3-06 T31 Enlarge. */
export const EnlargeOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    scale: z.number().min(1).max(10).default(2),
    allowUpscale: z.boolean().default(true),
  })
  .default({ enabled: false, scale: 2, allowUpscale: true });
export type EnlargeOptions = z.infer<typeof EnlargeOptionsSchema>;

/** P3-06 T33 Border / Frame. */
export const BorderOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    width: z.number().int().positive().default(10),
    color: z.string().default('#000000'),
    inner: z.boolean().default(false),
  })
  .default({ enabled: false, width: 10, color: '#000000', inner: false });
export type BorderOptions = z.infer<typeof BorderOptionsSchema>;

/** P3-06 T34 Round Corners. */
export const RoundCornersOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    radius: z.number().int().min(0).max(255).default(20),
    background: z.string().optional().default('transparent'),
  })
  .default({ enabled: false, radius: 20, background: 'transparent' });
export type RoundCornersOptions = z.infer<typeof RoundCornersOptionsSchema>;

/** P3-06 T35 Collage / Merge. */
export const CollageOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.enum(['grid', 'horizontal', 'vertical', 'mosaic']).default('grid'),
    columns: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
    gap: z.number().int().min(0).default(0),
    background: z.string().default('#FFFFFF'),
    alignment: z
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
  })
  .default({ enabled: false, mode: 'grid', gap: 0, background: '#FFFFFF', alignment: 'center' });
export type CollageOptions = z.infer<typeof CollageOptionsSchema>;

/** P3-06 T36 Split / Tile. */
export const SplitOptionsSchema = z
  .object({
    enabled: z.boolean().default(false),
    rows: z.number().int().positive().default(2),
    cols: z.number().int().positive().default(2),
    output: z.enum(['array', 'individual']).default('array'),
  })
  .default({ enabled: false, rows: 2, cols: 2, output: 'array' });
export type SplitOptions = z.infer<typeof SplitOptionsSchema>;

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

export const t63AltTextReviewOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't63.decorative': {
    label: 'Mark image as decorative',
    help: 'Use only when the image adds no information beyond nearby text or layout.',
    control: 'toggle',
    group: 'Alt text',
    advanced: false,
    defaultValue: false,
  },
  't63.purposeReviewed': {
    label: 'I described the image’s purpose in this page context',
    help: 'Describe the information or function this image adds here.',
    control: 'toggle',
    group: 'Human review checklist',
    advanced: false,
    defaultValue: false,
  },
  't63.redundancyReviewed': {
    label: 'I checked nearby text for repetition',
    help: 'Avoid repeating captions, headings, or adjacent link text.',
    control: 'toggle',
    group: 'Human review checklist',
    advanced: false,
    defaultValue: false,
  },
  't63.essentialDetailReviewed': {
    label: 'I kept only essential details',
    help: 'Remove details that do not help a reader understand the page.',
    control: 'toggle',
    group: 'Human review checklist',
    advanced: false,
    defaultValue: false,
  },
};

export const smartCropToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  't27.ratio': {
    label: 'Crop aspect ratio',
    help: 'Original ratio keeps the whole image; other choices crop to a fixed ratio.',
    control: 'select',
    group: 'Smart Crop',
    advanced: false,
    options: ['original', 'square', 'portrait', 'landscape', 'wide'],
    optionLabels: {
      original: 'Original ratio',
      square: 'Square · 1:1',
      portrait: 'Portrait · 4:5',
      landscape: 'Landscape · 3:2',
      wide: 'Wide · 16:9',
    },
    defaultValue: 'original',
  },
  't27.method': {
    label: 'Crop placement',
    help: 'Placement changes only where the selected crop is taken from.',
    control: 'segmented',
    group: 'Smart Crop',
    advanced: false,
    options: ['center', 'thirds', 'saliency'],
    optionLabels: {
      center: 'Center crop',
      thirds: 'Rule-of-thirds placement',
      saliency: 'Visual-saliency estimate',
    },
    defaultValue: 'center',
  },
};

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
    optionLabels: {
      keep: 'Keep everything',
      all: 'Remove all',
      gps: 'Remove GPS only',
      'except-orientation-copyright': 'Keep orientation and copyright',
      'maker-notes': 'Remove MakerNotes',
      custom: 'Choose EXIF fields',
    },
    defaultValue: 'keep',
  },
};

const metadataEditLabels = {
  artist: 'Artist',
  copyright: 'Copyright',
  imageDescription: 'ImageDescription',
  userComment: 'UserComment',
  dateTimeOriginal: 'DateTimeOriginal',
  software: 'Software',
  rating: 'Rating',
  keywords: 'Keywords',
  orientation: 'Orientation',
  latitude: 'GPS latitude',
  longitude: 'GPS longitude',
} as const;

export const metadataEditOptionDescriptions: Readonly<Record<string, OptionDescription>> =
  Object.fromEntries(
    Object.entries(metadataEditLabels).flatMap(([field, label]) => [
      [
        `metadata.edit.${field}.enabled`,
        {
          label: `Edit ${label}`,
          control: 'toggle',
          group: 'EXIF editing',
          advanced: false,
          defaultValue: false,
        } satisfies OptionDescription,
      ],
      [
        `metadata.edit.${field}.value`,
        {
          label: `${label} value`,
          control: 'text',
          group: 'EXIF editing',
          advanced: false,
          defaultValue: '',
        } satisfies OptionDescription,
      ],
    ]),
  );

export const rawToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'raw.instantPreview': {
    label: 'Extract embedded preview first',
    help: "Downloads the camera's embedded rendering before developing DNG pixels.",
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

export const imageToPdfOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'pdf.pageSize': {
    label: 'Page size',
    help: 'Image size preserves one PDF point per source pixel. A4 and Letter fit and centre each image.',
    control: 'select',
    group: 'PDF',
    advanced: false,
    options: ['image', 'a4', 'letter'],
    optionLabels: { image: 'Match each image', a4: 'A4', letter: 'US Letter' },
    defaultValue: 'image',
  },
  'pdf.orientation': {
    label: 'Orientation',
    help: 'Auto follows each source image. Portrait or landscape forces every output page.',
    control: 'segmented',
    group: 'PDF',
    advanced: false,
    options: ['auto', 'portrait', 'landscape'],
    optionLabels: { auto: 'Auto', portrait: 'Portrait', landscape: 'Landscape' },
    defaultValue: 'auto',
  },
  'pdf.marginPoints': {
    label: 'Margin',
    help: 'Adds an equal white margin inside every page. There are 72 points per inch.',
    unit: 'pt',
    control: 'number',
    group: 'PDF',
    advanced: false,
    min: 0,
    max: 144,
    step: 1,
    defaultValue: 0,
  },
  'pdf.ordering': {
    label: 'Page ordering',
    control: 'segmented',
    group: 'PDF',
    advanced: false,
    options: ['input', 'filename'],
    optionLabels: { input: 'Selected order', filename: 'Filename' },
    defaultValue: 'input',
  },
  'pdf.compression': {
    label: 'Image compression',
    help: 'Lossless embeds PNG pages. JPEG can reduce size but may alter pixels.',
    control: 'segmented',
    group: 'PDF',
    advanced: false,
    options: ['lossless', 'jpeg'],
    optionLabels: { lossless: 'Lossless PNG', jpeg: 'JPEG' },
    defaultValue: 'lossless',
  },
  'pdf.jpegQuality': {
    label: 'JPEG quality',
    help: 'Used only for JPEG compression.',
    unit: '%',
    control: 'slider',
    group: 'PDF',
    advanced: true,
    min: 1,
    max: 100,
    step: 1,
    defaultValue: 82,
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

export const vectorizeToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'vector.colors': {
    label: 'Colour count',
    help: 'Posterizes the source before tracing. Fewer colours usually produce a smaller SVG.',
    control: 'number',
    group: 'Vector trace',
    advanced: false,
    min: 2,
    max: 64,
    step: 1,
    defaultValue: 16,
  },
  'vector.curveTolerance': {
    label: 'Curve tolerance',
    help: 'Higher values simplify traced lines and quadratic curves more aggressively.',
    control: 'slider',
    group: 'Vector trace',
    advanced: false,
    min: 0.01,
    max: 10,
    step: 0.01,
    defaultValue: 1,
  },
};

export const faviconToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'favicon.siteName': {
    label: 'Site name',
    help: 'Used for the name and short_name fields in site.webmanifest.',
    control: 'text',
    group: 'Favicon package',
    advanced: false,
    pattern: '.{1,128}',
    defaultValue: 'Site',
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

export const gifMakerToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'gifMaker.optimizeLevel': {
    label: 'Optimization level',
    help: '0 retains every frame; 1 merges duplicates; 2–3 make unchanged pixels transparent.',
    control: 'select',
    group: 'GIF encoding',
    advanced: false,
    options: ['0', '1', '2', '3'],
    defaultValue: 2,
  },
  'gifMaker.lossy': {
    label: 'Palette reduction (lossy)',
    help: 'Higher values reduce colour count more strongly (0 = off, up to 200).',
    control: 'slider',
    group: 'GIF encoding',
    advanced: false,
    min: 0,
    max: 200,
    defaultValue: 0,
  },
  'gifMaker.quantizer': {
    label: 'Quantizer',
    help: 'Palette-building algorithm.',
    control: 'select',
    group: 'GIF encoding',
    advanced: false,
    options: ['fixed-332', 'median-cut', 'octree', 'wu', 'neural'],
    optionLabels: {
      'fixed-332': 'Fixed RGB 3:3:2',
      'median-cut': 'Weighted median cut',
      octree: 'Weighted octree',
      wu: 'Wu variance',
      neural: 'Neural SOM (NeuQuant-equivalent)',
    },
    defaultValue: 'median-cut',
  },
  'gifMaker.paletteSize': {
    label: 'Palette size (2–256)',
    control: 'number',
    group: 'GIF encoding',
    advanced: false,
    min: 2,
    max: 256,
    defaultValue: 256,
  },
  'gifMaker.paletteMode': {
    label: 'Palette mode',
    control: 'select',
    group: 'GIF encoding',
    advanced: false,
    options: ['global', 'per-frame', 'adaptive'],
    defaultValue: 'adaptive',
  },
  'gifMaker.transparencyIndex': {
    label: 'Transparency index (0–255)',
    help: 'Palette index used for transparent pixels.',
    control: 'number',
    group: 'GIF encoding',
    advanced: false,
    min: 0,
    max: 255,
    defaultValue: 0,
  },
  'gifMaker.dither': {
    label: 'Dithering',
    control: 'select',
    group: 'GIF encoding',
    advanced: false,
    options: ['none', 'ordered', 'floyd-steinberg', 'atkinson', 'sierra'],
    defaultValue: 'floyd-steinberg',
  },
  'gifMaker.ditherAmount': {
    label: 'Dither amount (0–100)',
    control: 'slider',
    group: 'GIF encoding',
    advanced: false,
    min: 0,
    max: 100,
    defaultValue: 100,
  },
  'gifMaker.disposal': {
    label: 'Frame disposal',
    control: 'select',
    group: 'GIF encoding',
    advanced: false,
    options: ['auto', 'unspecified', 'none', 'background', 'previous'],
    defaultValue: 'auto',
  },
  'gifMaker.interlace': {
    label: 'Interlace rows',
    control: 'toggle',
    group: 'GIF encoding',
    advanced: false,
    defaultValue: false,
  },
  'gifMaker.frameGenerator': {
    label: 'Frame generator',
    control: 'select',
    group: 'Animation',
    advanced: false,
    options: ['forward', 'reverse', 'bounce', 'crossfade'],
    defaultValue: 'forward',
  },
  'gifMaker.crossfadeFrames': {
    label: 'Crossfade frames',
    help: 'Used only when frame generator is crossfade.',
    control: 'number',
    group: 'Animation',
    advanced: false,
    min: 1,
    max: 30,
    defaultValue: 2,
  },
  'gifMaker.delayMs': {
    label: 'Frame delay (ms)',
    control: 'number',
    group: 'Animation',
    advanced: false,
    min: 10,
    max: 60000,
    defaultValue: 100,
  },
  'gifMaker.loopCount': {
    label: 'Loop count (0 = infinite)',
    control: 'number',
    group: 'Animation',
    advanced: false,
    min: 0,
    max: 65535,
    defaultValue: 0,
  },
};

export const GifMakerToolOptionsSchema = z.object({
  optimizeLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(2),
  lossy: z.number().min(0).max(200).default(0),
  quantizer: z.enum(['fixed-332', 'median-cut', 'octree', 'wu', 'neural']).default('median-cut'),
  paletteSize: z.number().min(2).max(256).default(256),
  paletteMode: z.enum(['global', 'per-frame', 'adaptive']).default('adaptive'),
  transparencyIndex: z.number().min(0).max(255).default(0),
  dither: z
    .enum(['none', 'ordered', 'floyd-steinberg', 'atkinson', 'sierra'])
    .default('floyd-steinberg'),
  ditherAmount: z.number().min(0).max(100).default(100),
  disposal: z.enum(['auto', 'unspecified', 'none', 'background', 'previous']).default('auto'),
  interlace: z.boolean().default(false),
  frameGenerator: z.enum(['forward', 'reverse', 'bounce', 'crossfade']).default('forward'),
  crossfadeFrames: z.number().min(1).max(30).default(2),
  delayMs: z.number().min(10).max(60000).default(100),
  loopCount: z.number().min(0).max(65535).default(0),
});
export type GifMakerToolOptions = z.infer<typeof GifMakerToolOptionsSchema>;

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

export const webpConverterToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'webp.animated': {
    label: 'Create an animation',
    help: 'Uses every selected image as a frame; an animated GIF keeps its original frame delays.',
    control: 'toggle',
    group: 'WebP',
    advanced: false,
    defaultValue: false,
  },
  'webp.lossless': {
    label: 'Use lossless encoding',
    control: 'toggle',
    group: 'WebP',
    advanced: false,
    defaultValue: false,
  },
  'webp.quality': {
    label: 'Lossy quality',
    help: 'Ignored when lossless encoding is enabled.',
    unit: '%',
    control: 'slider',
    group: 'WebP',
    advanced: false,
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 75,
  },
  'webp.nearLossless': {
    label: 'Near-lossless strength',
    help: 'Uses a lossless WebP bitstream after controlled pixel preprocessing; 100 preserves pixels exactly.',
    control: 'select',
    group: 'WebP',
    advanced: true,
    options: ['off', '100', '80', '60', '40', '20', '0'],
    optionLabels: {
      off: 'Off',
      '100': '100 — exact pixels',
      '80': '80',
      '60': '60',
      '40': '40',
      '20': '20',
      '0': '0 — strongest preprocessing',
    },
    defaultValue: 'off',
  },
  'webp.alphaQuality': {
    label: 'Alpha quality',
    help: 'Controls transparency compression independently from colour.',
    unit: '%',
    control: 'slider',
    group: 'WebP',
    advanced: true,
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 100,
  },
  'webp.method': {
    label: 'Encoding method',
    help: 'Higher values spend more time searching for a smaller file.',
    control: 'slider',
    group: 'WebP',
    advanced: true,
    min: 0,
    max: 6,
    step: 1,
    defaultValue: 4,
  },
  'webp.frameDelayMs': {
    label: 'Frame delay',
    help: 'Used for separate image files; GIF input keeps its own timing.',
    unit: 'ms',
    control: 'number',
    group: 'Animation',
    advanced: true,
    min: 10,
    max: 60_000,
    step: 10,
    defaultValue: 100,
  },
  'webp.loopCount': {
    label: 'Loop count',
    help: '0 repeats forever.',
    control: 'number',
    group: 'Animation',
    advanced: true,
    min: 0,
    max: 65_535,
    step: 1,
    defaultValue: 0,
  },
};

export const avifConverterToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'avif.direction': {
    label: 'Direction',
    control: 'segmented',
    group: 'AVIF',
    advanced: false,
    options: ['decode', 'encode'],
    optionLabels: { decode: 'AVIF to PNG', encode: 'Image to AVIF' },
    defaultValue: 'decode',
  },
  'avif.lossless': {
    label: 'Use lossless encoding',
    help: 'Used only when creating AVIF.',
    control: 'toggle',
    group: 'AVIF',
    advanced: false,
    defaultValue: false,
  },
  'avif.quality': {
    label: 'Lossy quality',
    help: 'Used only for lossy AVIF encoding.',
    unit: '%',
    control: 'slider',
    group: 'AVIF',
    advanced: false,
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 50,
  },
  'avif.speed': {
    label: 'Encoding speed',
    help: 'Lower values spend more time searching for a smaller file.',
    control: 'slider',
    group: 'AVIF',
    advanced: true,
    min: 0,
    max: 10,
    step: 1,
    defaultValue: 6,
  },
  'avif.chroma': {
    label: 'Chroma sampling',
    help: '4:4:4 preserves full colour detail; subsampling can reduce file size.',
    control: 'segmented',
    group: 'AVIF',
    advanced: true,
    options: ['444', '422', '420'],
    optionLabels: { '444': '4:4:4', '422': '4:2:2', '420': '4:2:0' },
    defaultValue: '420',
  },
  'avif.bitDepth': {
    label: 'Bit depth',
    help: 'Higher depths preserve finer sample precision in the AVIF bitstream.',
    unit: 'bit',
    control: 'number',
    group: 'AVIF',
    advanced: true,
    min: 8,
    max: 12,
    step: 2,
    defaultValue: 8,
  },
};

export const jxlConverterToolOptionDescriptions: Readonly<Record<string, OptionDescription>> = {
  'jxl.direction': {
    label: 'Direction',
    control: 'segmented',
    group: 'JPEG XL',
    advanced: false,
    options: ['decode', 'encode'],
    optionLabels: { decode: 'JPEG XL to PNG', encode: 'Image to JPEG XL' },
    defaultValue: 'decode',
  },
  'jxl.lossless': {
    label: 'Use lossless raster encoding',
    help: 'Preserves decoded pixels; this is not reconstructible JPEG recompression.',
    control: 'toggle',
    group: 'JPEG XL',
    advanced: false,
    defaultValue: false,
  },
  'jxl.quality': {
    label: 'Lossy quality',
    help: 'Used only for lossy JPEG XL encoding.',
    unit: '%',
    control: 'slider',
    group: 'JPEG XL',
    advanced: false,
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 75,
  },
  'jxl.effort': {
    label: 'Encoding effort',
    help: 'Higher values spend more time searching for a smaller file.',
    control: 'slider',
    group: 'JPEG XL',
    advanced: true,
    min: 1,
    max: 9,
    step: 1,
    defaultValue: 7,
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
