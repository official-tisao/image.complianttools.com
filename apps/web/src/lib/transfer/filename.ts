/**
 * P6-03 — the filename a processed result carries out of the app, used identically by the
 * download anchor, the clipboard write, and the drag-out `File`. README §11.5.
 *
 * Copy, drag, and download must agree on the name: a result that downloads as `photo.webp` and
 * drops into another app as `image` (or as the source's `.jpg`) is a bug users read as data loss.
 * So the name is computed once, from the source name plus the format actually produced, and
 * passed to all three.
 */

/**
 * Characters Windows and macOS both refuse or silently rewrite in a filename.
 *
 * Hyphen and underscore are deliberately absent: they are legal everywhere, and several tools in
 * this app already name results with them (`photo-crop.png`), so replacing them would silently
 * rename results the download flow has always produced.
 */
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/gu;
/** Control characters, including the NUL that a pasted or generated name can carry. */
const CONTROL_CHARS = /\p{Cc}/gu;

const REPLACEMENT = '-';

/**
 * Derive an output filename from the source name and the produced format.
 *
 * `extension` may be given with or without a leading dot. A source with no usable name — a pasted
 * image is often named `image.png`, and a drag from another app can carry none at all — falls back
 * to a neutral stem rather than to an empty or extension-only name.
 */
export function outputFilename(sourceName: string, extension: string): string {
  const stem = sanitiseFilename(stripExtension(sourceName)) || 'image';
  const suffix = sanitiseFilename(extension).replace(/^\.+/u, '');
  return suffix ? `${stem}.${suffix}` : stem;
}

/** The part of a filename before its final extension. */
export function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/u, '');
}

/**
 * Reduce a filename to something every target filesystem accepts.
 *
 * Leading dots are stripped as well: a result called `.hidden` downloads as an invisible file on
 * macOS, which is never what "Download" meant to the person who pressed it.
 */
export function sanitiseFilename(name: string): string {
  return name
    .replace(CONTROL_CHARS, '')
    .replace(ILLEGAL_FILENAME_CHARS, REPLACEMENT)
    .replace(/^\.+/u, '')
    .replace(/[. ]+$/u, '')
    .slice(0, 180);
}

/** The extension of a filename, lowercased and without the dot. Empty when there is none. */
export function fileExtension(name: string): string {
  const match = /\.([^.]+)$/u.exec(name);
  return match?.[1]?.toLowerCase() ?? '';
}
