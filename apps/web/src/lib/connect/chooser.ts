/**
 * P5-14 — the "Help me choose" flow (README §17.2).
 *
 * Three questions, and an output that removes a decision rather than restating it: **one**
 * recommendation with a one-sentence reason, plus two alternatives. §17.2 is explicit that this
 * is "never a ranked list of ten", so `recommend()` returns exactly three providers and no more,
 * and `alternatives()` never returns the recommendation again.
 *
 * This module is pure: it takes answers, it returns a decision. Nothing here touches the network,
 * the DOM, or the credential store, so the page can call it during prerender to emit a
 * meaningful server-rendered default and the tests can exercise it without a browser.
 *
 * Scoring is deliberately legible. A provider is scored per question, the three scores are added,
 * and ties break on the §17.2 table order rather than on an arbitrary sort. Anyone reading the
 * output should be able to work out why the winner won.
 */

import type { AiCapability } from '@complianttools/image-engine/ai/types';
import { PROVIDER_GUIDES, type ProviderGuide } from './providers';

/** Question 1 — what the user is trying to do. */
export const TASK_OPTIONS: readonly { value: TaskAnswer; label: string }[] = [
  { value: 'describe', label: 'Describe images' },
  { value: 'generate', label: 'Generate images' },
  { value: 'backgrounds', label: 'Remove or replace backgrounds' },
  { value: 'erase', label: 'Erase objects' },
  { value: 'expand', label: 'Expand images' },
  { value: 'upscale', label: 'Upscale' },
];

export type TaskAnswer = 'describe' | 'generate' | 'backgrounds' | 'erase' | 'expand' | 'upscale';

/** Question 2 — what matters most. */
export type PriorityAnswer = 'cheapest' | 'best-quality' | 'most-private' | 'easiest-setup';

export const PRIORITY_OPTIONS: readonly { value: PriorityAnswer; label: string }[] = [
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'best-quality', label: 'Best quality' },
  { value: 'most-private', label: 'Most private' },
  { value: 'easiest-setup', label: 'Easiest setup' },
];

/** Question 3 — where the user already has an account. */
export const ACCOUNT_PROVIDERS: readonly { value: string; label: string }[] =
  PROVIDER_GUIDES.filter((g) => !g.selfHosted).map((g) => ({
    value: g.slug,
    label: g.descriptor.name,
  }));

export type ChooserAnswers = {
  task: TaskAnswer;
  priority: PriorityAnswer;
  accounts: readonly string[];
};

export type Recommendation = {
  /** The single provider the user should start with. */
  readonly pick: ProviderGuide;
  /** One sentence. Why this one, in terms of what they asked for. */
  readonly reason: string;
  /** Exactly two providers that are genuinely different choices, never the pick again. */
  readonly alternatives: readonly ProviderGuide[];
  /** Why each alternative is on the list, so the two are choices rather than padding. */
  readonly alternativeReasons: readonly string[];
};

/** Which capabilities a task answer implies. */
const TASK_CAPABILITIES: Readonly<Record<TaskAnswer, readonly AiCapability[]>> = {
  describe: ['describe'],
  generate: ['generate', 'edit'],
  backgrounds: ['removeBackground', 'replaceBackground'],
  erase: ['erase', 'inpaint'],
  expand: ['outpaint'],
  upscale: ['upscale'],
};

/**
 * Quality ranking, lowest index best. Written from the descriptors' own model notes and the §17.2
 * "Best for" lines, not from a benchmark we ran — the page says so where it uses this.
 */
const QUALITY_RANK: readonly string[] = [
  'bfl',
  'openai',
  'gemini',
  'fal',
  'stability',
  'replicate',
];

/** Cost ranking. `'openai-compatible'` is genuinely the cheapest: it is the user's own hardware. */
const COST_RANK: readonly string[] = [
  'openai-compatible',
  'gemini',
  'fal',
  'clipdrop',
  'removebg',
  'anthropic',
  'stability',
  'replicate',
  'bfl',
  'openai',
];

function rankIndex(rank: readonly string[], id: string): number {
  const index = rank.indexOf(id);
  // Unranked providers sort last rather than being dropped: a provider the table does not
  // mention is still a legitimate recommendation if it is the only one that does the job.
  return index === -1 ? rank.length : index;
}

/** Does this provider declare any of the capabilities the task needs? */
function servesTask(guide: ProviderGuide, task: TaskAnswer): boolean {
  const needed = TASK_CAPABILITIES[task];
  return needed.some((capability) => guide.descriptor.capabilities.includes(capability));
}

