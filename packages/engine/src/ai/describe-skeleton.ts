/**
 * P5-15 — T71's **local descriptive skeleton**. README §4.9, §13.1.3 row "Describe / alt text".
 *
 * §4.9's "Without a key" column is the whole reason this file exists:
 *
 * > A **descriptive skeleton** is produced locally: dimensions, aspect, dominant palette,
 * > transparency, orientation, face count, embedded text via OCR (T62), and EXIF subject fields
 * > — enough for a human to finish an alt text in seconds.
 *
 * Four properties this module holds itself to, each of which is a way the feature could quietly
 * become a lie:
 *
 * 1. **Nothing here infers content.** A skeleton reports measured facts about *pixels and bytes*.
 *    It never says what the image depicts. "Dominant palette is blue and white" is a measurement;
 *    "a photograph of a sky" is a guess, and dimensions, colours, and filenames are far too weak a
 *    signal to make it. `DESCRIPTIVE_SKELETON_DISCLAIMER` says so in the output itself.
 * 2. **Every field is labelled with its own epistemic status.** A field that could not be computed
 *    says why (`unavailable`, `unsupported`, `uncertain`) instead of being omitted or zero-filled.
 *    `SkeletonField.status` is that label; `measured` is the only status that means "this is a fact".
 * 3. **One field's failure never takes down the report.** Each field is computed inside its own
 *    try/catch, so a corrupt EXIF block or an unreadable palette degrades exactly one row. This is
 *    the `SkeletonSources` contract, and it is what lets a caller supply a half-working source set.
 * 4. **No network, ever.** This module performs no I/O of any kind — not even the OCR HEAD probe.
 *    Whether OCR *data* exists locally is something a caller must determine out of band (the web
 *    route probes for it before deciding); `SkeletonSources.ocr` is a value, not a promise to fetch.
 *
 * That last point is the reason OCR and faces are *optional inputs* rather than computations here.
 * `script/Cyrillic.traineddata` is the only OCR model bundled with the app (PLAN.md P2-07), so any
 * other language would require downloading ~2–85 MB mid-report — which §4.9's promise of a local
 * action forbids. Face detection has the same shape: the YuNet weights are not in the bundle and
 * the Tier 1 Viola–Jones cascade reads from disk, so neither can run without the caller supplying
 * bytes it already holds. Both therefore report honestly instead of silently downloading.
 */

import type { RasterImage } from '../types.js';
import { extractPalette } from '../color/palette.js';
import { inspectImageContainer, type ImageInspection } from '../metadata/inspect.js';
import { readExifAllIfds, type ExifDirectoryField } from '../metadata/exif.js';

/** Shown at the top of every skeleton report. */
export const DESCRIPTIVE_SKELETON_DISCLAIMER =
  'Local descriptive skeleton. These are measured facts about this file’s pixels and metadata — ' +
  'not AI recognition, and not finished alt text. Nothing here says what the image depicts, and ' +
  'no value is inferred from dimensions, colours, or the file name. You write the alt text.';

/** Shown per report so the "what is this" question is answered where it is asked. */
export const DESCRIPTIVE_SKELETON_SCOPE =
  'A skeleton gives a person the literal facts in seconds so they can finish the alt text themselves. ' +
  'It cannot name objects, describe actions, or judge meaning — that is what T71’s optional provider step is for.';

/**
 * How much to trust one field.
 *
 * The distinction that matters is `measured` versus everything else. `uncertain` is deliberately not
 * a softer `measured`: it means the value exists but is not a fact about this image (a colour
 * quantisation is an approximation; a face count from a cascade is a guess). The UI renders these
 * four states differently so a reader is never misled about which they are looking at.
 */
export type SkeletonFieldStatus =
  /** Read directly from the file or its pixels. A fact. */
  | 'measured'
  /** The data needed to compute it is not present locally. Nothing was downloaded. */
  | 'unavailable'
  /** This container/format cannot express the field at all. */
  | 'unsupported'
  /** Computed, but an approximation — a quantisation, a heuristic, a bounded sample. */
  | 'uncertain';

