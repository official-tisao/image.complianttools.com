/**
 * P5-14 — `/connect-ai` page options.
 *
 * The hub renders as static HTML with no client JavaScript.
 *
 * ## Why
 *
 * The route carries a 45 kB JavaScript budget, and the hydrated baseline for *any* SvelteKit page
 * in this app is about 41 kB gzipped before a line of page-specific code — measured against
 * `/licenses`, the leanest hydrated route, which already loads 41,144 bytes of framework and
 * engine. That leaves roughly 4 kB for the page itself, and the chooser table, the comparison
 * table, the fourteen FAQ answers, and the security claims are well over that. Hydrating this page
 * would put it at roughly 68 kB, over budget by half, for markup that is already complete.
 *
 * So the page is a static document, and everything on it was built to work that way. The chooser is
 * the only part that would normally want scripting, and it does not: `chooser.ts` scores every
 * task × priority pair at build time, the outcomes are prerendered, and a generated stylesheet
 * switches between them with `:has()` as the reader changes the radio buttons. The style rules are
 * generated from the same array that renders the blocks, so the two cannot drift.
 *
 * The third question — accounts you already have — is honoured the same way: checking a provider
 * reveals a "you already have this" callout in whichever outcome is showing, again from a
 * generated rule rather than a hand-written one.
 *
 * The trade is that a browser too old for `:has()` (pre-2023) will see the default answer and no
 * switching. That is a graceful degradation to a correct-but-static page rather than a broken one.
 */
export const csr = false;
