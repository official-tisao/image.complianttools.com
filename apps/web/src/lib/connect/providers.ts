/**
 * P5-14 — the single provider catalogue behind every `/connect-ai` page.
 *
 * Source of truth: README §17.2 (chooser table), §17.3 (walkthrough template), §13.1, §15, §16.
 *
 * The rule this file exists to enforce: **nothing here is invented.** Every capability, cost hint,
 * CORS posture, model, and privacy claim is copied from the adapter descriptor that ships in
 * `packages/engine/src/ai/adapters/`. The one thing this module adds is editorial metadata a
 * descriptor cannot carry — the four-step walkthrough copy, the "best for" line, and the setup
 * estimate — and each of those is written to be true of the adapter, not of a hoped-for adapter.
 *
 * Concretely, three things this file must never do:
 *
 * 1. Claim a capability the descriptor does not declare. §17.3's failure-message contract depends
 *    on "confirmed capabilities" meaning the descriptor's, not a sales pitch's.
 * 2. Claim a provider is connected, tested, or verified. Nothing here knows the user's state.
 * 3. State a nightly-refreshed freshness date. P5-17 (the nightly contract job) has not shipped —
 *    `browserDirect` here is copied from source, and `browserDirectChecked` records when a human
 *    read it out of the descriptor. Saying "updated nightly" would be claiming a job that does not
 *    run. See `browserDirectFreshness` below.
 */

import type {
  AiCapability,
  ProviderAdapter,
  ProviderDescriptor,
} from '@complianttools/image-engine/ai/types';
import { PROVIDER_CATALOGUE } from './provider-catalogue';

/** Human label for each capability, shared by the chooser and the walkthrough grids. */
export const CAPABILITY_LABELS: Readonly<Record<AiCapability, string>> = {
  generate: 'Generate',
  edit: 'Edit',
  inpaint: 'Inpaint',
  outpaint: 'Expand',
  erase: 'Erase',
  upscale: 'Upscale',
  removeBackground: 'Remove background',
  replaceBackground: 'Replace background',
  describe: 'Describe',
  segment: 'Select subject',
};

/** Long form, for table headers and `aria-label`s where the short form is ambiguous. */
export const CAPABILITY_DESCRIPTIONS: Readonly<Record<AiCapability, string>> = {
  generate: 'Create a new image from a written description.',
  edit: 'Change an image by describing the change, with no mask.',
  inpaint: 'Repaint only the region you mask.',
  outpaint: 'Extend an image beyond its current edges.',
  erase: 'Remove a masked object and fill the gap.',
  upscale: 'Enlarge an image, usually adding detail.',
  removeBackground: 'Return the subject with the background made transparent.',
  replaceBackground: 'Put a new background behind the subject.',
  describe: 'Read text out of an image, or write alt text for it.',
  segment: 'Produce a mask by clicking or pointing at a subject.',
};

/** One line per capability, written for a user deciding whether to keep reading. */
export const CAPABILITY_ONE_LINERS: Readonly<Record<AiCapability, string>> = {
  generate: 'Type a description, get an image back.',
  edit: 'Describe the change in words; the whole image is re-rendered.',
  inpaint: 'Paint over the area you want changed, and only that area.',
  outpaint: 'Grow the canvas and have the edges filled in.',
  erase: 'Brush over an object and it disappears.',
  upscale: 'Make an image bigger, usually with more detail than a plain resize.',
  removeBackground: 'Knock the background out to transparent.',
  replaceBackground: 'Swap the background, keeping the subject.',
  describe: 'Get alt text, a caption, or the text inside the picture.',
  segment: 'Click a subject to get a mask you can reuse.',
};

/**
 * The `browserDirect` values, and what we can honestly say about them.
 *
 * README §17.2 says the column is "updated nightly (§15.2), so it is never stale". The nightly
 * contract job is P5-17 and is not implemented — there is no `provider-contract.yml`, and
 * `docs/PROVIDERS.md` does not exist. So this module states the truth instead: these values are
 * read from the adapter source, and the date below is when they were last read. Changing the
 * wording of this object to promise a refresh would be the exact failure §17.2 is trying to avoid,
 * just in the other direction.
 */
export const browserDirectFreshness = {
  /** Shown next to the "Works in browser" column. */
  note: 'Read from the adapter source on 2026-09-29. A nightly job that re-tests these values against each live API is not running yet, so treat "Needs checking" as genuinely unknown rather than as a stale yes.',
  /** The day the values below were last read out of the adapters. */
  checkedOn: '2026-09-29',
  /** Whether §15.2's automatic refresh exists yet. It does not. */
  nightlyRefresh: false,
} as const;

/** How each `browserDirect` value is rendered, and the honest caveat that goes with it. */
export const BROWSER_DIRECT_DISPLAY: Readonly<
  Record<ProviderDescriptor['browserDirect'], { label: string; detail: string }>
