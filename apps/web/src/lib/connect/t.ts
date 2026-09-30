/**
 * P5-14 — string lookup for the `/connect-ai` pages.
 *
 * ## Why this exists instead of `$lib/i18n`
 *
 * The shared catalog in `$lib/i18n` is ~18 kB gzipped, because it carries every translated string
 * for all 81 tools. `/connect-ai` has a 45 kB JavaScript budget and an English baseline that
 * already sits around 41 kB, so importing that catalog put the hub at roughly 96 kB — more than
 * double its budget — for a page that renders no Arabic and no pseudo-locale at all.
 *
 * The connect pages are therefore English-only by design, and this module is what "English-only"
 * means concretely: a `t()` whose signature matches the shared one so the call sites read the same,
 * and which returns the fallback. If these pages are ever localized, the change is to import the
 * shared catalog here — the call sites will not need to move, and the budget conversation will be
 * a real one at that point rather than a silent 2× overage now.
 *
 * The `locale` prop is still threaded through the components. That is deliberate: it keeps the
 * components signature-compatible with the rest of the app, so adding translations later is a
 * change to this file rather than a change to five components.
 */

/** The locales the shared app supports. The connect pages render `en` for all of them today. */
export type Locale = 'en' | 'en-XA' | 'ar';

/**
 * Return the English string.
 *
 * `value` is accepted and applied to the `{value}` placeholder so this is a drop-in for
 * `$lib/i18n`'s `translate`. No connect-page string currently uses `{value}`; the parameter exists
 * so a future one can without changing the signature.
 */
export function t(_locale: Locale, key: string, fallback: string, value?: string | number): string {
  return fallback.replace('{value}', value !== undefined ? String(value) : '');
}