/** One reported fact, with its own status. Never null: absence is a status, not a hole. */
export interface SkeletonField<T = string> {
  readonly label: string;
  readonly status: SkeletonFieldStatus;
  /** Present only when `status` is `measured`, `uncertain`, or `unsupported` (which names the limit). */
  readonly value?: T;
  /** Why this status. Always present, so no row is ever a bare "unavailable". */
  readonly note: string;
}

/** The eight fields README §4.9 names, in the order the section lists them. */
export interface DescriptiveSkeleton {
  readonly dimensions: SkeletonField<{ readonly width: number; readonly height: number }>;
  readonly aspectRatio: SkeletonField<string>;
  readonly dominantPalette: SkeletonField<readonly PaletteSwatch[]>;
  readonly transparency: SkeletonField<string>;
  readonly orientation: SkeletonField<string>;
  readonly faceCount: SkeletonField<number>;
  readonly embeddedText: SkeletonField<string>;
  readonly exifSubjectFields: SkeletonField<readonly ExifSubjectField[]>;
}

/** One dominant colour, as reported. Kept separate from `PaletteEntry` to fix its contract. */
export interface PaletteSwatch {
  readonly hex: string;
  readonly rgb: { readonly r: number; readonly g: number; readonly b: number };
  /** Share of sampled pixels, 0–1. Sampled, not exhaustive — hence the `uncertain` status. */
  readonly share: number;
}

/** One EXIF/IPTC/XMP tag that carries words a person wrote about the subject. */
export interface ExifSubjectField {
  /** Human tag name, e.g. `ImageDescription`. */
  readonly name: string;
  readonly value: string;
}

/**
 * Everything the skeleton reads, supplied by the caller.
 *
 * Every source is optional and every one may throw. That is the point: a caller that has only a
 * file's bytes still gets dimensions, palette, transparency, orientation, and EXIF, and honest
 * "unavailable" rows for faces and text.
 */
export interface SkeletonSources {
  /** The encoded file bytes. Needed for container inspection and EXIF. */
  readonly bytes: ArrayBuffer | Uint8Array;
  /**
   * Decoded pixels. Needed for palette and for transparency measured from the actual alpha channel.
   * Without it those two rows report `unavailable` rather than guessing from the container flag.
   */
  readonly raster?: RasterImage;
  /**
   * Face count, already computed by a caller holding model bytes.
   *
   * Deliberately a plain number, not a detection function: this module must never be handed a
   * detector it could call, because a detector that needs weights might fetch them. `undefined`
   * means "no local face detector available" and reports as such — never as zero.
   */
  readonly faceCount?: { readonly count: number; readonly note?: string };
  /**
   * Embedded text, already recognised by the caller.
   *
   * `undefined` means "no OCR data available locally". The report must say so rather than trigger a
   * download; see {@link OCR_UNAVAILABLE_NOTE}.
   */
  readonly ocrText?: {
    readonly text: string;
    readonly model?: string;
    readonly confidence?: number;
  };
}

/** Reported for faces when no local detector supplied a count. */
export const FACE_DETECTION_UNAVAILABLE_NOTE =
  'Not computed. No face-detection weights are bundled with this app, and the local report never downloads any. ' +
  'A face count of zero would be a claim about the image that nothing here can support, so this row stays empty.';

/** Reported for embedded text when no local OCR model is present. */
export const OCR_UNAVAILABLE_NOTE =
  'Not computed. Reading text needs an OCR model, and only one language model is bundled locally — this report ' +
  'never downloads one. Use /ocr to recognise text, then paste it here, or connect a provider for a description.';

/**
 * Build the local descriptive skeleton.
 *
 * Synchronous and total: it always returns a report, and each field is computed independently so one
 * throwing source costs exactly one row. This function performs no network or filesystem access.
 */
export function buildDescriptiveSkeleton(sources: SkeletonSources): DescriptiveSkeleton {
  return {
    dimensions: field('Dimensions', () => dimensionField(sources)),
    aspectRatio: field('Aspect ratio', () => aspectRatioField(sources)),
    dominantPalette: field('Dominant palette', () => paletteField(sources)),
    transparency: field('Transparency', () => transparencyField(sources)),
    orientation: field('Orientation', () => orientationField(sources)),
    faceCount: field('Face count', () => faceCountField(sources)),
    embeddedText: field('Embedded text', () => embeddedTextField(sources)),
    exifSubjectFields: field('EXIF subject fields', () => exifSubjectField(sources)),
  };
}

