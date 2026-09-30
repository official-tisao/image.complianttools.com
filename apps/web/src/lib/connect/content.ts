/**
 * P5-14 — long-form copy for the `/connect-ai` pages (README §17).
 *
 * Everything here is a **claim about this product**, so every claim has to be one we can defend.
 * Two rules run through the file:
 *
 * - If the engine does not implement something, the page says so rather than implying it. There is
 *   no connection manager API, no cost-ledger UI, and no automatic `browserDirect` refresh, and
 *   `README` §17.1 and §17.5 describe all three. Where the page would otherwise imply them, it
 *   names the gap.
 * - A provider's pricing, retention, and training policy is **their** claim, reproduced with a
 *   link and a checked date. We are not summarising someone else's legal terms.
 */

/** The origin the app is served from. Used for every canonical URL and every CORS example. */
export const SITE_ORIGIN = 'https://image.complianttools.com';

/** README §13.1 — the four reasons BYOK, stated plainly. */
export const WHY_BYOK: readonly { title: string; body: string }[] = [
  {
    title: 'There are no servers to hold your key',
    body: 'This site is static files. There is no backend to receive your key, no database to store it, and no account to create. If a key had to go somewhere, it would have to be your own machine or your provider’s.',
  },
  {
    title: 'You pay the provider directly, at their price',
    body: 'Your key is a provider credential, so the provider bills you and the provider sets the price. We cannot mark it up, meter it, or put it behind a subscription.',
  },
  {
    title: 'You can see exactly what was sent',
    body: 'A provider request goes from your browser to that provider, and a network tab shows the whole thing. Nothing routes through an account of ours that you would have to trust.',
  },
  {
    title: 'It keeps working if we ever go away',
    body: 'The tools are local, and the page is static. A key you paste is a key you own; nothing here is a lease on a service that could be withdrawn.',
  },
];

/** README §13.1 — the four tools that genuinely need a model, and what each does. */
export const AI_ONLY_TOOLS: readonly { id: string; href: string; title: string; body: string }[] = [
  {
    id: 'T64',
    href: '/ai/generate',
    title: 'Generate an image from a description',
    body: 'Making an image out of a sentence is the one thing no local algorithm does. There is no offline substitute for it.',
  },
  {
    id: 'T65',
    href: '/ai/edit',
    title: 'Edit an image by describing the change',
    body: 'A generative edit that redraws the whole image is a model operation. Local pixel operations cannot invent what should replace the region.',
  },
  {
    id: 'T71',
    href: '/ai/describe',
    title: 'Read text out of an image, or write alt text',
    body: 'Reading handwriting, signage, or a photograph takes a vision model. Local OCR covers printed text in a clean scan, and nothing beyond it.',
  },
];

