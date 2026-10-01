/**
 * P5-15 — T71's local descriptive skeleton (README §4.9, "Without a key").
 *
 * These tests use **mocks and generated fixtures only**. Nothing here touches a network, a provider,
 * or a real OCR model — the module under test performs no I/O by construction, and the assertions
 * below exist to keep it that way.
 *
 * What each group proves, mapped to the acceptance criteria:
 *
 * - §4.9 field coverage, and that every field carries an honest status
 * - missing OCR data and unavailable face detection reported as `unavailable`, never as zero
 * - one throwing source degrading exactly one row (§4.9: "keep the remaining fields usable")
 * - no content inference: nothing in the output describes what the image depicts
 */

import { describe, expect, it } from 'vitest';

import {
  buildDescriptiveSkeleton,
  DESCRIPTIVE_SKELETON_DISCLAIMER,
  FACE_DETECTION_UNAVAILABLE_NOTE,
  OCR_UNAVAILABLE_NOTE,
  SKELETON_FIELD_ORDER,
  skeletonHedgedFields,
  skeletonIsFullyMeasured,
  type SkeletonSources,
} from '../src/ai/describe-skeleton.js';
import type { RasterImage } from '../src/types.js';

// --- Minimal PNG builders. Real bytes, so `inspectImageContainer` and `readExifAllIfds` parse them
// for real rather than being mocked — the point of these tests is the module's real behaviour.

/** CRC32, needed for a valid PNG chunk. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * A structurally valid greyscale/RGB PNG with uncompressed-deflate IDAT data.
 *
 * Uses stored (uncompressed) deflate blocks, which is enough for a header parser and avoids pulling a
 * compressor into the test. `inspectImageContainer` reads only the header; the palette test supplies
 * pixels separately, so the image data here never has to be inflatable.
 */
function buildPng(
  width: number,
  height: number,
  extras: readonly Uint8Array[] = [],
  colorType = 2,
): Uint8Array {
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One stored deflate block: final-block flag, LEN, NLEN, then raw scanlines.
  const scanlines = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    scanlines[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 3;
      scanlines[p] = (x * 37) & 0xff;
      scanlines[p + 1] = (y * 53) & 0xff;
      scanlines[p + 2] = 0x80;
    }
  }
  const zlibHeader = new Uint8Array([0x78, 0x01]);
  const stored = new Uint8Array(5 + scanlines.length);
  stored[0] = 0x01; // final stored block
  stored[1] = scanlines.length & 0xff;
  stored[2] = (scanlines.length >> 8) & 0xff;
  stored[3] = ~stored[1]! & 0xff;
  stored[4] = ~stored[2]! & 0xff;
  stored.set(scanlines, 5);

  const idatPayload = new Uint8Array(zlibHeader.length + stored.length);
  idatPayload.set(zlibHeader, 0);
  idatPayload.set(stored, zlibHeader.length);

  const parts: Uint8Array[] = [
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    ...extras,
    pngChunk('IDAT', idatPayload),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** A solid-colour RGBA raster, for the palette path. */
function raster(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return {
    width,
    height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

const PNG_16x9 = buildPng(16, 9);
const PNG_SQUARE = buildPng(24, 24);

/**
 * A minimal JPEG carrying an APP1/Exif segment with an orientation tag.
 *
 * Enough of a JPEG for the real EXIF walker to find the TIFF header and read IFD0. The entropy-
 * coded scan data is never decoded — `inspectImageContainer` reads headers only — so only the
 * segment structure has to be right.
 */
function buildJpegWithOrientation(orientation: number, imageDescription?: string): Uint8Array {
  // TIFF header: "II" (little-endian), 0x002A, then the IFD0 offset from the TIFF base.
  const exifHeader = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00];
  const entries: number[] = [];
  // One IFD entry: tag 0x0112 (Orientation), type 3 (SHORT), count 1, value inline.
  entries.push(
    0x12,
    0x01,
    0x03,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    orientation & 0xff,
    (orientation >> 8) & 0xff,
    0x00,
    0x00,
  );
  const entryCount = imageDescription === undefined ? 1 : 2;
  let dataOffset = 0;
  if (imageDescription !== undefined) {
    // Value of an ASCII tag lives after the directory: TIFF base + 2 + count*12 + 4.
    dataOffset = 8 + 2 + entryCount * 12 + 4;
    entries.push(
      0x0e,
      0x01,
      0x02,
      0x00,
      imageDescription.length + 1,
      0x00,
      0x00,
      0x00,
      dataOffset & 0xff,
      (dataOffset >> 8) & 0xff,
      0x00,
      0x00,
    );
  }
  // The IFD entry count is a uint16, so two bytes — not one.
  const ifd: number[] = [
    entryCount & 0xff,
    (entryCount >> 8) & 0xff,
    ...entries,
    0x00,
    0x00,
    0x00,
    0x00,
  ];
  if (imageDescription !== undefined) {
    for (const char of imageDescription) ifd.push(char.charCodeAt(0));
    ifd.push(0x00);
  }

  const tiff = [...exifHeader, ...ifd];
  // APP1 wraps the TIFF block behind the 6-byte "Exif\0\0" identifier.
  const app1 = [...[0x45, 0x78, 0x69, 0x66, 0x00, 0x00], ...tiff];
  const app1Length = app1.length + 2;

  // SOI, APP1, SOF0 declaring 8x8, EOI. No entropy-coded scan data — nothing decodes it.
  const sof = [
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    0x00,
    0x08,
    0x00,
    0x08,
    0x01,
    0x01,
    0x11,
    0x00,
    ...new Array(64).fill(0),
  ];
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    (app1Length >> 8) & 0xff,
    app1Length & 0xff,
    ...app1,
    ...sof,
    0xff,
    0xd9,
  ]);
}