/**
 * Run one field's computation, converting any throw into a reported failure.
 *
 * The message is deliberately coarse. An EXIF parse error's text can embed source bytes, and this
 * module's whole job is to be a thing a user can trust, so a generic reason plus the field name is
 * what reaches the user. Callers that can say more precisely should surface it in their own UI.
 */
function field<T>(label: string, compute: () => SkeletonField<T>): SkeletonField<T> {
  try {
    return compute();
  } catch {
    return {
      label,
      status: 'unavailable',
      note: 'Could not be read from this file. The rest of the report is unaffected.',
    };
  }
}

/** Read the container header. Purely local and header-only — never decodes pixels. */
function inspectOnce(sources: SkeletonSources): ImageInspection {
  return inspectImageContainer(sources.bytes);
}

function dimensionField(
  sources: SkeletonSources,
): SkeletonField<{ readonly width: number; readonly height: number }> {
  const inspection = inspectOnce(sources);
  return {
    label: 'Dimensions',
    status: 'measured',
    value: { width: inspection.width, height: inspection.height },
    note: `${inspection.width} × ${inspection.height} pixels, stored in ${inspection.format.toUpperCase()}.`,
  };
}

function aspectRatioField(sources: SkeletonSources): SkeletonField<string> {
  const inspection = inspectOnce(sources);
  const { width, height } = inspection;
  // Reduce to a small-integer ratio where one exists (4:3, 16:9), else give the decimal. This is a
  // fact about the stored dimensions, not about how the image looks.
  const divisor = greatestCommonDivisor(width, height);
  const ratio = divisor > 1 ? `${width / divisor}:${height / divisor}` : `${width}:${height}`;
  const decimal = (width / height).toFixed(3).replace(/\.?0+$/, '');
  return {
    label: 'Aspect ratio',
    status: 'measured',
    value: ratio,
    note: `${ratio} (${decimal} wide). Measured from the stored pixel grid.`,
  };
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

/** Max pixels sampled for the palette. Bounded so a huge image cannot stall the main thread. */
const PALETTE_SAMPLE_PIXELS = 96_000;
/** Swatches reported. §4.9 asks for a dominant palette, not a full colour census. */
const PALETTE_SWATCH_COUNT = 6;

function paletteField(sources: SkeletonSources): SkeletonField<readonly PaletteSwatch[]> {
  const raster = sources.raster;
  if (raster === undefined) {
    return {
      label: 'Dominant palette',
      status: 'unavailable',
      note: 'Not computed: the image was not decoded locally, so there are no pixels to sample.',
    };
  }
  const sampled = paletteSourceOf(raster);
  const palette = extractPalette(sampled, 'kmeans', PALETTE_SWATCH_COUNT);
  const total = palette.entries.reduce((sum, entry) => sum + entry.population, 0);
  const swatches = palette.entries
    .map((entry) => ({
      hex: toHex(entry.r, entry.g, entry.b),
      rgb: { r: entry.r, g: entry.g, b: entry.b },
      share: total > 0 ? entry.population / total : 0,
    }))
    .sort((a, b) => b.share - a.share);

  return {
    label: 'Dominant palette',
    status: 'uncertain',
    value: swatches,
    note:
      `${swatches.length} dominant colours from a k-means fit over up to ${PALETTE_SAMPLE_PIXELS.toLocaleString('en-US')} sampled pixels. ` +
      'An approximate quantisation, not an exact colour count, and it says nothing about what the colours depict.',
  };
}

/**
 * Box-sample a frame down to roughly `budget` pixels by striding the source.
 *
 * A stride rather than a resize: no canvas, no second decode, and deterministic. `extractPalette`
 * ignores alpha, so fully transparent pixels would otherwise contribute colours the viewer cannot
 * see; they are dropped here instead.
 *
 * The fast path returns the input untouched — which does mean a malformed frame whose length does
 * not match its declared dimensions reaches `extractPalette` and throws there. That is deliberate:
 * the row is then reported `unavailable`, where silently returning `raster` would have let a bad
 * buffer through as if it were a real image.
 */
function downsampleForPalette(
  raster: RasterImage,
  data: Uint8ClampedArray,
  budget: number,
): RasterImage {
  const total = raster.width * raster.height;
  if (total <= budget && data.length === total * 4) return raster;

  const step = Math.max(1, Math.ceil(Math.sqrt(total / budget)));
  const outWidth = Math.max(1, Math.ceil(raster.width / step));
  const outHeight = Math.max(1, Math.ceil(raster.height / step));
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  let written = 0;
  for (let y = 0; y < raster.height; y += step) {
    for (let x = 0; x < raster.width; x += step) {
      const source = (y * raster.width + x) * 4;
      if (data[source + 3] === 0) continue; // transparent pixels carry an arbitrary colour
      out[written++] = data[source]!;
      out[written++] = data[source + 1]!;
      out[written++] = data[source + 2]!;
      out[written++] = data[source + 3]!;
    }
  }
  return {
    width: outWidth,
    height: outHeight,
    colorSpace: raster.colorSpace,
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data: out.subarray(0, written), durationMs: 0 }],
  };
}

