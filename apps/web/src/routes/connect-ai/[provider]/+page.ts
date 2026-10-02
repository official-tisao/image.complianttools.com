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
 * The walkthrough ships as prerendered HTML, and hydrates so step 3's button can run.
 *
 * Steps 1, 2, and 4 — create a key, understand the credential field, see what the provider
 * unlocks — are complete as markup and readable with scripting off, which is the same reasoning that
 * gives `docs/formats/*` a zero-JavaScript budget.
 *
 * Client-side rendering is on because §17.3 step 3 is an actual control: it runs `adapter.test()`
 * against the provider and renders what came back. `ProviderConnectionTest` imports the adapter
 * dynamically at press time, so none of the ten adapter implementations is in this route's initial
 * chunk — which is what keeps the page inside its 45 kB budget.
 *
 * With scripting off the button does not work, and the page says so: the documented states and
 * messages below it are the fallback, and they are the same ones a working test would render.
 */
export const csr = true;

/** One prerendered page per connectable provider. */
export const entries: EntryGenerator = () =>
  PROVIDER_GUIDES.map((guide) => ({ provider: guide.slug }));

export const load: PageLoad = ({ params }) => {
  const guide = providerGuide(params.provider);
  if (!guide) error(404, `Unknown provider: ${params.provider}`);
  return { provider: params.provider };
};
