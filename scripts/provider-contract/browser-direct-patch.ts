/**
 * P5-17 — writing an observed `browserDirect` value back into the adapter source.
 *
 * §22.7 step 4 says the job "updates each adapter's `browserDirect` field". The value lives in a
 * TypeScript object literal in `packages/engine/src/ai/adapters/*.ts`, so updating it means editing
 * source. That is a risk in its own right, and every decision here is about containing it.
 *
 * **Only the browser result may write it.** The patcher's input is a `BrowserOutcome`, which by
 * construction in {@link ./browser-probe.ts} can only come from a real browser context. There is no
 * parameter through which a Node-side status could arrive. That is the rule the whole module exists
 * to enforce, and it is why the signature does not accept a `ProviderReport` or a `fetch` result.
 *
 * **Only a probe that reached a verdict writes anything.** An `unknown` with an `unavailable` reason
 * — the runner had no network, or the provider is on a network CI cannot reach — leaves the source
 * untouched. Writing `unknown` over a declared `yes` because a probe failed to run would replace a
 * checked claim with an unchecked one, which is strictly worse than leaving it alone.
 *
 * **The edit is textual and anchored.** Each adapter's line is replaced in place by matching the
 * `browserDirect:` property on its own line and swapping the string literal. Nothing is reformatted,
 * re-indented, or re-serialised: a nightly job that reformatted nine adapter files would bury a real
 * change in noise, and reviewers would learn to skip the diff. Because the replacement is anchored to
 * a unique property name and preserves the original leading whitespace, the output is byte-identical
 * when nothing changed.
 *
 * The note below the value is updated too, but only when the note says one of the specific things
 * this module knows how to correct. A note carrying real information — `openai-compatible`'s long
 * explanation that the answer depends on the user's own server — is left exactly as written.
 */

/** The four values a descriptor may carry. Mirrors `ProviderDescriptor['browserDirect']`. */
export type BrowserDirectValue = 'yes' | 'yes-with-header' | 'no' | 'unknown';

/** One provider's adapter file, and the change the browser result implies for it. */
export interface BrowserDirectUpdate {
  readonly providerId: string;
  /** Absolute path to the adapter source file. */
  readonly filePath: string;
  /** What the source declares today. */
  readonly declared: BrowserDirectValue;
  /** What the browser observed. */
  readonly observed: BrowserDirectValue;
  /** True only when the browser actually reached a verdict, with no `unavailable` reason. */
  readonly verified: boolean;
  /** HTTP status of the browser request, when there was one. */
  readonly httpStatus?: number;
}

/** What a patch pass did, or declined to do. */
export interface PatchResult {
  readonly providerId: string;
  /** Whether the source was rewritten. */
  readonly changed: boolean;
  /** The value in the source afterwards. */
  readonly valueAfter: BrowserDirectValue;
  /** Why nothing was written, when nothing was. */
  readonly reason?: string;
  /** The file that was rewritten. Absent when `changed` is false. */
  readonly filePath?: string;
  /** The full new file content, when rewritten. Absent when `changed` is false. */
  readonly source?: string;
}

/** The note text for a value the job has now verified. Written to be true of the observation. */
const VERIFIED_NOTE: Readonly<Record<Exclude<BrowserDirectValue, 'unknown'>, string>> = {
  yes: 'Verified by the P5-17 nightly contract job from a real browser context.',
  'yes-with-header':
    'Verified by the P5-17 nightly contract job from a real browser context; the call needs the header below.',
  no: 'Blocked from a real browser by the P5-17 nightly contract job; a relay is required (§15.3).',
};

/**
 * Notes this module is willing to replace.
 *
 * Each is a placeholder written before any provider was verified, and replacing it is the point of
 * the job. A note not in this list is treated as real information and preserved: `openai-compatible`
 * carries a paragraph explaining that the answer depends on the user's own server, and replacing that
 * with a one-liner would delete something true and useful.
 */
const REPLACEABLE_NOTE_PREFIXES: readonly string[] = [
  'CORS not verified.',
  'Requires the x-goog-api-key header; live CORS not verified here.',
  'Requires the X-Api-Key request header; live CORS not verified here.',
  'Requires the x-api-key request header; live CORS not verified here.',
  'Requires Authorization: Bearer header.',
  'Requires header.',
  'Browser-direct with Authorization: Key header.',
];

/**
 * Whether a note is one this module may rewrite.
 *
 * Exported so the caller can report, before writing, whether a note was going to be replaced or left
 * alone — a value that changed while its explanatory note did not is worth a reviewer's attention.
 */
export function noteIsReplaceable(note: string): boolean {
  return REPLACEABLE_NOTE_PREFIXES.some((prefix) => note.startsWith(prefix));
}

/**
 * Rewrite one adapter's `browserDirect` line, if the observation warrants it.
 *
 * Pure: takes the file's text and returns the new text without touching the filesystem, so a caller
 * can decide what to write and a test can assert on the result. The returned {@link PatchResult} is
 * absent of `source` when nothing changed, which is the signal the caller uses to decide that a file
 * was not rewritten at all.
 */
export function patchBrowserDirectSource(source: string, update: BrowserDirectUpdate): PatchResult {
  const unchanged = (reason: string): PatchResult => ({
    providerId: update.providerId,
    changed: false,
    valueAfter: update.declared,
    reason,
  });

  if (!update.verified || update.observed === 'unknown') {
    return unchanged(
      'the browser did not reach a verdict for this provider, so the value in the source is left as declared',
    );
  }
  if (update.observed === update.declared) {
    return unchanged(`the source already declares \`${update.declared}\``);
  }

  const valueLine = /^([ \t]*)browserDirect:(\s*)'[^']*',?$/mu.exec(source);
  if (!valueLine) {
    return unchanged('no single-line `browserDirect:` property was found to rewrite');
  }
  const [matchedLine, indent = '', gap = ''] = valueLine;

  // Preserve everything except the literal itself, so indentation, spacing and a trailing comma all
  // survive untouched.
  const replacementLine = `${indent}browserDirect:${gap}'${update.observed}',`;
  let next = source.replace(matchedLine, replacementLine);

  // The note is only touched when it is a recognised pre-verification placeholder, and only for a
  // value that has actually been observed.
  const noteLine = /^([ \t]*)browserDirectNote:(\s*)'([^']*)',?$/mu.exec(next);
  if (noteLine && noteIsReplaceable(noteLine[3] ?? '')) {
    const note = VERIFIED_NOTE[update.observed];
    const [, noteIndent = '', noteGap = ''] = noteLine;
    next = next.replace(noteLine[0], `${noteIndent}browserDirectNote:${noteGap}'${note}',`);
  }

  return {
    providerId: update.providerId,
    changed: next !== source,
    valueAfter: update.observed,
    filePath: update.filePath,
    source: next,
  };
}

/** The patch result for a provider whose browser observation was not usable. */
export function skipBrowserDirectUpdate(update: BrowserDirectUpdate, reason: string): PatchResult {
  return {
    providerId: update.providerId,
    changed: false,
    valueAfter: update.declared,
    reason,
  };
}