/**
 * The source buffer for the palette, validated.
 *
 * A frame whose byte length disagrees with its declared dimensions is rejected outright. Both
 * otherwise-plausible paths hide this: the fast path would hand a short buffer straight to
 * `extractPalette`, and the strided path would read past the end into `undefined` and clamp those
 * to black — reporting a confident palette built from pixels that do not exist. Throwing here is
 * what turns a corrupt buffer into one honest `unavailable` row.
 */
function paletteSourceOf(raster: RasterImage): RasterImage {
  const frame = raster.frames[0]!;
  const total = raster.width * raster.height;
  if (frame.data.length !== total * 4) {
    throw new Error(
      `Palette sampling needs ${total * 4} bytes for a ${raster.width}×${raster.height} image, ` +
        `but the frame carries ${frame.data.length}.`,
    );
  }
  if (total <= PALETTE_SAMPLE_PIXELS) return raster;
  return downsampleForPalette(raster, frame.data, PALETTE_SAMPLE_PIXELS);
}

function toHex(r: number, g: number, b: number): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

function transparencyField(sources: SkeletonSources): SkeletonField<string> {
  const inspection = inspectOnce(sources);
  if (inspection.hasAlpha === null) {
    return {
      label: 'Transparency',
      status: 'unsupported',
      value: 'Not declared by this container',
      note:
        'This lossless WebP file has no chunk that declares an alpha channel, so whether it is ' +
        'transparent is genuinely not stated. It is not the same as “not transparent”.',
    };
  }
  if (inspection.hasAlpha) {
    return {
      label: 'Transparency',
      status: 'measured',
      value: 'Alpha channel present',
      note: 'The container declares an alpha channel. Whether any given pixel is transparent is not stated here.',
    };
  }
  return {
    label: 'Transparency',
    status: 'measured',
    value: 'Opaque',
    note: 'The container declares no alpha channel, so every pixel is fully opaque.',
  };
}

/** EXIF orientation values 5–8 rotate by 90°/270°, which swaps the displayed dimensions. */
const EXIF_ORIENTATION_LABELS: Readonly<Record<number, string>> = {
  1: 'Upright (no rotation recorded)',
  2: 'Mirrored horizontally',
  3: 'Rotated 180°',
  4: 'Mirrored vertically',
  5: 'Mirrored horizontally, then rotated 90° clockwise',
  6: 'Rotated 90° clockwise',
  7: 'Mirrored horizontally, then rotated 270° clockwise',
  8: 'Rotated 270° clockwise',
};

