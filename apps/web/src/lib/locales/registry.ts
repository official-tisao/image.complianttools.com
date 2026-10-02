/**
 * Process-local registry of locale string tables.
 *
 * `translate()` is synchronous and is called during Svelte render, so a locale table cannot be
 * fetched with `await import()` at the call site — that would force every one of its callers to
 * become async. Instead a locale page registers its table before its children render, and
 * `translate()` reads it back synchronously from here.
 *
 * Registration must happen in a component rather than a `load` function: SvelteKit does not
 * re-run universal `load` during hydration (it reuses the serialized server payload), so an
 * `await import()` in `load` would resolve in Node during prerender but leave the browser's copy
 * of the table empty — the page would prerender Arabic and then flip to English on hydration.
 * A component body runs in both the server and the browser module instance, before
 * `{@render children()}`, so the table is present wherever `translate()` can observe it.
 *
 * This module is intentionally tiny: every route imports it, so it must stay in the eager graph.
 */
const tables = new Map<string, Readonly<Record<string, string>>>();

export function registerLocale(code: string, table: Readonly<Record<string, string>>): void {
  tables.set(code, table);
}

/** Return the registered message for `key`, or `undefined` so callers can fall back. */
export function lookup(code: string, key: string): string | undefined {
  return tables.get(code)?.[key];
}
