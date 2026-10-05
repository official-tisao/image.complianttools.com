/**
 * P6-03 — paste an image into any image tool from any focus position. README §11.5 ("Paste
 * anywhere"), §7.2 (Clipboard API, fallback "drag-drop only"). PLAN.md P6-03.
 *
 * ## Why the routing decision is separated from the DOM listener
 *
 * The one thing that must never go wrong here is *over*-reaching: a paste handler that calls
 * `preventDefault()` unconditionally swallows text pastes into text fields, which is a data-loss
 * bug rather than a missing feature. So `routePaste()` below is a pure function over a minimal
 * structural description of the event, with no DOM globals of its own — it can be exercised
 * exhaustively in `apps/web/test/p6-03-transfer.test.ts` with plain objects, and
 * {@link installPasteImage} is the thin listener that applies its verdict.
 *
 * ## The rule
 *
 * An image on the clipboard is always ours to handle — including when a text field has focus,
 * because pasting an image into a text field has no native meaning to preserve. Everything else
 * (plain text, rich text, an empty clipboard, a non-image file) is not ours: the listener returns
 * without calling `preventDefault()`, so the browser's own paste proceeds untouched and normal
 * editing behaviour is preserved.
 */

/** The subset of `DataTransferItem` this module reads. Structural so tests can fake it. */
export interface ClipboardItemLike {
  readonly kind: string;
  readonly type: string;
  getAsFile(): File | null;
}

/** The subset of `DataTransfer` this module reads. */
export interface ClipboardDataLike {
  readonly items?: ArrayLike<ClipboardItemLike> | undefined;
  readonly files?: ArrayLike<File> | undefined;
}

/** The subset of `ClipboardEvent` this module reads. */
export interface PasteEventLike {
  readonly clipboardData?: ClipboardDataLike | null | undefined;
  readonly defaultPrevented?: boolean | undefined;
}

/** Why a paste was left to the browser. Reported so tests can assert the negative case. */
export type PasteIgnoreReason =
  /** Something downstream already consumed the event; adding a second handler would double-handle. */
  | 'already-handled'
  /** No clipboard payload at all — an empty clipboard, or a synthetic event built without one. */
  | 'no-clipboard-data'
  /** Text, rich text, or a non-image file. Ordinary editing behaviour applies. */
  | 'no-image';

export type PasteDecision =
  | { readonly action: 'ignore'; readonly reason: PasteIgnoreReason }
  | { readonly action: 'ingest'; readonly files: readonly File[] };

/**
 * Collect the image files a clipboard payload carries.
 *
 * Reads `items` first, which is where a pasted screenshot or copied image arrives. Falls back to
 * `files` for the case where a clipboard exposes its payload without items — reading both is what
 * makes paste work across the three browsers this project ships on rather than only the one whose
 * implementation we happened to test.
 *
 * `getAsFile()` returns `null` for items the browser will not materialise (a directory entry, or an
 * item whose blob has already been revoked), and some implementations throw instead. Both mean
 * "this item is not an image we can ingest", so neither may escape as an uncaught error.
 */
export function readClipboardImages(data: ClipboardDataLike | null | undefined): readonly File[] {
  if (!data) return [];
  const files: File[] = [];
  const items = data.items;
  if (items) {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item || item.kind !== 'file' || !item.type.startsWith('image/')) continue;
      let file: File | null = null;
      try {
        file = item.getAsFile();
      } catch {
        file = null;
      }
      if (file) files.push(file);
    }
  }
  if (files.length === 0 && data.files) {
    for (let index = 0; index < data.files.length; index += 1) {
      const file = data.files[index];
      if (file && file.type.startsWith('image/')) files.push(file);
    }
  }
  return files;
}

/**
 * Decide whether a paste belongs to this tool, and with what files.
 *
 * See the module comment for the rule. Returning `ignore` is the safe default: the listener does
 * nothing at all, so the browser's own behaviour is what the user experiences.
 */
export function routePaste(event: PasteEventLike): PasteDecision {
  if (event.defaultPrevented === true) return { action: 'ignore', reason: 'already-handled' };
  const clipboardData = event.clipboardData;
  if (!clipboardData) return { action: 'ignore', reason: 'no-clipboard-data' };
  const files = readClipboardImages(clipboardData);
  return files.length > 0 ? { action: 'ingest', files } : { action: 'ignore', reason: 'no-image' };
}

/** Whether an event target is a field the user types into. */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== 'string') return false;
  const tag = element.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (element as HTMLInputElement).type;
    // A file input is not a text field; its value is set by the user agent, never typed into.
    return type !== 'file' && type !== 'checkbox' && type !== 'radio';
  }
  return element.isContentEditable === true;
}

export interface PasteImageListenerOptions {
  /**
   * Receives the pasted images. Callers pass this to the tool's own ingestion path so pasted
   * files are validated exactly as chosen ones are.
   */
  readonly onFiles: (files: readonly File[]) => void;
  /** Defaults to `window`, which is what "from any focus position" requires. */
  readonly eventTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | undefined;
}

/**
 * Listen for a pasted image anywhere in the page and route it to `onFiles`.
 *
 * The listener lives on `window` rather than on a component, because README §11.5 asks for the
 * paste to work "from any focus position" — including while focus sits in the options panel, on a
 * heading, or on the page body. Returns the cleanup function, for `onDestroy`.
 */
export function installPasteImage(options: PasteImageListenerOptions): () => void {
  const eventTarget = options.eventTarget ?? (globalThis as unknown as EventTarget);
  const handler = (event: Event): void => {
    const decision = routePaste(event as unknown as PasteEventLike);
    // Ignore means we do not touch the event at all: no preventDefault, no stopPropagation, so a
    // text paste into a text field keeps the caret position and undo stack the browser expects.
    if (decision.action === 'ignore') return;
    event.preventDefault();
    options.onFiles(decision.files);
  };
  eventTarget.addEventListener('paste', handler);
  return () => eventTarget.removeEventListener('paste', handler);
}