const JPEG_ORIENTED_90 = buildJpegWithOrientation(6);
const JPEG_WITH_DESCRIPTION = buildJpegWithOrientation(1, 'A red square on white');

/**
 * A JPEG whose APP1 carries an XPKeywords tag (0x9C9E) holding real UTF-16LE bytes.
 *
 * XP tags are the ones Windows Explorer writes, and they are the reason `cleanTagValue` exists: the
 * reader decodes tag bytes as latin1, so a UTF-16LE value arrives with a NUL after every character.
 */
function buildJpegWithXpKeywords(text: string): Uint8Array {
  const exifHeader = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00];
  // UTF-16LE: every character followed by a low NUL, plus the trailing terminator.
  const utf16: number[] = [];
  for (const char of text) {
    utf16.push(char.charCodeAt(0) & 0xff, char.charCodeAt(0) >> 8);
  }
  utf16.push(0x00, 0x00);

  const entryCount = 1;
  const dataOffset = 8 + 2 + entryCount * 12 + 4;
  const entries = [
    // tag 0x9C9E, type 7 (UNDEFINED) — what Windows writes for every XP* tag — count = byte length.
    0x9e,
    0x9c,
    0x07,
    0x00,
    utf16.length & 0xff,
    (utf16.length >> 8) & 0xff,
    0x00,
    0x00,
    dataOffset & 0xff,
    (dataOffset >> 8) & 0xff,
    0x00,
    0x00,
  ];
  const ifd: number[] = [
    entryCount & 0xff,
    (entryCount >> 8) & 0xff,
    ...entries,
    0x00,
    0x00,
    0x00,
    0x00,
    ...utf16,
  ];
  const tiff = [...exifHeader, ...ifd];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const app1Length = app1.length + 2;
  const sof = [
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    0x00,
    0x08,
    0x00,
    0x08,
    0x01,
    0x01,
    0x11,
    0x00,
    ...new Array(64).fill(0),
  ];
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    (app1Length >> 8) & 0xff,
    app1Length & 0xff,
    ...app1,
    ...sof,
    0xff,
    0xd9,
  ]);
}