/**
 * Locate the TIFF block inside a JPEG's APP1/Exif segment.
 *
 * `readExifAllIfds` parses **raw TIFF bytes** — it reads `II`/`MM` at offset 0. A JPEG does not
 * begin with a TIFF header; it carries one inside an APP1 segment behind an `Exif\0\0` identifier.
 * Handing the whole file to the TIFF reader therefore always failed on JPEG, which is most
 * photographs on the internet and every camera export. This scanner is the fix: walk the marker
 * segments to the APP1 payload and return the TIFF bytes after its 6-byte identifier.
 *
 * Returns `undefined` when the file is not a JPEG, has no APP1, or the APP1 is not Exif — in which
 * case the caller falls back to parsing the file as a bare TIFF (which is what PNG's `eXIf` chunk
 * and a raw sidecar look like).
 */
function jpegExifBytes(bytes: Uint8Array): Uint8Array | undefined {
  // A TIFF header at offset 0 means this is already bare TIFF data.
  if (bytes.length >= 4 && bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a)
    return bytes;
  if (bytes.length >= 4 && bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00)
    return bytes;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;

  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset] !== 0xff) return undefined; // Not a marker: the segment walk lost sync.
    const marker = bytes[offset + 1]!;
    // Start of scan and end of image carry no length field.
    if (marker === 0xda || marker === 0xd9) return undefined;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length) return undefined;
    const payload = bytes.subarray(offset + 4, offset + 2 + length);
    if (
      marker === 0xe1 &&
      payload.length > 6 &&
      payload[0] === 0x45 &&
      payload[1] === 0x78 &&
      payload[2] === 0x69 &&
      payload[3] === 0x66 &&
      payload[4] === 0x00 &&
      payload[5] === 0x00
    ) {
      return payload.subarray(6);
    }
    // Standalone markers carry no length; skip the two fill bytes.
    if (marker >= 0xd0 && marker <= 0xd9) offset += 2;
    else offset += 2 + length;
  }
  return undefined;
}

/**
 * Every EXIF entry, or an empty list when the file carries no EXIF at all.
 *
 * Two distinct absence cases are absorbed, both normal rather than exceptional:
 *
 * - **No EXIF block at all** (most PNGs, most screenshots). `readExifAllIfds` throws
 *   "does not contain a TIFF header". Reporting that as a failed row would be backwards: absence
 *   is the commoner and less interesting answer, so it becomes an empty list.
 * - **Malformed EXIF after a header was found.** This still propagates, because it is a real
 *   defect in the file worth reporting as `unavailable` rather than as "declares none".
 */
function readExifEntries(bytes: ArrayBuffer | Uint8Array): readonly ExifDirectoryField[] {
  const asBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const tiff = jpegExifBytes(asBytes) ?? asBytes;
  try {
    return readExifAllIfds(tiff);
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('does not contain a TIFF header')) {
      return [];
    }
    throw cause;
  }
}

/**
 * Orientation, read from EXIF and reported separately from the pixel grid.
 *
 * Two things this row must not do: claim a *content* orientation (which way a subject faces is not
 * knowable from a tag), and silently disagree with a viewer. Hence the swapped-dimensions note for
 * tags 5–8.
 */
function orientationField(sources: SkeletonSources): SkeletonField<string> {
  const tag = findOrientationTag(sources.bytes);
  if (tag === undefined) {
    return {
      label: 'Orientation',
      status: 'measured',
      value: 'No orientation recorded',
      note:
        'No EXIF orientation tag is present, so the pixel grid is displayed as stored. This says nothing ' +
        'about which way the subject is facing.',
    };
  }
  const label = EXIF_ORIENTATION_LABELS[tag];
  if (label === undefined) {
    return {
      label: 'Orientation',
      status: 'uncertain',
      value: `Unrecognised EXIF orientation value ${tag}`,
      note: 'The tag is present but its value is not one this report recognises, so no rotation is claimed.',
    };
  }
  // 5–8 exchange width and height on display. Saying so prevents a reader comparing this report's
  // pixel dimensions against a viewer that has applied the tag and concluding one is wrong.
  const swaps = tag >= 5 && tag <= 8;
  return {
    label: 'Orientation',
    status: 'measured',
    value: label,
    note: swaps
      ? 'From the EXIF orientation tag. A viewer that applies this tag will display the image with its ' +
        'width and height swapped relative to the dimensions above.'
      : 'From the EXIF orientation tag; displayed dimensions match the stored pixel grid.',
  };
}