> = {
  yes: {
    label: 'Yes',
    detail: 'The provider serves the calls this page makes directly to a browser.',
  },
  'yes-with-header': {
    label: 'Yes, with a header',
    detail:
      'A browser can make the call, but only if the provider accepts the extra header the request needs.',
  },
  no: {
    label: 'No',
    detail: 'The provider blocks direct browser calls. A relay is required.',
  },
  unknown: {
    label: 'Needs checking',
    detail:
      'Nobody has confirmed this from a browser yet. If the first call fails, that is the most likely reason.',
  },
};

/** Provider ids that are fixtures rather than real services, and must not reach the chooser. */
const HIDDEN_PROVIDER_IDS: ReadonlySet<string> = new Set(['test-stub']);

/** Setup-time estimates, by provider. Written by hand, and deliberately coarse. */
const SETUP_MINUTES: Readonly<Record<string, number>> = {
  anthropic: 2,
  openai: 2,
  gemini: 2,
  stability: 3,
  bfl: 3,
  fal: 2,
  replicate: 3,
  removebg: 2,
  clipdrop: 2,
  'openai-compatible': 10,
};

/** The one-sentence "best for" line from the §17.2 table, restated against the real descriptor. */
const BEST_FOR: Readonly<Record<string, string>> = {
  anthropic: 'Reading text in images, and writing alt text and captions for them.',
  openai: 'Generating images, and editing or inpainting them from a written instruction.',
  gemini: 'Iterative editing and rendering text inside a generated image.',
  stability: 'Mask-driven editing: inpaint, erase, expand, and background work in one account.',
  bfl: 'FLUX generation and mask-based fill at the top of its quality range.',
  fal: 'The widest single catalogue — many capabilities without several accounts.',
  replicate: 'A specific community model that exists nowhere else.',
  removebg: 'Background removal on hair and fur, which is where most tools show their seams.',
  clipdrop: 'Cleanup and upscaling alongside background removal.',
  'openai-compatible':
    'Keeping every image on your own machine — Ollama, LM Studio, vLLM, LiteLLM.',
};

/**
 * The account you need before a key works.
 *
 * §17.3 asks each walkthrough to say whether billing has to be set up first. This is a factual
 * claim about a third party's product and can change without notice, so it is a per-provider
 * statement with a date, not a generalisation.
 */
const BILLING_NOTE: Readonly<Record<string, string>> = {
  anthropic:
    'A key works for free without adding payment details, but Anthropic requires credits before a request that bills will run.',
  openai:
    'OpenAI requires a payment method on the account before image endpoints will return anything.',
  gemini:
    'Google AI Studio offers a free tier for some models. Image generation is metered separately.',
  stability:
    'Stability AI needs credits on the account. A key with a zero balance authenticates but every paid call fails.',
  bfl: 'Black Forest Labs bills per call through its own platform. Check whether your account has a balance before you test.',
  fal: 'fal.ai includes a small free credit on signup; beyond that it is prepaid.',
  replicate: 'Replicate bills per second of compute. There is no free tier.',
  removebg:
    'remove.bg includes one free credit a month. A preview costs less than a full-size export.',
  clipdrop: 'Clipdrop includes a limited free allowance; beyond that you buy credits.',
  'openai-compatible': 'No account and no billing — the server is one you already run.',
};

/** Walks a user through the provider's own site using the labels they will actually see. */
type KeyStep = { readonly text: string; readonly uiLabels?: readonly string[] };

