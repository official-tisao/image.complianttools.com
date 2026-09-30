/**
 * P5-14 — `/connect-ai/[provider]` (§17.3).
 *
 * Prerendered for every registered provider, and 404 for anything else. The `entries` generator is
 * what makes this a real set of indexable pages rather than a client-side route: each provider has
 * its own URL, its own title, and its own description, and all of them are in the prerendered HTML.
 *
 * Unknown and fixture providers are rejected here rather than in the component, so `/connect-ai/test-stub`
 * is a 404 and a stale link fails loudly.
 */
import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types';
import { PROVIDER_GUIDES, providerGuide } from '$lib/connect/providers';

export const prerender = true;

/**
 * The walkthrough ships as static HTML with no client JavaScript.
 *
 * Steps 1, 2, and 4 — create a key, understand the credential field, see what the provider
 * unlocks — are complete as markup. Step 3's *Test connection* is the one interactive part, and it
 * is a `<details>` disclosure whose contents are authored per provider and rendered at build time.
 * That keeps the page inside the 45 kB route budget and makes the whole walkthrough readable with
 * scripting off, which is the same reasoning that gives `docs/formats/*` a zero-JavaScript budget.
 *
 * Making the test a real call is a follow-up: it needs a connection manager to keep a credential
 * across a page load, and that does not exist yet (see `CONNECTIONS_STATUS`).
 */
export const csr = false;

/** One prerendered page per connectable provider. */
export const entries: EntryGenerator = () =>
  PROVIDER_GUIDES.map((guide) => ({ provider: guide.slug }));

export const load: PageLoad = ({ params }) => {
  const guide = providerGuide(params.provider);
  if (!guide) error(404, `Unknown provider: ${params.provider}`);
  return { provider: params.provider };
};
