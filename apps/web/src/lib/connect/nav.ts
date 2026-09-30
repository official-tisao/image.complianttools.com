/**
 * P5-14 — cross-links between the `/connect-ai` pages.
 *
 * These four pages are the ones §17.4 calls "the pages that earn links, because nobody else writes
 * them well". They are linked from the hub, from every walkthrough, and from each other, so the
 * descriptions live in one place and a reader arriving from search on any one of them is offered the
 * other three.
 */

export type Subpage = {
  readonly href: string;
  readonly title: string;
  readonly body: string;
  /** Whether the page's content is verified against upstream docs, and carries a checked date. */
  readonly verified?: boolean;
};

export const SUBPAGES: readonly Subpage[] = [
  {
    href: '/connect-ai/self-hosted',
    title: 'Run a model on your own machine',
    body: 'Exact CORS commands for Ollama, LM Studio, vLLM, and LiteLLM, each checked against that project’s own documentation, with a curl test and a troubleshooting order.',
    verified: true,
  },
  {
    href: '/connect-ai/relay',
    title: 'Deploying your own relay',
    body: 'What a relay is, when you need one, and precisely what it can and cannot see.',
  },
  {
    href: '/connect-ai/cost',
    title: 'What AI image operations cost',
    body: 'Per-image versus per-token versus per-second, what drives the price, and a worked example you can check the arithmetic on.',
  },
  {
    href: '/connect-ai/privacy',
    title: 'What each provider says about your images',
    body: 'Each provider’s own retention and training policy, quoted and linked, with the date it was read.',
    verified: true,
  },
];

/** How many providers the hub lists before it would need pagination. */
export const RECOMMENDED_PAGE_SIZE = 10;
