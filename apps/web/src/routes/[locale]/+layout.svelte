<!--
  Attaches the Arabic catalogue to the locale registry for every `/[locale]` page.

  This is a component rather than a `load` function on purpose. SvelteKit does not re-run a
  universal `load` during hydration — it reuses the serialized server payload — so a table loaded
  with `await import()` in `load` would resolve in Node during prerender and leave the browser's
  copy empty. The page would prerender Arabic and then silently switch to English on hydration.
  A component body runs in the server module instance and again in the browser's, before
  `{@render children()}`, so `translate('ar', ...)` always finds the table.

  Registering here also keeps the ~18.5 KB table out of every non-localized route: Vite only
  reaches this module from `[locale]` nodes, so English pages never load the chunk. `en-XA` pages
  do register it even though `pseudo()` derives their strings from English fallbacks; that is a
  few wasted bytes on a route that already costs more than the shared ceiling allows elsewhere,
  and it keeps the registration unconditional so it cannot be tree-shaken away.
-->
<script lang="ts">
  import { registerArabic } from '$lib/locales/ar';

  registerArabic();

  let { children } = $props();
</script>

{@render children()}