/** Score for question 1. A provider that cannot do the job at all is excluded upstream. */
function scoreTask(guide: ProviderGuide, task: TaskAnswer): number {
  const needed = TASK_CAPABILITIES[task];
  const held = guide.descriptor.capabilities.filter((c) => needed.includes(c)).length;
  // Covering every capability the task names beats covering one of two.
  return held * 10 - needed.length * 2;
}

/** Score for question 2. Higher is better, so ranks are inverted. */
function scorePriority(guide: ProviderGuide, priority: PriorityAnswer): number {
  const size = COST_RANK.length;
  switch (priority) {
    case 'cheapest':
      return size - rankIndex(COST_RANK, guide.slug);
    case 'best-quality':
      return size - rankIndex(QUALITY_RANK, guide.slug);
    case 'most-private':
      // Self-hosted wins outright; a hosted gateway keeps the image on someone else's machine.
      return guide.selfHosted ? 100 : 0;
    case 'easiest-setup':
      return Math.max(0, 12 - guide.setupMinutes);
  }
}

/** Score for question 3. */
function scoreAccounts(guide: ProviderGuide, accounts: readonly string[]): number {
  return accounts.includes(guide.slug) ? 25 : 0;
}

/** Candidates: providers that can actually do the task, most preferred first. */
function candidates(answers: ChooserAnswers): readonly ProviderGuide[] {
  return PROVIDER_GUIDES.filter((g) => servesTask(g, answers.task)).sort((a, b) => {
    const total =
      scoreTask(b, answers.task) -
      scoreTask(a, answers.task) +
      scorePriority(b, answers.priority) -
      scorePriority(a, answers.priority) +
      scoreAccounts(b, answers.accounts) -
      scoreAccounts(a, answers.accounts);
    if (total !== 0) return total;
    // Stable tie-break: §17.2's table order, so the output is deterministic.
    return PROVIDER_GUIDES.indexOf(a) - PROVIDER_GUIDES.indexOf(b);
  });
}

/** One sentence, written from the answers rather than from a template with the name slotted in. */
function reasonFor(
  guide: ProviderGuide,
  answers: ChooserAnswers,
  rank: number,
  accountBonus: boolean,
): string {
  const task =
    TASK_OPTIONS.find((o) => o.value === answers.task)?.label.toLowerCase() ?? answers.task;
  const priorityWord: Readonly<Record<PriorityAnswer, string>> = {
    cheapest: 'cheapest',
    'best-quality': 'highest-quality',
    'most-private': 'most private',
    'easiest-setup': 'quickest to set up',
  };
  const parts: string[] = [];
  if (rank === 0 && accountBonus) {
    parts.push(`You already have a ${guide.descriptor.name} account, and it does ${task}`);
  } else if (rank === 0) {
    parts.push(`It does ${task} and is the ${priorityWord[answers.priority]} of the options here`);
  } else if (accountBonus) {
    parts.push(`You already have a ${guide.descriptor.name} account, and it does ${task}`);
  } else {
    parts.push(`It does ${task} and is the ${priorityWord[answers.priority]} option here`);
  }
  if (guide.selfHosted) {
    parts.push('and your images never leave your machine');
  }
  return `${parts.join(', ')}.`;
}

/** Why an alternative is on the list, phrased as what makes it a different choice. */
function alternativeReasonFor(
  guide: ProviderGuide,
  pick: ProviderGuide,
  answers: ChooserAnswers,
): string {
  if (guide.selfHosted)
    return 'Nothing leaves your machine — worth it if privacy is the constraint.';
  if (answers.accounts.includes(guide.slug))
    return 'You already have an account here, so setup is shorter.';
  if (guide.setupMinutes < pick.setupMinutes) {
    return `Takes about ${guide.setupMinutes} minutes to set up, against ${pick.setupMinutes} for the recommendation.`;
  }
  if (guide.setupMinutes > pick.setupMinutes) {
    return `Slower to set up (about ${guide.setupMinutes} minutes), but it does things the recommendation does not.`;
  }
  const extra = guide.descriptor.capabilities.filter(
    (c) => !pick.descriptor.capabilities.includes(c),
  );
  if (extra.length > 0) {
    return `Also covers ${extra.slice(0, 2).join(' and ')}, which the recommendation does not.`;
  }
  return 'A different account and a different price point, if you would rather not mix providers.';
}

