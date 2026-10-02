/**
 * P5-17 — the curated-versus-live model-list diff (README §22.7 step 2).
 *
 * §22.7 says "runs `listModels()` and diffs against the hard-coded fallback list, opening an issue on
 * drift". The interesting part is what "drift" means, because the two sides are not the same kind of
 * thing:
 *
 * - The **curated fallback list** is what `ProviderDescriptor.models` holds. It is hand-maintained,
 *   ordered, annotated with `⚠ VERIFY` markers, and it is what §17.2's chooser renders.
 * - The **discovered list** is whatever `listModels()` returns. In this repository almost every
 *   adapter returns its curated list unchanged — these are curated lists by design, and
 *   `openai-compatible` is the one adapter that genuinely queries a server.
 *
 * So the diff has to report three outcomes without conflating them, and the important asymmetry is:
 *
 * - A **removal** is a defect. The chooser is offering a model the provider no longer serves, so a
 *   user's selection fails on click. That is breakage of the product's promise, not of the provider.
 * - An **addition** is not a defect. It means the provider offers something the curated list does not
 *   mention. Widening the curated list is a review decision — someone has to decide whether the new
 *   model should be offered at all — not a bug.
 * - **No change** is the desired steady state, and for the nine curated adapters it is the *only*
 *   possible outcome. Reporting "no drift" for those is correct, not a gap in the check.
 *
 * Calling a curated adapter's unchanged list "verified against the live API" would overstate what
 * happened: nothing was fetched. {@link diffModelLists} therefore takes the caller-declared source so
 * the report can say `curated` where that is the truth, and the diff's `detail` says which.
 */

import type { ModelDescriptor } from './ai-types.js';
import type { ModelListDiff } from './types.js';

/** Where a discovered list came from, so the report never implies a fetch that did not happen. */
export type ModelListSource =
  /** The adapter returned its own descriptor list — no network call. */
  | 'curated'
  /** The adapter queried the provider and returned what it found. */
  | 'discovered';

/** The inputs to a comparison, plus what to say about a comparison that could not be made. */
export interface ModelDiffInput {
  readonly provider: string;
  /** Ids from `ProviderDescriptor.models`. */
  readonly curated: readonly ModelDescriptor[];
  /** Ids returned by `listModels()`, or `undefined` when the call failed or was not run. */
  readonly discovered?: readonly ModelDescriptor[] | undefined;
  readonly source: ModelListSource;
  /** Why there is no discovered list. Required when `discovered` is absent, so `unknown` is never bare. */
  readonly unavailableReason?: string;
}

/**
 * Compare a curated list against a discovered one.
 *
 * When there is no discovered list the result is a `fail` — not an `unknown` masquerading as a pass,
 * and not a silent skip. §4.9's rule is that a placeholder is never reported as success, and a model
 * list that could not be checked is exactly that.
 */
export function diffModelLists(input: ModelDiffInput): ModelListDiff {
  const curatedIds = input.curated.map((model) => model.id);

  if (input.discovered === undefined) {
    return {
      provider: input.provider,
      status: 'fail',
      removed: [],
      added: [],
      detail:
        input.unavailableReason ??
        'listModels() did not return a model list, so the curated list could not be checked',
      drift: true,
    };
  }

  const discoveredIds = input.discovered.map((model) => model.id);
  const discoveredSet = new Set(discoveredIds);
  const curatedSet = new Set(curatedIds);

  const removed = curatedIds.filter((id) => !discoveredSet.has(id));
  const added = discoveredIds.filter((id) => !curatedSet.has(id));

  if (removed.length === 0 && added.length === 0) {
    return {
      provider: input.provider,
      status: 'pass',
      removed: [],
      added: [],
      detail:
        input.source === 'curated'
          ? `the curated list matches the adapter's own ${curatedIds.length} model(s); no live catalogue was queried for this provider`
          : `the curated list matches the ${discoveredIds.length} model(s) discovered from the provider`,
      drift: false,
    };
  }

  // A removal is the defect. An addition is a review signal that rides along with it rather than a
  // reason to call the provider broken on its own.
  const parts: string[] = [];
  if (added.length > 0) parts.push(`added: ${added.join(', ')}`);
  if (removed.length > 0) parts.push(`removed: ${removed.join(', ')}`);
  return {
    provider: input.provider,
    status: removed.length > 0 ? 'fail' : 'skipped',
    removed,
    added,
    detail: `${input.source === 'curated' ? 'curated' : 'discovered'} model list differs — ${parts.join('; ')}`,
    drift: removed.length > 0,
  };
}