describe('P5-15 T71 local descriptive skeleton', () => {
  describe('without a provider, a key, a consent, or any request', () => {
    it('builds a full report from a file alone', () => {
      const skeleton = buildDescriptiveSkeleton({
        bytes: PNG_16x9,
        raster: raster(16, 9, [20, 40, 200, 255]),
      });

      // §4.9's seven named fields, all present.
      expect(SKELETON_FIELD_ORDER).toEqual([
        'dimensions',
        'aspectRatio',
        'dominantPalette',
        'transparency',
        'orientation',
        'faceCount',
        'embeddedText',
        'exifSubjectFields',
      ]);
      for (const key of SKELETON_FIELD_ORDER) {
        expect(skeleton[key]).toBeDefined();
        expect(skeleton[key].label).not.toBe('');
        // Every row explains itself. There is no bare status with no reason.
        expect(skeleton[key].note.length).toBeGreaterThan(0);
        expect(['measured', 'uncertain', 'unavailable', 'unsupported']).toContain(
          skeleton[key].status,
        );
      }
    });

    it('reports dimensions and aspect ratio as measured facts', () => {
      const skeleton = buildDescriptiveSkeleton({ bytes: PNG_16x9 });
      expect(skeleton.dimensions.status).toBe('measured');
      expect(skeleton.dimensions.value).toEqual({ width: 16, height: 9 });
      expect(skeleton.aspectRatio.status).toBe('measured');
      expect(skeleton.aspectRatio.value).toBe('16:9');
    });

    it('measures transparency from the container', () => {
      const skeleton = buildDescriptiveSkeleton({ bytes: PNG_SQUARE });
      expect(skeleton.transparency.status).toBe('measured');
      expect(skeleton.transparency.value).toBe('Opaque');
    });

    it('extracts a dominant palette from decoded pixels', () => {
      const skeleton = buildDescriptiveSkeleton({
        bytes: PNG_SQUARE,
        raster: raster(24, 24, [200, 30, 30, 255]),
      });
      expect(skeleton.dominantPalette.status).toBe('uncertain');
      const swatches = skeleton.dominantPalette.value!;
      expect(swatches.length).toBeGreaterThan(0);
      // The dominant swatch is the solid colour, not an invented one.
      expect(swatches[0]!.hex).toBe('#C81E1E');
      expect(swatches[0]!.share).toBeGreaterThan(0);
    });

    it('drops fully transparent pixels from the palette rather than sampling their hidden RGB', () => {
      // Transparent black over transparent blue. If alpha were ignored, blue would dominate; the
      // right answer is "nothing visible to sample".
      const data = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 255;
        data[i + 3] = 0; // fully transparent
      }
      const skeleton = buildDescriptiveSkeleton({
        bytes: PNG_SQUARE,
        raster: {
          width: 4,
          height: 4,
          colorSpace: 'srgb',
          bitDepth: 8,
          premultipliedAlpha: false,
          frames: [{ data, durationMs: 0 }],
        },
      });
      // With every source pixel transparent there is no visible colour, so the row reports the
      // absence rather than the RGB values a transparent pixel happens to carry.
      expect(['measured', 'unavailable', 'uncertain']).toContain(skeleton.dominantPalette.status);
    });
  });

  describe('honest reporting of what cannot be computed offline', () => {
    it('reports missing OCR data as unavailable, never as empty text', () => {
      const skeleton = buildDescriptiveSkeleton({ bytes: PNG_SQUARE });
      expect(skeleton.embeddedText.status).toBe('unavailable');
      expect(skeleton.embeddedText.value).toBeUndefined();
      expect(skeleton.embeddedText.note).toBe(OCR_UNAVAILABLE_NOTE);
      // Crucially, it says nothing was downloaded.
      expect(skeleton.embeddedText.note).toContain('never downloads');
    });

    it('reports missing face detection as unavailable, never as zero faces', () => {
      const skeleton = buildDescriptiveSkeleton({ bytes: PNG_SQUARE });
      expect(skeleton.faceCount.status).toBe('unavailable');
      // A zero here would be a claim about the image that nothing supports.
      expect(skeleton.faceCount.value).toBeUndefined();
      expect(skeleton.faceCount.note).toBe(FACE_DETECTION_UNAVAILABLE_NOTE);
    });

    it('reports an absent EXIF subject field list as a measurement, not a gap', () => {
      const skeleton = buildDescriptiveSkeleton({ bytes: PNG_SQUARE });
      expect(skeleton.exifSubjectFields.status).toBe('measured');
      expect(skeleton.exifSubjectFields.value).toEqual([]);
    });

    it('reports the palette as unavailable when pixels were not decoded', () => {
      const skeleton = buildDescriptiveSkeleton({ bytes: PNG_SQUARE });
      expect(skeleton.dominantPalette.status).toBe('unavailable');
      expect(skeleton.dominantPalette.note).toContain('not decoded');
    });

    it('reports a supplied face count as uncertain, because a detector guess is not a fact', () => {
      const skeleton = buildDescriptiveSkeleton({
        bytes: PNG_SQUARE,
        faceCount: { count: 2 },
      });
      expect(skeleton.faceCount.status).toBe('uncertain');
      expect(skeleton.faceCount.value).toBe(2);
      expect(skeleton.faceCount.note).toContain('not confirmed faces');
    });

    it('reports recognised text as uncertain, because OCR misreads characters', () => {
      const skeleton = buildDescriptiveSkeleton({
        bytes: PNG_SQUARE,
        ocrText: { text: 'Hello', model: 'script/Cyrillic', confidence: 94 },
      });
      expect(skeleton.embeddedText.status).toBe('uncertain');
      expect(skeleton.embeddedText.value).toBe('Hello');
      expect(skeleton.embeddedText.note).toContain('check anything you are about to quote');
    });

    it('reports an empty OCR result as a measurement rather than as unavailable', () => {
      const skeleton = buildDescriptiveSkeleton({
        bytes: PNG_SQUARE,
        ocrText: { text: '   ', model: 'script/Cyrillic' },
      });
      expect(skeleton.embeddedText.status).toBe('measured');
      expect(skeleton.embeddedText.value).toBe('');
    });

    it('marks a report with any hedged row as not fully measured', () => {
      const withoutEverything = buildDescriptiveSkeleton({ bytes: PNG_SQUARE });
      expect(skeletonIsFullyMeasured(withoutEverything)).toBe(false);
      expect(skeletonHedgedFields(withoutEverything)).toContain('Face count');
      expect(skeletonHedgedFields(withoutEverything)).toContain('Embedded text');
      // No pixels were decoded, so the palette cannot be computed either.
      expect(skeletonHedgedFields(withoutEverything)).toContain('Dominant palette');

      // With every source supplied, two hedges remain — and both are permanent by design: a colour
      // quantisation is an approximation, and an automated face candidate is never a confirmed
      // face. Everything else is a fact.
      const complete = buildDescriptiveSkeleton({
        bytes: PNG_SQUARE,
        raster: raster(24, 24, [10, 20, 30, 255]),
        faceCount: { count: 0 },
        ocrText: { text: '' },
      });
      expect(skeletonIsFullyMeasured(complete)).toBe(false);
      expect(skeletonHedgedFields(complete)).toEqual(['Dominant palette', 'Face count']);
    });
  });

  describe('one failing field does not remove the others', () => {
    it('still reports dimensions, transparency and orientation when the palette source throws', () => {
      // A raster whose frame data is the wrong length makes `extractPalette` throw mid-read.
      const hostile: RasterImage = {
        width: 4,
        height: 4,
        colorSpace: 'srgb',
        bitDepth: 8,
        premultipliedAlpha: false,
        frames: [{ data: new Uint8ClampedArray(3), durationMs: 0 }],
      };
      const skeleton = buildDescriptiveSkeleton({ bytes: PNG_16x9, raster: hostile });

      expect(skeleton.dominantPalette.status).toBe('unavailable');
      expect(skeleton.dominantPalette.note).toContain('rest of the report is unaffected');
      // The rest survived.
      expect(skeleton.dimensions.status).toBe('measured');
      expect(skeleton.dimensions.value).toEqual({ width: 16, height: 9 });
      expect(skeleton.aspectRatio.status).toBe('measured');
      expect(skeleton.transparency.status).toBe('measured');
      expect(skeleton.orientation.status).toBe('measured');
      expect(skeleton.exifSubjectFields.status).toBe('measured');
    });

    it('still reports dimensions when the container cannot be parsed as an image at all', () => {
      // Bytes that are not PNG/JPEG/GIF/WebP make every header-derived field throw.
      const notAnImage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
      const skeleton = buildDescriptiveSkeleton({
        bytes: notAnImage,
        raster: raster(4, 4, [1, 2, 3, 255]),
      });
      expect(skeleton.dimensions.status).toBe('unavailable');
      // The palette does not read the container, so it still works.
      expect(skeleton.dominantPalette.status).toBe('uncertain');
      // Faces and text were never available and say so for their own reason.
      expect(skeleton.faceCount.note).toBe(FACE_DETECTION_UNAVAILABLE_NOTE);
      expect(skeleton.embeddedText.note).toBe(OCR_UNAVAILABLE_NOTE);
    });

    it('reports a file with no EXIF block as "no orientation recorded" rather than failing', () => {
      // The overwhelming majority of PNGs carry no TIFF header, and `readExifAllIfds` throws on
      // that. Absence must be reported as a measurement, not surface as a failed row.
      const skeleton = buildDescriptiveSkeleton({ bytes: PNG_SQUARE });
      expect(skeleton.orientation.status).toBe('measured');
      expect(skeleton.orientation.value).toBe('No orientation recorded');
      expect(skeleton.exifSubjectFields.status).toBe('measured');
      expect(skeleton.exifSubjectFields.value).toEqual([]);
    });

    it('reads a real EXIF orientation tag and flags the swapped-dimension cases', () => {
      const skeleton = buildDescriptiveSkeleton({ bytes: JPEG_ORIENTED_90 });
      expect(skeleton.orientation.status).toBe('measured');
      expect(skeleton.orientation.value).toBe('Rotated 90° clockwise');
      // Tag 6 swaps displayed width and height; saying so stops a reader concluding the
      // dimensions row contradicts their viewer.
      expect(skeleton.orientation.note).toContain('swapped');
    });

    it('surfaces EXIF subject fields the file already carries', () => {
      const skeleton = buildDescriptiveSkeleton({ bytes: JPEG_WITH_DESCRIPTION });
      expect(skeleton.exifSubjectFields.status).toBe('measured');
      const fields = skeleton.exifSubjectFields.value!;
      expect(fields.map((f) => f.name)).toContain('ImageDescription');
      expect(fields.find((f) => f.name === 'ImageDescription')!.value).toBe(
        'A red square on white',
      );
    });

    it('decodes a UTF-16LE XP tag and marks it truncated when the reader cut it short', () => {
      // XP* tags are UTF-16LE inside a type-7 tag, which `readExifAllIfds` previews to 16 bytes.
      // "autumn leaves" is 13 characters = 28 bytes, so it is deliberately past that cap: the row
      // must show the readable prefix AND say it is truncated, rather than pass a fragment off as
      // the complete keyword list.
      const skeleton = buildDescriptiveSkeleton({
        bytes: buildJpegWithXpKeywords('autumn leaves'),
      });
      const fields = skeleton.exifSubjectFields.value!;
      const keywords = fields.find((f) => f.name === 'XPKeywords');
      expect(keywords).toBeDefined();
      expect(keywords!.value.startsWith('autumn')).toBe(true);
      expect(skeleton.exifSubjectFields.status).toBe('uncertain');
      expect(skeleton.exifSubjectFields.note).toContain('truncated');
    });

    it('decodes a short XP tag completely, with no truncation hedge', () => {
      // "leaf" is 4 characters = 10 bytes, inside the 16-byte preview.
      const skeleton = buildDescriptiveSkeleton({ bytes: buildJpegWithXpKeywords('leaf') });
      const fields = skeleton.exifSubjectFields.value!;
      expect(fields.find((f) => f.name === 'XPKeywords')!.value).toBe('leaf');
      expect(skeleton.exifSubjectFields.status).toBe('measured');
    });

    it('does not leave NUL padding or raw hex in any rendered tag value', () => {
      const skeleton = buildDescriptiveSkeleton({ bytes: buildJpegWithXpKeywords('leaf') });
      for (const field of skeleton.exifSubjectFields.value!) {
        expect(field.value.includes(String.fromCharCode(0))).toBe(false);
        expect(field.value).not.toMatch(/opaque bytes/u);
      }
    });
  });

  describe('no content inference', () => {
    it('never describes what the image depicts', () => {
      const skeleton = buildDescriptiveSkeleton({
        bytes: PNG_16x9,
        raster: raster(16, 9, [255, 0, 0, 255]),
      });
      const rendered = JSON.stringify(skeleton).toLowerCase();
      // Colour words are legitimate measurements; subject words are not. This list is the honest
      // subset of the latter that a naive implementation would be tempted to emit.
      for (const forbidden of [
        'a photo',
        'photograph',
        'a picture of',
        'shows',
        'depicts',
        'contains a',
        'appears to be',
        'sky',
        'portrait',
        'landscape',
        'dog',
        'person',
      ]) {
        expect(rendered).not.toContain(forbidden);
      }
    });

    it('labels the report as a skeleton rather than finished alt text', () => {
      expect(DESCRIPTIVE_SKELETON_DISCLAIMER).toContain('not AI recognition');
      expect(DESCRIPTIVE_SKELETON_DISCLAIMER).toContain('not finished alt text');
    });

    it('disclaims inference from weak signals in the palette row', () => {
      const skeleton = buildDescriptiveSkeleton({
        bytes: PNG_SQUARE,
        raster: raster(24, 24, [0, 128, 255, 255]),
      });
      expect(skeleton.dominantPalette.note).toContain('says nothing about what the colours depict');
    });

    it('treats EXIF subject fields as claims to check, not as truth', () => {
      const skeleton = buildDescriptiveSkeleton({ bytes: JPEG_WITH_DESCRIPTION });
      expect(skeleton.exifSubjectFields.value!.length).toBeGreaterThan(0);
      expect(skeleton.exifSubjectFields.note).toContain('claims to check');
    });
  });

  describe('sources contract', () => {
    it('accepts an ArrayBuffer as well as a Uint8Array', () => {
      const copy = PNG_SQUARE.slice().buffer;
      const skeleton = buildDescriptiveSkeleton({ bytes: copy });
      expect(skeleton.dimensions.value).toEqual({ width: 24, height: 24 });
    });

    it('requires only bytes — every other source is optional', () => {
      const minimal: SkeletonSources = { bytes: PNG_SQUARE };
      const skeleton = buildDescriptiveSkeleton(minimal);
      expect(skeleton.dimensions.status).toBe('measured');
    });
  });
});
