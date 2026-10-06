/**
 * P6-03 — drag a processed result out of the browser to the OS. README §11.5 ("Dragging the
 * result thumbnail out of the browser writes the processed file to the OS (`DataTransfer` with a
 * real `File`)").
 *
 * ## Why a real `File` and not the object URL
 *
 * `dataTransfer.setData('text/uri-list', objectUrl)` is the tempting one-liner, and it is wrong.
 * Most native drop targets — Photoshop's and Figma's canvases included — ignore a URL string and
 * wait for `dataTransfer.files`; a URL drag either drops a text link or is rejected outright, and
 * the user gets no file with no error either. A `File` is what a drop target consumes, so the
 * bytes, the name, and the MIME type all have to be real.
 *
 * ## Why the `File` is prepared before `dragstart`
 *
 * `dragstart` must set the transfer synchronously; a `dragstart` handler that awaits before
 * setting `dropEffect`/`items` loses the drag, because the browser has already moved on. So the
 * `File` is built when the result is published and kept, and `dragstart` only reads it.
 *
 * @see ./result-file.ts for the `PublishedResult` that owns these bytes.
 */

import type { PublishedResult } from './result-file.ts';

/** The subset of `DataTransfer` this module writes to. */
export interface DragTransferLike {
  setData(format: string, data: string): void;
  clearData?(format?: string): void;
  items?: {
    add(file: File, type?: string): void;
    clear?(): void;
  };
  dropEffect?: string;
  effectAllowed?: string;
}

/** Why a drag-out produced nothing. */
export type DragOutSkipReason =
  /** The result preview was re-rendered after a source or option change; its bytes are gone. */
  | 'stale'
  /** A new result is being processed, and the visible one is about to be replaced. */
  | 'busy'
  /** No result has been produced yet. */
  | 'no-result'
  /** The environment has no `DataTransfer` to write to (server render, or a stubbed event). */
  | 'no-transfer';

/** What a completed `dragstart` actually placed on the drag, for assertions and for the UI. */
export interface DragOutResult {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: number;
}

export type DragOutDecision =
  | { readonly action: 'skip'; readonly reason: DragOutSkipReason }
  | { readonly action: 'export'; readonly file: File; readonly result: DragOutResult };

export interface DragOutInput {
  readonly result: PublishedResult | null | undefined;
  readonly busy: boolean;
  readonly transfer: DragTransferLike | null | undefined;
}

/**
 * Build the `File` a drag-out should publish, or say why there is none.
 *
 * `busy` and `result === null` are the two states README's "prevent stale output" asks for: while a
 * reprocess is in flight, or after a run failed and cleared the result, the old bytes must not be
 * draggable, because dropping them would hand the user a file that no longer matches the preview.
 */
export function prepareDragOut(input: DragOutInput): DragOutDecision {
  if (input.busy) return { action: 'skip', reason: 'busy' };
  if (!input.result) return { action: 'skip', reason: 'no-result' };
  if (input.result.stale) return { action: 'skip', reason: 'stale' };
  if (!input.transfer) return { action: 'skip', reason: 'no-transfer' };
  return {
    action: 'export',
    file: input.result.file,
    result: {
      filename: input.result.file.name,
      mimeType: input.result.file.type,
      bytes: input.result.file.size,
    },
  };
}

/** Why a browser refused a drag-out, or hid the drag affordance before it began. */
export type DragOutFailure = 'no-file-items' | 'dragstart-threw' | 'unsupported';

/**
 * Put the result's real `File` on a `DataTransfer`.
 *
 * The `items.add(file)` call is the one that matters, and it is also the one that can fail: Firefox
 * only exposes `items` during a drag it considers valid, and some builds refuse `add` on a
 * transfer that has already been read. `setData('text/plain', ...)` still runs in that case so the
 * user sees *something* under the cursor rather than a cursor that refuses to drop — but the
 * `File` is what makes the drop actually deliver an image, so its failure is reported rather than
 * swallowed.
 */
export function writeFileToTransfer(
  transfer: DragTransferLike,
  file: File,
  fallbackText?: string,
): DragOutFailure | undefined {
  const label = fallbackText ?? file.name;
  try {
    if (transfer.items?.add) {
      // Clear before adding, not after: a transfer can already hold a payload, and leaving one
      // behind makes the drop ambiguous between the stale file and the real one.
      transfer.items.clear?.();
      transfer.items.add(file);
      // Some native targets read only `text/plain` even when they accept files; setting it costs
      // nothing and is what lets a non-file drop target show the filename rather than nothing.
      transfer.setData('text/plain', label);
      transfer.effectAllowed = 'copy';
      transfer.dropEffect = 'copy';
      return undefined;
    }
    transfer.setData('text/plain', label);
    transfer.dropEffect = 'copy';
    return 'no-file-items';
  } catch (cause) {
    void cause;
    return 'dragstart-threw';
  }
}
