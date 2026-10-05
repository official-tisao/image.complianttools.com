/**
 * P6-03 — copy a processed result to the clipboard as a real image. README §11.5 ("copy result as
 * `ClipboardItem`"), §7.2 (Clipboard API `write` with `ClipboardItem`, fallback "drag-drop only").
 * PLAN.md P6-03.
 *
 * ## Why the fallback is a download and not an error
 *
 * `navigator.clipboard.write` with an image `ClipboardItem` is supported by the current Chromium
 * and Safari, and refused by Firefox for image MIME types (it accepts `text/plain` only), and can
 * be refused anywhere when the document is not focused or permission is denied. README §7.2 names
 * the fallback as drag-drop, so a refusal here offers the download the user would have pressed
 * next and says which it did — a "Copy failed" dead end would tell a Firefox user that a feature
 * their browser does not have is broken, when the honest message is "this browser cannot put an
 * image on the clipboard, so the file was downloaded instead".
 *
 * ## What a mock can and cannot prove
 *
 * A stand-in for `navigator.clipboard.write` proves that *our* code constructs the right
 * `ClipboardItem`, with the right MIME type and the result's real bytes, and that it handles
 * refusal and absence. It proves nothing about what any operating system pastes into Photoshop.
 * The E2E spec for this module says so in its own header, and the PLAN's macOS/Windows
 * Photoshop/Figma criterion is left explicitly unverified rather than implied by a green run.
 */

/** A clipboard payload, described structurally so the browser types can be absent. */
export interface ClipboardEnvironment {
  readonly clipboard?: {
    write(items: readonly ClipboardItemLike[]): Promise<void>;
    writeText?(text: string): Promise<void>;
  };
  readonly ClipboardItemCtor?: new (items: Record<string, Blob>) => ClipboardItemLike;
}

export interface ClipboardItemLike {
  readonly types: readonly string[];
  getType(type: string): Promise<Blob>;
}

/** What the copy button should report. `downloaded` is the fallback path, not a failure. */
export type CopyOutcome = 'copied' | 'downloaded' | 'unavailable';

/** Why an image clipboard write was refused — the class, not the browser's message. */
export type CopyFailure = 'unavailable' | 'rejected';

/** The structured result, so callers render a message and tests assert a class. */
export interface CopyResult {
  readonly outcome: CopyOutcome;
  readonly failure?: CopyFailure;
  readonly error?: unknown;
}

/**
 * The capability probe behind "hide or disable the copy button".
 *
 * Read at call time rather than module load: the app is prerendered, so a probe evaluated while
 * the module is imported would capture the *build* environment — `undefined` for everything —
 * and the button would be permanently disabled on the deployed site.
 */
export function supportsImageClipboard(
  environment: ClipboardEnvironment | undefined = globalThis as ClipboardEnvironment,
): boolean {
  return (
    typeof environment?.clipboard?.write === 'function' &&
    typeof environment?.ClipboardItemCtor === 'function'
  );
}

/**
 * Put an image on the clipboard as a `ClipboardItem`.
 *
 * Resolves — never rejects — so a caller cannot leave a button spinning on a denial. The caller
 * decides what to do with `downloaded`: {@link copyImageToClipboard} performs the fallback; a
 * caller that wants none simply renders the outcome.
 */
export async function writeImageToClipboard(
  blob: Blob,
  environment: ClipboardEnvironment | undefined = globalThis as ClipboardEnvironment,
): Promise<CopyResult> {
  const Item = environment?.ClipboardItemCtor;
  if (typeof environment?.clipboard?.write !== 'function' || typeof Item !== 'function')
    return { outcome: 'unavailable', failure: 'unavailable' };
  try {
    // The MIME type comes from the blob the processor produced, not from a guessed format: a PNG
    // mislabelled as JPEG pastes into Photoshop as a broken file.
    await environment.clipboard.write([new Item({ [blob.type]: blob })]);
    return { outcome: 'copied' };
  } catch (cause) {
    return { outcome: 'unavailable', failure: 'rejected', error: cause };
  }
}

/** Trigger an anchor download — the README §7.2 fallback for an unavailable clipboard write. */
export function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    // The click has been dispatched synchronously, so the URL can go back immediately; this
    // mirrors what `T74FolderWatcher.svelte` already does for its own fallback path.
    URL.revokeObjectURL(url);
  }
}

/**
 * Copy a result to the clipboard, falling back to a download when the browser refuses.
 *
 * This is the whole user-facing behaviour of the copy button in one call, so every tool gets the
 * same honest outcome rather than each inventing its own.
 *
 * `fallback` is injectable so the fallback path can be asserted in a DOM-less test and so a host
 * that supplies its own save flow (T74's `showSaveFilePicker`) can reuse the clipboard decision
 * without inheriting an anchor download. It defaults to {@link anchorDownload}.
 */
export async function copyImageToClipboard(
  blob: Blob,
  filename: string,
  environment: ClipboardEnvironment | undefined = globalThis as ClipboardEnvironment,
  fallback: (blob: Blob, filename: string) => void = anchorDownload,
): Promise<CopyResult> {
  const result = await writeImageToClipboard(blob, environment);
  if (result.outcome === 'copied') return result;
  fallback(blob, filename);
  return { ...result, outcome: 'downloaded' };
}