/**
 * The §17.2 output: one recommendation, exactly two alternatives.
 *
 * The shape of the result is the point. A user who answers three questions and gets a table back
 * has been handed the same decision with more rows, which is the failure §17.2 is written against.
 */
export function recommend(answers: ChooserAnswers): Recommendation {
  const ranked = candidates(answers);

  // No provider declares the capability. Rather than inventing a suggestion, say so — the
  // self-hosted adapter is the honest answer here, and it is in the list by construction, so
  // this branch means a future capability was added to `AiCapability` with no adapter behind it.
  if (ranked.length === 0) {
    throw new Error(`No registered provider declares the capabilities for task "${answers.task}".`);
  }

  const pick = ranked[0]!;
  const accountBonus = answers.accounts.includes(pick.slug);
  // Take the next two, but skip any duplicate of the pick (cannot happen with distinct entries,
  // and the filter documents the invariant the README's "plus two alternatives" depends on).
  const alternatives = ranked.slice(1, 3).filter((g) => g.slug !== pick.slug);

  return {
    pick,
    reason: reasonFor(pick, answers, 0, accountBonus),
    alternatives,
    alternativeReasons: alternatives.map((g) => alternativeReasonFor(g, pick, answers)),
  };
}

/** A neutral default used for the server-rendered, JavaScript-free first paint. */
export const DEFAULT_ANSWERS: ChooserAnswers = {
  task: 'generate',
  priority: 'best-quality',
  accounts: [],
};

/** Every task × priority pair, in a stable order. This is what the hub prerenders. */
export function allCombinations(): readonly { task: TaskAnswer; priority: PriorityAnswer }[] {
  return TASK_OPTIONS.flatMap((task) =>
    PRIORITY_OPTIONS.map((priority) => ({ task: task.value, priority: priority.value })),
  );
}

/**
 * The CSS that switches between prerendered outcomes, generated from the same array that renders
 * them.
 *
 * The hub ships no JavaScript, so the chooser cannot re-score on a click. Instead every task ×
 * priority outcome is rendered into the HTML and these rules reveal the matching one as the reader
 * changes the radios, using `:has()` on the form.
 *
 * Generating the rules from `allCombinations()` rather than writing them by hand is the point: the
 * selector for a combination and the block for that combination come from one array, so a new
 * option cannot render a block with no rule, or a rule with no block.
 *
 * The account question needs a rule per (combination × provider), because "you already have an
 * account here" changes the explanation for one specific provider. That is the product of the two
 * lists rather than a full cross-product, and each rule names the provider it refers to.
 */
export function chooserStyleSheet(
  combinations: readonly { task: TaskAnswer; priority: PriorityAnswer }[] = allCombinations(),
  providers: readonly { value: string; label: string }[] = ACCOUNT_PROVIDERS,
): string {
  const rules: string[] = [];

  // Every outcome is rendered; only the default is visible until a rule matches.
  rules.push('.chooser-outcome{display:none}');
  rules.push(
    `.chooser${DEFAULT_COMBINATION_SELECTOR}{.chooser-outcome--${DEFAULT_ANSWERS.task}--${DEFAULT_ANSWERS.priority}{display:block}}`,
  );

  for (const { task, priority } of combinations) {
    const selector = `.chooser:has(input[name="task"][value="${task}"]:checked):has(input[name="priority"][value="${priority}"]:checked)`;
    // The default combination's outcome rule is emitted above, and a duplicate adds nothing. Only
    // that rule is skipped -- its per-provider notes still need rules, or the default outcome's
    // "you already have an account here" note could never appear.
    if (task !== DEFAULT_ANSWERS.task || priority !== DEFAULT_ANSWERS.priority) {
      rules.push(`${selector} .chooser-outcome--${task}--${priority}{display:block}`);
    }

    for (const provider of providers) {
      rules.push(
        `${selector}:has(input[name="account"][value="${provider.value}"]:checked) .chooser-owned--${task}--${priority}--${provider.value}{display:block}`,
      );
    }
  }
  return rules.join('\n');
}

/** The `:has()` selector for the default answer pair, so the page renders with an answer shown. */
const DEFAULT_COMBINATION_SELECTOR = `:has(input[name="task"][value="${DEFAULT_ANSWERS.task}"]:checked):has(input[name="priority"][value="${DEFAULT_ANSWERS.priority}"]:checked)`;
