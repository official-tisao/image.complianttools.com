/**
 * P6-03 — the Svelte action form of {@link installPasteImage}.
 *
 * `use:pasteImage={onFiles}` reads better than an `onMount`/`onDestroy` pair in every one of the
 * dozen-odd tool components that need it, and it cannot leak a listener when a component is
 * destroyed without its cleanup running.
 *
 * The listener is attached to `window`, not to the element the action is placed on. README §11.5
 * requires the paste to work "from any focus position" — while focus is in an options field, on the
 * page heading, on the body, or nowhere at all. An element-scoped listener would only work when
 * that element held focus, which is the bug this action exists to avoid.
 */

import { installPasteImage } from './paste.ts';

/**
 * Svelte action: attaches on mount, removes the listener on destroy.
 *
 * The return value is `{ destroy }`, not the teardown function itself. Svelte 5 types an action as
 * returning `void | ActionReturn`, and a bare `() => void` is rejected at compile time — the
 * shorthand Svelte 4 accepted is no longer part of the contract.
 */
export function pasteImage(node: HTMLElement, onFiles: (files: readonly File[]) => void) {
  // `node` is the caller's element, but the listener deliberately targets the window; taking the
  // parameter keeps the action signature idiomatic and lets a future caller scope it if needed.
  void node;
  const dispose = installPasteImage({ onFiles });
  return { destroy: dispose };
}
