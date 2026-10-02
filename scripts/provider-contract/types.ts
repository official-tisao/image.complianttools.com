/**
 * P5-17 — the live provider contract job's result vocabulary (README §22.7).
 *
 * §22.7 asks the nightly job to "record the outcome" of each check, and the whole point of §4.9 is
 * that a placeholder must never be reported as success. That forces one uncomfortable requirement:
 * a single boolean cannot carry the answer. Five situations are genuinely different, and collapsing
 * any two of them is how a nightly job starts lying:
 *
 * | Outcome | What it means | Is that the provider's fault? |
 * | --- | --- | --- |
 * | `pass` | The check ran and the provider did what the descriptor claims | no |
 * | `fail` | The check ran and the provider did not | yes |
 * | `unconfigured` | No credential was supplied, so nothing was asked | no |
 * | `unsupported` | The adapter does not implement this capability at all | no |
 * | `skipped` | Deliberately not run, with the reason recorded | no |
 *
 * `unconfigured` is the one most easily lost. A missing repository secret and a provider outage both
 * make `test()` fail, and a job that reports them identically will file a "provider is broken"
 * issue the first time somebody forgets to add a secret. The runner therefore checks configuration
 * *before* calling the adapter, so absence is never reported as failure.
 *
 * These types are shared by the runner, both report formats, and the GitHub decision layer, so a
 * status cannot be spelled one way in JSON and another in Markdown.
 */

/** The five outcomes. Every check in the job resolves to exactly one. */
export type CheckStatus = 'pass' | 'fail' | 'unconfigured' | 'unsupported' | 'skipped';

/** Which stage of §22.7 a check belongs to. */
export type CheckKind = 'test' | 'listModels' | 'capability' | 'browserDirect';

/**
 * Why the browser could not answer.
 *
 * `unsupported` here is a *browser* limitation, not a provider one: Chromium in CI cannot reach a
 * provider running on the runner's own `localhost`, which is what `openai-compatible` points at.
 * Reporting that as "unknown" would be honest but useless; reporting it as "no" would be a lie that
 * the descriptor's own note explicitly warns against.
 */
export type BrowserProbeUnavailableReason =
  'context-unavailable' | 'origin-unreachable' | 'unsupported-network';

/** What one check found. `detail` is always redacted before it reaches a report. */
export interface CheckResult {
  readonly provider: string;
  readonly kind: CheckKind;
  readonly status: CheckStatus;
  /** Short sentence for the human report. Never contains a credential. */
  readonly detail: string;
  /** Capabilities involved, for `kind: 'capability'`. */
  readonly capability?: string;
  /** Milliseconds spent. Recorded per provider so a slow endpoint is visible. */
  readonly durationMs?: number;
  /** HTTP status, when the provider answered at all. */
  readonly httpStatus?: number;
  /** Present only for `kind: 'browserDirect'`. */
  readonly browserOutcome?: BrowserOutcome;
}

/** How a browser-issued request came back. */
export interface BrowserOutcome {
  /**
   * Whether the provider's CORS policy let a real browser reach it.
   *
   * `unknown` is a first-class value, not a failure to classify. §15.2's whole argument is that a
   * guess is worse than an admission, so the job is allowed to return "could not tell" when the
   * browser never got a verdict (see {@link BrowserProbeUnavailableReason}).
   */
  readonly browserDirect: 'yes' | 'yes-with-header' | 'no' | 'unknown';
  /** The request actually issued, with any credential already replaced. */
  readonly redactedRequest?: string;
  /** HTTP status, or the browser-level failure that prevented one. */
  readonly detail: string;
  /** Set when no verdict could be reached; `browserDirect` is then `unknown`. */
  readonly unavailable?: BrowserProbeUnavailableReason;
}

/**
 * The model-list comparison for one provider (README §22.7 step 2).
 *
 * Every adapter in this repository returns its curated descriptor list from `listModels()` — they
 * are curated lists by design, and `openai-compatible` is the one that genuinely discovers. So a
 * "drift" here is not automatically a provider's fault: `openai-compatible`'s discovered list is
 * supposed to differ from its empty fallback, and a curated provider whose list is unchanged is
 * exactly what "still accurate" looks like. The runner reports the three cases separately for that
 * reason.
 */