const KEY_STEPS: Readonly<Record<string, readonly KeyStep[]>> = {
  anthropic: [
    {
      text: 'Open the API keys page and create a new secret key. Give it a name you will recognise later, such as image-tools.',
      uiLabels: ['API Keys', 'Create Key', 'Name', 'Create Key'],
    },
    {
      text: 'Copy the key the moment it appears. Anthropic shows the full value only once; afterwards only the first few characters are shown.',
      uiLabels: ['Copy'],
    },
  ],
  openai: [
    {
      text: 'Open the API keys page, choose Create new secret key, and name it something like image-tools.',
      uiLabels: ['API keys', 'Create new secret key', 'Name', 'Create secret key'],
    },
    {
      text: 'Copy the key immediately. It is shown once and cannot be retrieved afterwards.',
      uiLabels: ['Copy'],
    },
  ],
  gemini: [
    {
      text: 'Open Google AI Studio, choose Get API key, then Create API key in a new project. The key starts with AIza.',
      uiLabels: ['Get API key', 'Create API key'],
    },
    {
      text: 'Copy the key and keep the project in mind — deleting the project in Google Cloud deletes the key with it.',
      uiLabels: ['Copy'],
    },
  ],
  stability: [
    {
      text: 'Open the account keys page and reveal or create your API key.',
      uiLabels: ['Account', 'Keys', 'Reveal', 'Create API Key'],
    },
    {
      text: 'Add credits to the account. A key alone authenticates, but every paid call fails at a zero balance.',
      uiLabels: ['Billing', 'Add Credits'],
    },
  ],
  bfl: [
    {
      text: 'This adapter uses the x-key header, which is the key issued by the platform the account belongs to. For Black Forest Labs the key is created in the fal.ai dashboard with the provider set to Black Forest Labs.',
      uiLabels: ['Dashboard', 'API Keys', 'Create Key'],
    },
    {
      text: 'Copy the key, then confirm the account has a balance. BFL bills per call, so a zero balance authenticates and then fails.',
      uiLabels: ['Billing'],
    },
  ],
  fal: [
    {
      text: 'Open the dashboard keys page and create a key. fal keys are sometimes labelled FAL_KEY.',
      uiLabels: ['Dashboard', 'Keys', 'Create Key'],
    },
    {
      text: 'Copy the key. A small free credit is applied on signup; generation beyond that draws down the balance.',
      uiLabels: ['Copy'],
    },
  ],
  replicate: [
    {
      text: 'Open the API tokens page and create a token. Replicate tokens begin with r8_.',
      uiLabels: ['Account', 'API tokens', 'Create token'],
    },
    {
      text: 'Copy the token. It is shown once.',
      uiLabels: ['Copy'],
    },
  ],
  removebg: [
    {
      text: 'Open the API account page and copy the API key shown there.',
      uiLabels: ['Dashboard', 'API Account'],
    },
    {
      text: 'Note the remaining credits. One full-size export uses one credit; previews cost less.',
      uiLabels: ['API Account', 'credits'],
    },
  ],
  clipdrop: [
    {
      text: 'Open the APIs page and copy your API key.',
      uiLabels: ['APIs'],
    },
    {
      text: 'The key is sent as the x-api-key header. Check the remaining credits shown alongside it.',
      uiLabels: ['credits'],
    },
  ],
  'openai-compatible': [
    {
      text: 'There is no account to create. You supply the base URL of a server you already run — an Ollama, LM Studio, vLLM, or LiteLLM instance — and this page talks to it in the OpenAI format.',
    },
    {
      text: 'Most local servers need no key at all. If yours does, it is whatever you set on that server, not something issued to you.',
    },
  ],
};

/**
 * A screenshot placeholder with the caption that describes what the user should see.
 *
 * §17.3 requires a `verified: date` per screenshot and a CI warning after 180 days. No screenshots
 * are captured yet, so these render as a described placeholder rather than an image — an image
 * that does not exist yet would be a broken promise, and a stale one later would be worse.
 */
const SCREENSHOT_CAPTIONS: Readonly<Record<string, string>> = {
  anthropic: 'The API Keys page, with the Create Key button at the top right of the key list.',
  openai: 'The API keys page, with the Create new secret key button above the key table.',
  gemini: 'The Get API key dialog, with a project selector and the Create API key button.',
  stability: 'The account keys page, showing the key and the credit balance side by side.',
  bfl: 'The dashboard keys page, with the provider selector above the key list.',
  fal: 'The dashboard keys page, with the key and the credit balance beneath it.',
  replicate: 'The API tokens page, listing the r8_ token name and its creation date.',
  removebg: 'The API account page, showing the key and the remaining credits.',
  clipdrop: 'The APIs page, showing the key and the remaining credit count.',
  'openai-compatible':
    'The local server running — Ollama at localhost:11434, or LM Studio at localhost:1234.',
};

/** A route and heading for each capability, used by §17.3's "what you can now do" grid. */
const CAPABILITY_ROUTES: Readonly<Partial<Record<AiCapability, { href: string; label: string }>>> =
  {
    generate: { href: '/ai/generate', label: 'AI Image Generator' },
    edit: { href: '/ai/edit', label: 'AI Image Editor' },
    describe: { href: '/ai/describe', label: 'AI Image Description' },
    removeBackground: { href: '/remove-background', label: 'Remove Background' },
    replaceBackground: { href: '/replace-background', label: 'Replace Background' },
    erase: { href: '/remove-object', label: 'Remove Object' },
    upscale: { href: '/enlarge', label: 'AI Upscale' },
    outpaint: { href: '/expand-image', label: 'Expand Image' },
    segment: { href: '/remove-object', label: 'Mask tools' },
    inpaint: { href: '/remove-object', label: 'Inpaint' },
  };