/** README §17.6 — all fourteen questions, in order. */
export const FAQS: readonly { question: string; answer: string; note?: string }[] = [
  {
    question: 'Why do I need my own API key?',
    answer:
      'Because there are no servers here to hold one. This is a set of static files served from a CDN; there is no backend that could receive a credential, so the only place a key can come from is you. The four tools that need a model call a provider directly, and that provider needs a credential that belongs to you.',
  },
  {
    question: 'Does the key ever go to your servers?',
    answer:
      'No, and that is checkable rather than a promise. Open your browser’s developer tools, go to the Network tab, and run a tool. The requests you see are the only requests there are — they go to the provider, and there is no second hop to anywhere else. If a page ever needed a backend, the tool would not work with JavaScript disabled, which is how these tools are built.',
  },
  {
    question: 'What does this cost me?',
    answer:
      'Nothing, for everything that runs locally. The AI tools cost whatever your provider charges them, billed by them, at their prices. Most image APIs are billed per image; some are billed per token or per second of compute. The cost page explains what drives each one.',
    note: 'We do not mark up, meter, or resell provider access, and there is no subscription to buy.',
  },
  {
    question: 'Which provider should I pick?',
    answer:
      'Answer three questions and you will get one answer and two alternatives, rather than a table to re-read. The chooser uses what each provider’s adapter genuinely declares, so it will not recommend something that cannot do the job you picked.',
  },
  {
    question: 'Is my image sent anywhere?',
    answer:
      'Only if you connect a provider and use an AI tool. Local tools — resize, compress, convert, crop, and the rest — never send a file anywhere. An AI tool sends the image to the provider you connected, and to nobody else. The privacy page lists each provider’s own stated policy with a link and the date we read it.',
  },
  {
    question: 'What if I don’t want to connect anything?',
    answer:
      'Then you keep 78 of the 81 tools, and they are the ones that do the bulk of the work: resizing, format conversion, compression, cropping, colour adjustment, metadata, and the rest. Only generating an image from a description, a generative edit, and model-based description need a provider. Nothing is disabled, trial-capped, or watermarked without one.',
  },
  {
    question: 'Where is my key stored, and how do I delete it?',
    answer:
      'Where you put it. The key field defaults to session-only: it lives in the page’s memory and is gone when you close the tab. You can choose to have it kept encrypted under a passphrase you supply, or stored in plain local storage, and each option says what it means before you pick it. To delete it, clear the field, or clear the site’s data in your browser — this page never transmitted it, so there is nothing for us to delete.',
  },
  {
    question: 'Can I use a local model with no internet?',
    answer:
      'Yes, with a caveat about the page itself. A self-hosted server such as Ollama or LM Studio can do this work with no internet at all. The catch is that this page is served over HTTPS, and a browser may refuse to talk to a plain-HTTP local server — a mixed-content rule. The self-hosted page explains which browsers allow it, what to do when one does not, and how to check with curl before blaming anything here.',
  },
  {
    question: 'Why did I get a CORS error?',
    answer:
      'Because the browser blocked a request before it left. CORS is a rule the provider’s server sets about which web pages may call it, and it is enforced by your browser, not by us and not by the provider. If the provider allows browser calls, you will not see this. If they do not, the fix is a relay you run yourself — the relay page explains what that is and what it can see.',
  },
  {
    question: 'What’s a relay and do I need one?',
    answer:
      'A relay is a small program you deploy yourself that forwards requests on a provider’s behalf, which gets around the browser-side rule. You need one only for providers whose servers do not allow direct browser calls. You do not need one for a local model, and you do not need one for most hosted providers. If you deploy one, you can see exactly what it forwards and what it does not store.',
  },
  {
    question: 'Can I use one key across several devices?',
    answer:
      'The key is yours, so yes — but the storage here is per browser. This page keeps a key in the browser you typed it into; a second device needs its own copy. If you use a provider key on several machines, that is your business, and the provider’s own usage limits apply across all of them. You can also run your own server and point several devices at it.',
  },
  {
    question: 'What happens if my key leaks?',
    answer:
      'Revoke it at the provider, which is the only step that matters, and change nothing here — there is no copy of it to remove from this site’s side. Nothing you type is sent to us, so a leak here means a leak from your machine or your provider’s account, not from a database of ours. Rotate the key, and if you shared a key by accident, treat anything billed since as suspect and ask the provider what they can tell you.',
  },
  {
    question: 'Do you rate-limit or queue my requests?',
    answer:
      'No. There is no server here to queue anything, so there is no queue to wait in and no limit to hit. Every rate limit you run into is your provider’s, and it applies to every other client of that provider too. We do add a local spend guard, which is a warning shown in your own browser before a batch would cross a threshold you set — it protects your budget, not our capacity.',
  },
  {
    question: 'Can I use my company’s Azure, Bedrock, or Vertex deployment?',
    answer:
      'If your deployment speaks the OpenAI API format, yes. These runtimes all offer an OpenAI-compatible endpoint, and the self-hosted adapter can point at any of them by base URL — including an internal gateway such as a LiteLLM proxy, which is the usual way to put several of them behind one address. Your company’s deployment stays your company’s, and the key stays inside your network.',
  },
];

/** README §16 — what this site does with a key, restricted to what is actually implemented. */
export const SECURITY_FACTS: readonly { claim: string; detail: string; verifiable: boolean }[] = [
  {
    claim: 'This site is static files. There is no backend to receive a key.',
    detail:
      'The pages are pre-rendered HTML plus JavaScript that runs in your browser. There is no application server, no API of ours, and no database. A key cannot reach a server we do not have.',
    verifiable: true,
  },
  {
    claim: 'A provider request goes from your browser to the provider.',
    detail:
      'The tools call the provider’s API endpoint directly, or through a relay you deployed yourself. Open the Network tab and read the destination of each request — there is no intermediate host.',
    verifiable: true,
  },
  {
    claim: 'A key is never written into a URL, a log line, or an error message.',
    detail:
      'The credential form masks the field, disables autocomplete and spellcheck, and the engine redacts credential values from anything it logs or throws. Keys travel in request headers or bodies, never in a query string.',
    verifiable: true,
  },
  {
    claim: 'Key storage is your choice, and the default is the shortest-lived one.',
    detail:
      'Session-only by default: the key lives in the page’s memory and disappears when you close the tab. You can instead have it encrypted under a passphrase you supply, or stored plainly in this browser’s local storage. Each option is explained before you choose it.',
    verifiable: true,
  },
  {
    claim: 'The page does not load third-party JavaScript.',
    detail:
      'Everything here is served from this origin. There is no analytics script, no tag manager, and no font or script CDN — which is also why a relay or local server is the only outbound path an AI request can take.',
    verifiable: true,
  },
  {
    claim: 'What we cannot claim: anything about what your provider does with your image.',
    detail:
      'Retention, training use, and deletion are the provider’s policy and can change without notice. The privacy page reproduces each provider’s own words with a link and the date we read them. Read them there; we do not paraphrase someone else’s terms into a promise on their behalf.',
    verifiable: false,
  },
];

