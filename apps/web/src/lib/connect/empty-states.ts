/**
 * P5-14 — the two in-app empty states (README §17.7).
 *
 * §17.7's warning is that conflating them "would misrepresent the product", and it is right to be
 * strict about it. The two situations are not the same situation:
 *
 * - **Escalation** (T32, T62, T66–T69): the local result is *already on screen*. The user has
 *   something that works. This is an offer, not a gate, and the copy has to read that way — the
 *   first sentence gives away that the local version is free and finished.
 * - **AI-only** (T64, T65, T71): there is no local path at all. Saying "try the AI version" would
 *   be a lie of omission; saying "this is unavailable" would misrepresent the product. The honest
 *   sentence is that this particular operation needs a model, followed by the nearest thing that
 *   does work locally, as a real link.
 *
 * The copy rules are enforced, not just documented. `assertCopyRules` is called by the tests, and
 * the two states share no headline — if a future edit makes them interchangeable, that is a bug the
 * suite should catch rather than a nuance for a reader to infer.
 */

import { AI_ONLY_TOOLS, COPY_RULES, LOCAL_TOOL_COUNT } from './content';

export type EmptyState = {
  readonly id: 'escalation' | 'ai-only';
  /** Short label for the eyebrow. */
  readonly eyebrow: string;
  /** The headline. Never shared between the two states. */
  readonly headline: string;
  readonly body: readonly string[];
  /** The primary action. */
  readonly primary: { href: string; label: string };
  /** Real links, never consolation text. */
  readonly actions: readonly { href: string; label: string; primary?: boolean }[];
  /** The local alternative that genuinely works, linked. */
  readonly localAlternative: { href: string; label: string; why: string };
  /** Approximate cost, named before the request rather than after. */
  readonly cost: string;
};

/**
 * On an escalation control: the local result exists and is free.
 *
 * §17.7's copy opens by handing over the local result as the default, then offering the AI path.
 * The order matters — the user is not blocked, and the page should not make them feel blocked.
 */
export const ESCALATION_STATE: EmptyState = {
  id: 'escalation',
  eyebrow: 'Optional · your device already did this',
  headline: 'Want to try this with an AI model?',
  body: [
    'The result above was produced on your device, free, and it is yours to keep as it is. Nothing further is needed.',
    'If it is not good enough, an AI model may do better on this image. That needs your own provider account — about two minutes to set up, and you pay that provider directly, roughly $0.04 for an operation like this one.',
    'The cost is theirs, not ours, and the image goes to the provider you choose rather than to us.',
  ],
  primary: { href: '/connect-ai', label: 'Connect a provider' },
  actions: [
    { href: '/connect-ai', label: 'Connect a provider', primary: true },
    { href: '/connect-ai#chooser', label: 'Not now — help me choose first' },
  ],
  localAlternative: {
    href: '/connect-ai',
    label: 'Keep the local result',
    why: 'The result above was made here, on your device, and costs nothing. Connecting a provider changes nothing about that.',
  },
  cost: 'Roughly $0.04 per operation, paid to your provider. Nothing here is charged by this site.',
};

/**
 * On one of the three AI-only tools: there is no local path, and we say so.
 *
 * The nearest working local tool is a real link in the primary action row, not a footnote. A user
 * who does not want to connect anything should leave with something they can actually do.
 */
export const AI_ONLY_STATE: EmptyState = {
  id: 'ai-only',
  eyebrow: 'This tool needs a provider',
  headline: 'This one needs an AI model.',
  body: [
    'Generating an image from a description is the one thing no algorithm can do, so it needs your own provider account. That is how it stays free here, and it means your images go to a provider you chose rather than to us.',
    'Setup takes about two minutes. You pay that provider at their price — for a single generated image, typically a few cents.',
  ],
  primary: { href: '/connect-ai', label: 'Connect a provider' },
  actions: [
    { href: '/connect-ai', label: 'Connect a provider', primary: true },
    { href: '/connect-ai#faq', label: 'How this works' },
    { href: '/convert', label: 'Make patterns, QR codes, and placeholders instead →' },
  ],
  localAlternative: {
    href: '/convert',
    label: 'Make patterns, QR codes, and placeholders instead',
    why: `Local tools build those from scratch, on your device, for free. ${LOCAL_TOOL_COUNT.workingWithoutKey} of the ${LOCAL_TOOL_COUNT.total} tools work with nothing connected.`,
  },
  cost: 'A few cents per generated image, paid to your provider.',
};

/** Which state belongs on which tool. Kept explicit so a tool cannot silently get the wrong one. */
export const TOOL_EMPTY_STATE: Readonly<Record<string, EmptyState['id']>> = {
  // Escalation: a local result is already on screen.
  '/enlarge': 'escalation',
  '/remove-object': 'escalation',
  '/replace-background': 'escalation',
  '/remove-background': 'escalation',
  '/denoise': 'escalation',
  '/sharpen': 'escalation',
  '/expand-image': 'escalation',
  '/smart-crop': 'escalation',
  // AI-only: no local path exists.
  '/ai/generate': 'ai-only',
  '/ai/edit': 'ai-only',
  '/ai/describe': 'ai-only',
};

/** The state for a route, defaulting to AI-only for the three that have no local path. */
export function emptyStateFor(route: string): EmptyState {
  return TOOL_EMPTY_STATE[route] === 'escalation' ? ESCALATION_STATE : AI_ONLY_STATE;
}

/** The three tools that need a provider, for cross-links between them. */
export { AI_ONLY_TOOLS };

/**
 * Check a rendered string against §17.7's copy rules.
 *
 * Returned as a list of violations rather than thrown, so the tests can report all of them at once
 * and so a page component can call it in development without taking the site down.
 */
export function assertCopyRules(text: string): readonly string[] {
  const violations: string[] = [];
  for (const word of COPY_RULES.bannedWords) {
    // Word-boundary-ish: reject the word as its own token, so "profile" or "program" is fine.
    const pattern = new RegExp(`\\b${word}\\b`, 'u');
    if (pattern.test(text)) {
      violations.push(`contains the paywall word "${word}"`);
    }
  }
  return violations;
}

/** Both states, for tests and for the walkthrough pages' shared footer. */
export const EMPTY_STATES: readonly EmptyState[] = [ESCALATION_STATE, AI_ONLY_STATE];
