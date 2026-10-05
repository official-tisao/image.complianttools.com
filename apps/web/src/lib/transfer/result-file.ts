/**
 * P6-03 — the one record of "what the current processed output actually is".
 *
 * ## The problem this solves
 *
 * Before this type, a tool that could download its result kept only an object URL and a guessed
 * filename. Three P6-03 features all need the same three facts — the bytes, the filename, and the
 * MIME type — and all three need to disappear together the moment the output stops being current:
 *
 * - a clipboard write needs `Blob` + MIME,
 * - a drag-out needs `File` (bytes + name + type),
 * - a download needs the name,
 *
 * and "current" means it was produced by the options and source now on screen. When the source or
 * the options change, the visible preview is still the old result until the new one lands, so the
 * old bytes must be marked `stale` immediately rather than staying copyable for the duration of a
 * reprocess — otherwise "Copy" hands the user a file that does not match what they are looking at.
 *
 * `PublishedResult` makes that one object, so staleness cannot be set in one place and forgotten in
 * another, and so a failed run has an obvious single place to clear it.
 */

import { outputFilename } from './filename.ts';

export interface PublishedResult {
  /** The processed bytes, as a `File` so the name and MIME type travel with the bytes. */
  readonly file: File;
  /**
   * True once the source or the options have changed and the preview on screen no longer matches
   * these bytes. A stale result is not copyable and not draggable; it stays rendered so the user
   * can still see what they were looking at while the new result is computed.
   */
  readonly stale: boolean;
}

/**
 * Publish a processed result.
 *
 * `extension` is the format actually encoded — not the format that was selected in the UI, which
 * is `'same'` for tools that keep the input format and would otherwise produce `photo.same`.
 */
export function publishResult(
  blob: Blob,
  options: { readonly sourceName: string; readonly extension: string },
): PublishedResult {
  return {
    file: new File([blob], outputFilename(options.sourceName, options.extension), {
      type: blob.type,
      lastModified: Date.now(),
    }),
    stale: false,
  };
}

/** Mark a published result as no longer describing what is on screen. */
export function markStale(result: PublishedResult): PublishedResult {
  return result.stale ? result : { ...result, stale: true };
}