export interface ModelListDiff {
  readonly provider: string;
  readonly status: CheckStatus;
  /** Ids in the curated fallback list that the live call did not return. */
  readonly removed: readonly string[];
  /** Ids the live call returned that the curated fallback list does not contain. */
  readonly added: readonly string[];
  /** Why the comparison could not be made, when it could not be. */
  readonly detail: string;
  /**
   * Whether this difference is a defect.
   *
   * A removal from a curated list is the case that bites: the fallback offers a model the provider
   * no longer serves, so §17.2's chooser would hand a user a selection that fails on click. An
   * addition is reported but is not by itself breakage — it is the signal that the curated list is
   * worth widening, which is a review decision rather than a bug.
   */
  readonly drift: boolean;
}

/** A billable operation the job considered, and what it decided to do about it. */
export interface CapabilityProbe {
  readonly provider: string;
  readonly capability: string;
  readonly status: CheckStatus;
  readonly detail: string;
  /** The most this operation could cost, as a decimal string. `'0.00'` for free calls. */
  readonly maxCostUsd: string;
  /**
   * The cost actually booked, as a decimal string.
   *
   * Always a real number from the local price table or the provider's own usage fields — never an
   * optimistic zero for a call that may bill. `'0.00'` is used only where the operation is known to
   * be free, and the runner refuses to run an operation whose cost cannot be bounded.
   */
  readonly spentUsd: string;
}

/** Everything one provider contributed to a run. */
export interface ProviderReport {
  readonly id: string;
  readonly name: string;
  /** The provider's own site, for the generated table to link to. */
  readonly homepage: string;
  /** The capabilities its descriptor declares. Copied, so the report stands on its own. */
  readonly capabilities: readonly string[];
  /** Model ids from the curated fallback list. */
  readonly modelIds: readonly string[];
  /**
   * The `browserDirect` value the adapter source declares right now.
   *
   * Carried so the generated document can print what the repository claims when a provider was not
   * probed, and so a diff can show that a value changed rather than only that one was observed.
   */
  readonly browserDirectInSource?: 'yes' | 'yes-with-header' | 'no' | 'unknown';
  /** The raw statuses, in the order they ran, for the machine-readable report. */
  readonly checks: readonly CheckResult[];
  readonly models?: ModelListDiff;
  readonly capabilityProbes: readonly CapabilityProbe[];
  /** Sum of `spentUsd` across this provider's probes. */
  readonly spentUsd: string;
  /**
   * Whether this provider should raise a breakage issue.
   *
   * Only a `fail` on `kind: 'test'` counts. `listModels` drift is a separate, lower-severity
   * signal, and a `unconfigured` provider is not a broken provider.
   */
  readonly broken: boolean;
  readonly brokenReason?: string;
}

/** The whole run. This is the machine-readable report, verbatim. */
export interface ContractRunReport {
  /** ISO 8601, or `'unrecorded'` when the clock is deliberately absent (deterministic tests). */
  readonly generatedAt: string;
  /** Free-text note carried into every artifact, e.g. which providers had no secret. */
  readonly mode: 'live' | 'deterministic';
  readonly providers: readonly ProviderReport[];
  /** Sum of every provider's `spentUsd`. The job never exceeds the cap; this is what it used. */
  readonly totalSpentUsd: string;
  /** The cap the run was held to. */
  readonly spendCapUsd: string;
  /** Providers with no credential configured, listed so an issue never mistakes them for breakage. */
  readonly unconfiguredProviders: readonly string[];
  /** Providers whose `test()` failed. The breakage-issue trigger set. */
  readonly brokenProviders: readonly string[];
  /** Providers whose model list moved. The drift-issue trigger set. */
  readonly driftedProviders: readonly string[];
  /** Whether anything changed that the PR step should commit. */
  readonly hasGeneratedDrift: boolean;
}