/** Editorial metadata bolted onto a real descriptor. */
export type ProviderGuide = {
  readonly descriptor: ProviderDescriptor;
  /** Stable, URL-safe slug used for `/connect-ai/[provider]`. */
  readonly slug: string;
  /** The §17.2 "Best for" line. */
  readonly bestFor: string;
  /** Coarse setup-time estimate in minutes. */
  readonly setupMinutes: number;
  /** Whether the provider's key is a hosted-service secret or a local server address. */
  readonly selfHosted: boolean;
  /** Whether creating the key requires paying the provider before it will do anything. */
  readonly billingRequired: string;
  readonly keySteps: readonly KeyStep[];
  readonly screenshotCaption: string;
};

/** Every provider a user can actually connect, in §17.2's order, fixtures removed. */
function buildGuides(): readonly ProviderGuide[] {
  return PROVIDER_CATALOGUE.filter((d) => !HIDDEN_PROVIDER_IDS.has(d.id)).map((descriptor) => ({
    descriptor,
    slug: descriptor.id,
    bestFor: BEST_FOR[descriptor.id] ?? descriptor.name,
    setupMinutes: SETUP_MINUTES[descriptor.id] ?? 3,
    selfHosted: descriptor.allowsCustomBaseUrl && descriptor.id === 'openai-compatible',
    billingRequired: BILLING_NOTE[descriptor.id] ?? 'Check the provider’s own account page.',
    keySteps: KEY_STEPS[descriptor.id] ?? [],
    screenshotCaption: SCREENSHOT_CAPTIONS[descriptor.id] ?? '',
  }));
}

/** All providers, in §17.2 order. Excludes test fixtures. */
export const PROVIDER_GUIDES: readonly ProviderGuide[] = buildGuides();

/** Slugs prerendered at `/connect-ai/[provider]`. */
export const PROVIDER_SLUGS: readonly string[] = PROVIDER_GUIDES.map((g) => g.slug);

/**
 * The export name each adapter module publishes, keyed by provider id.
 *
 * The walkthrough needs the adapter itself only when a user presses *Test connection*, so the
 * module is imported at that moment rather than bundled with the page. Statically importing all
 * ten would put every `run()` implementation in the hub's client bundle and roughly double the
 * 45 kB budget for code no reader without a key ever executes.
 */
const ADAPTER_LOADERS: Readonly<Record<string, () => Promise<ProviderAdapter>>> = {
  anthropic: () =>
    import('@complianttools/image-engine/ai/adapters/anthropic').then((m) => m.anthropicAdapter),
  openai: () =>
    import('@complianttools/image-engine/ai/adapters/openai').then((m) => m.openaiAdapter),
  gemini: () =>
    import('@complianttools/image-engine/ai/adapters/gemini').then((m) => m.geminiAdapter),
  stability: () =>
    import('@complianttools/image-engine/ai/adapters/stability').then((m) => m.stabilityAdapter),
  bfl: () => import('@complianttools/image-engine/ai/adapters/bfl').then((m) => m.bflAdapter),
  fal: () => import('@complianttools/image-engine/ai/adapters/fal').then((m) => m.falAdapter),
  replicate: () =>
    import('@complianttools/image-engine/ai/adapters/replicate').then((m) => m.replicateAdapter),
  removebg: () =>
    import('@complianttools/image-engine/ai/adapters/removebg').then((m) => m.removeBgAdapter),
  clipdrop: () =>
    import('@complianttools/image-engine/ai/adapters/clipdrop').then((m) => m.clipdropAdapter),
  'openai-compatible': () =>
    import('@complianttools/image-engine/ai/adapters/openai-compatible').then(
      (m) => m.openaiCompatibleAdapter,
    ),
};

/**
 * Load one provider's adapter, or `undefined` if the id is not one we offer.
 *
 * `PROVIDER_CATALOGUE` is the source of truth for which ids exist, so a catalogue entry without a
 * loader here is a build-time mistake the drift test catches rather than a runtime surprise.
 */
export function loadProviderAdapter(slug: string): Promise<ProviderAdapter | undefined> {
  const loader = ADAPTER_LOADERS[slug];
  return loader ? loader() : Promise.resolve(undefined);
}

/** Look up one guide. Returns `undefined` for a fixture or an unknown slug. */
export function providerGuide(slug: string): ProviderGuide | undefined {
  return PROVIDER_GUIDES.find((g) => g.slug === slug);
}

/** The route each capability's tool lives at, for §17.3's step-4 grid. */
export function capabilityRoute(
  capability: AiCapability,
): { href: string; label: string } | undefined {
  return CAPABILITY_ROUTES[capability];
}

/** The tool a newly connected provider unlocks, in §17.2's capability order. */
export const UNLOCK_ORDER: readonly AiCapability[] = [
  'describe',
  'generate',
  'edit',
  'inpaint',
  'erase',
  'outpaint',
  'upscale',
  'removeBackground',
  'replaceBackground',
  'segment',
];