function findOrientationTag(bytes: ArrayBuffer | Uint8Array): number | undefined {
  for (const field of readExifEntries(bytes)) {
    if (field.tag === 0x0112) {
      const parsed = Number.parseInt(field.value.trim(), 10);
      if (Number.isInteger(parsed)) return parsed;
    }
  }
  return undefined;
}

function faceCountField(sources: SkeletonSources): SkeletonField<number> {
  const supplied = sources.faceCount;
  if (supplied === undefined) {
    return { label: 'Face count', status: 'unavailable', note: FACE_DETECTION_UNAVAILABLE_NOTE };
  }
  return {
    label: 'Face count',
    status: 'uncertain',
    value: supplied.count,
    note:
      supplied.note ??
      `A local detector found ${supplied.count} candidate face${supplied.count === 1 ? '' : 's'}. ` +
        'Candidates from an automated detector are not confirmed faces, and this is not a licence to describe anyone.',
  };
}

function embeddedTextField(sources: SkeletonSources): SkeletonField<string> {
  const supplied = sources.ocrText;
  if (supplied === undefined) {
    return { label: 'Embedded text', status: 'unavailable', note: OCR_UNAVAILABLE_NOTE };
  }
  const text = supplied.text.trim();
  if (text === '') {
    return {
      label: 'Embedded text',
      status: 'measured',
      value: '',
      note: `OCR ran (${supplied.model ?? 'local model'}) and found no text. An empty result is a measurement.`,
    };
  }
  const confidence =
    supplied.confidence === undefined
      ? ''
      : ` · mean confidence ${supplied.confidence.toFixed(0)}%`;
  return {
    label: 'Embedded text',
    status: 'uncertain',
    value: text,
    note:
      `Recognised locally by ${supplied.model ?? 'a local OCR model'}${confidence}. ` +
      'OCR misreads characters, so check anything you are about to quote.',
  };
}

/**
 * The EXIF/XMP tags that carry words a person wrote *about the subject*.
 *
 * §4.9 says "EXIF subject fields" specifically — these are free-text fields, distinct from the
 * technical tags (dimensions, timestamps, camera model) that §4.9 does not ask for. Tags absent
 * from a file are simply not listed; an empty list means the file declares none.
 */
const SUBJECT_TAG_NAMES: Readonly<Record<number, string>> = {
  0x010e: 'ImageDescription',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x9286: 'UserComment',
  0x9c9b: 'XPTitle',
  0x9c9c: 'XPComment',
  0x9c9d: 'XPSubject',
  0x9c9e: 'XPKeywords',
  0x9c9f: 'XPCreator',
};

/** The XP* range (0x9C9B–0x9C9F), which Windows writes as UTF-16LE inside an UNDEFINED tag. */
function isXpTag(tag: number): boolean {
  return tag >= 0x9c9b && tag <= 0x9c9f;
}

function exifSubjectField(sources: SkeletonSources): SkeletonField<readonly ExifSubjectField[]> {
  const tags = readExifEntries(sources.bytes);
  const seen = new Set<string>();
  const fields: ExifSubjectField[] = [];
  let anyTruncated = false;
  for (const tag of tags) {
    const name = SUBJECT_TAG_NAMES[tag.tag];
    // XP* tags are UTF-16LE inside an opaque type-7 tag; decode rather than show the raw hex.
    const decoded = isXpTag(tag.tag) ? decodeXpTagValue(tag) : undefined;
    const value = decoded?.text ?? cleanTagValue(tag.value);
    if (name === undefined || value === '' || seen.has(name)) continue;
    seen.add(name);
    if (decoded?.truncated === true) anyTruncated = true;
    fields.push({ name, value });
  }
  if (fields.length === 0) {
    return {
      label: 'EXIF subject fields',
      status: 'measured',
      value: [],
      note:
        'None present. The file declares no description, title, subject, keywords, comment, artist, or ' +
        'copyright field. That is a fact about the metadata, not about the picture.',
    };
  }
  return {
    label: 'EXIF subject fields',
    // A truncated value is not the whole field, so the row stops claiming to be a fact.
    status: anyTruncated ? 'uncertain' : 'measured',
    value: fields,
    note:
      `${fields.length} text field${fields.length === 1 ? '' : 's'} the file already carries. ` +
      (anyTruncated
        ? 'At least one is longer than this reader previews, so it is shown truncated. '
        : '') +
      'These were written by whatever made the file; they are not a description this app produced, ' +
      'so treat them as claims to check rather than as truth about the image.',
  };
}

