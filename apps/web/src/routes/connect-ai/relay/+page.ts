/**
 * P5-14 — `/connect-ai/$p` ships as static HTML with no client JavaScript.
 *
 * This page is a document: a reader arrives from a search, reads it, copies a command or a fact,
 * and leaves. Nothing on it is interactive, so hydrating it would ship a framework bundle for
 * markup that is already complete — and `csr = false` takes the page to zero bytes of JavaScript
 * against a 45 kB route budget.
 */
export const csr = false;