/** README §17.4 — the cost page's worked example, plus the levers that actually reduce spend. */
export const COST_LEVERS: readonly { title: string; body: string }[] = [
  {
    title: 'Preview at the cheapest setting, export once',
    body: 'Most providers offer a low-cost preview or draft mode. Iterate there, and only render the expensive final version for the image you are keeping.',
  },
  {
    title: 'Batch describe with the small model',
    body: 'Writing alt text for 200 images does not need the largest model. The cheaper tier is usually indistinguishable in the output you actually publish.',
  },
  {
    title: 'Use local tools for everything that is not generative',
    body: 'Resize, convert, compress, crop, rotate, and recolour are deterministic and local, and they are free. Background removal and upscaling have good local paths too. Paying per image for arithmetic is the easiest waste to avoid.',
  },
  {
    title: 'Ask for the resolution you will use',
    body: 'A 4K render you downscale to 1024px is a more expensive picture of the same picture. Several providers price by output resolution and size.',
  },
];

/** README §17.4 — the worked cost example, stated as arithmetic the reader can check. */
export const COST_EXAMPLE = {
  heading: 'A worked example: 200 product photos',
  rows: [
    { job: 'Remove the background', how: 'Locally, with the local cutout tool', cost: '$0' },
    {
      job: 'Write alt text for each',
      how: 'One describe call per image, small model',
      cost: 'about $0.60',
    },
    {
      job: 'Replace the background generatively',
      how: 'One inpaint per image, paid tier',
      cost: 'about $8',
    },
  ],
  conclusion:
    'The same 200 images cost nothing, about sixty cents, or about eight dollars — depending entirely on which three jobs you chose to do locally and which you chose to pay for. The first two are free because they are arithmetic; the third is not.',
  note: 'These figures are illustrative orders of magnitude taken from the providers’ published prices, not quotes. Open a provider’s pricing link for the current number.',
} as const;

/**
 * README §17.4 — how the local cost ledger stands today.
 *
 * §13.6 and §17.1 describe a ledger with per-provider totals and CSV export. The engine does
 * implement recording, totals, and CSV serialisation (`ai/ledger-persistence.ts`), but this page
 * does not yet read them back, so the section below is explicit about that rather than showing a
 * table of zeros and calling it your spend.
 */
export const LEDGER_STATUS = {
  implemented:
    'The engine records each provider call locally, with the token or image counts the provider reports, and can total them per provider. Those totals are stored in your browser, not sent anywhere.',
  notYet: 'This page does not read that stored ledger back yet, so nothing is displayed here.',
  why: 'A spend table that renders as all zeros because nothing is wired to it is worse than no table: it looks like you have spent nothing when the real answer is unknown. Rather than show you a confident zero, this section tells you what is recorded and where.',
  exportNote:
    'CSV export of the ledger is implemented in the engine and is not yet reachable from this page.',
} as const;

/** README §17.5 — what the "your providers" area can and cannot show right now. */
export const CONNECTIONS_STATUS = {
  implemented:
    'Whether each provider is being reached directly or through a relay you deployed. That choice is per-provider and is remembered for the session only, because a relay token authorises spending your quota.',
  notYet:
    'A saved list of connected providers is not built yet. There is no store that holds a credential, a confirmed-capability set, a last-used time, or a status flag per provider, so this page cannot list them, and it will not show a provider as connected when it has no way to know.',
  consequence:
    'A key you paste on a walkthrough page is used by that page and is not retained here, so this section is empty until the connection manager exists. That is the honest state of it, and the walkthrough pages still work in the meantime.',
  exportNote:
    'Exporting a configuration file without secrets (§17.5) is not implemented, and no such file is offered.',
} as const;

/** README §17.6 #6 and §17.7 — the local-tool count, stated as a figure with its own source. */
export const LOCAL_TOOL_COUNT = {
  total: 81,
  workingWithoutKey: 78,
  needsProvider: 3,
  note: 'Three of the 81 tools need a model. The other 78 work with nothing connected, and are not trial-capped, watermarked, or otherwise limited.',
} as const;

/** README §17.7 — copy rules. Enforced by the empty-state component and by the tests. */
export const COPY_RULES = {
  /** Words that would make this read as a paywall. The product is not one. */
  bannedWords: ['Upgrade', 'Unlock', 'Pro', 'Premium', 'Subscribe', 'Subscription', 'Trial'],
  bannedWordNote:
    'The product is not paywalled and does not borrow that vocabulary. A key is a provider credential you already pay the provider for, not a feature this site sells.',
  mustAlwaysInclude: [
    'The local alternative, as a real link — never consolation text.',
    'The cost and the provider, named before the request rather than after.',
  ],
} as const;