/**
 * Drop the UTF-16LE BOM/NUL preamble XP tags carry, and collapse interior NUL runs.
 *
 * `readExifAllIfds` decodes XP* tag bytes as latin1, so a UTF-16LE value arrives as `X P ...` --
 * every ASCII character separated by a NUL. Rendering that raw would fill the UI with invisible
 * control characters, so the NULs are removed before the value is shown.
 *
 * Built with `new RegExp` rather than a literal: a raw NUL inside a regex literal is invisible in
 * review and is flagged by `no-control-regex`.
 */
const NUL_RUN = new RegExp(String.fromCharCode(0) + '+', 'gu');

/** EXIF type 7 (UNDEFINED) — what Windows writes for every XP* tag. */
const EXIF_TYPE_UNDEFINED = 7;

/**
 * Decode an XP* tag's bytes back into text.
 *
 * `readExifAllIfds` deliberately renders a type-7 tag opaquely — `"28 opaque bytes (61007500…)"`,
 * keeping at most the first 16 bytes — because a generic reader cannot know the tag holds UTF-16LE.
 * XP* tags always do, so the retained hex is decoded here.
 *
 * The 16-byte cap is a real limit of that reader, and it is reported rather than hidden: a value
 * longer than the preview decodes to a prefix, and {@link exifSubjectField} marks the row
 * `uncertain` when that happens. Showing "autumn l" as though it were the whole keyword list would be
 * exactly the kind of quiet truncation this report exists to avoid.
 */
interface DecodedXpValue {
  readonly text: string;
  /** True when the reader's 16-byte preview cut the value short. */
  readonly truncated: boolean;
}

function decodeXpTagValue(field: ExifDirectoryField): DecodedXpValue | undefined {
  if (field.type !== EXIF_TYPE_UNDEFINED) return undefined;
  const hex = /\(([0-9a-f]*)\)\s*$/u.exec(field.value)?.[1];
  if (hex === undefined || hex.length === 0 || hex.length % 4 !== 0) return undefined;

  const declaredBytes = /^(\d+) opaque bytes/u.exec(field.value)?.[1];
  const truncated =
    declaredBytes === undefined || Number.parseInt(declaredBytes, 10) * 2 > hex.length;

  // UTF-16LE pairs, dropping the trailing NUL terminator. An odd byte count means this was not
  // UTF-16 after all, so fall back rather than decoding nonsense.
  let text = '';
  for (let index = 0; index + 3 < hex.length; index += 4) {
    const low = Number.parseInt(hex.slice(index, index + 2), 16);
    const high = Number.parseInt(hex.slice(index + 2, index + 4), 16);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return undefined;
    text += String.fromCharCode(low | (high << 8));
  }
  return { text: text.replace(/\0+$/u, '').trim(), truncated };
}

function cleanTagValue(raw: string): string {
  return raw.replace(NUL_RUN, '').trim();
}

/** Every field, in §4.9's listed order. Used by the UI and by the tests. */
export const SKELETON_FIELD_ORDER: ReadonlyArray<keyof DescriptiveSkeleton> = [
  'dimensions',
  'aspectRatio',
  'dominantPalette',
  'transparency',
  'orientation',
  'faceCount',
  'embeddedText',
  'exifSubjectFields',
] as const;

/** Whether every field in the report is a measured fact. False whenever anything was hedged. */
export function skeletonIsFullyMeasured(skeleton: DescriptiveSkeleton): boolean {
  return SKELETON_FIELD_ORDER.every((key) => skeleton[key].status === 'measured');
}

/** The fields a reader should look at when a row is hedged — used for the summary line. */
export function skeletonHedgedFields(skeleton: DescriptiveSkeleton): readonly string[] {
  return SKELETON_FIELD_ORDER.filter((key) => skeleton[key].status !== 'measured').map(
    (key) => skeleton[key].label,
  );
}
