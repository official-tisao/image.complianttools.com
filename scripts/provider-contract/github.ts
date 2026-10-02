/**
 * P5-17 — what the job decides to do about GitHub (README §22.7 steps 2 and 5).
 *
 * §22.7: "opens a PR when anything changed, and files an issue when a provider breaks", and step 2
 * adds "opening an issue on drift". Two outputs with different urgency, and this module exists to
 * decide them without performing either — so the decision can be tested exhaustively and so the
 * workflow steps that act on it stay three lines of shell.
 *
 * The decisions, and the reasoning behind each:
 *
 * | Condition | Action | Why |
 * | --- | --- | --- |
 * | Anything generated changed | open or update a PR | The generated files are the deliverable; a reviewer merges them |
 * | A provider's `test()` failed | file or update an issue | §22.7: breakage is an issue |
 * | A curated model was removed | file or update a drift issue | A chooser entry now fails on click |
 * | A provider had no credential | neither | Not breakage — see below |
 * | Nothing at all happened | neither | An empty PR or issue trains people to ignore both |
 *
 * **Absence is not breakage.** This is the mistake the module is built to prevent. A provider with no
 * repository secret and a provider that is genuinely down both end with a failing check, and a job that
 * cannot tell them apart will file "fal.ai appears to be broken" the first time somebody adds a new
 * provider without its secret. `unconfiguredProviders` is therefore excluded from the breakage set
 * explicitly, and {@link decideGithubActions} refuses to act on a provider it did not contact.
 *
 * **A drift issue is lower severity than a breakage issue**, and they are kept in separate lists so
 * one cannot mask the other: a provider that both broke and lost a model produces two findings, not
 * one that mentions both.
 *
 * Issue bodies are built from the redacted report only. Nothing here reads an environment variable or
 * a secret — the credentials reached the runner and were redacted at the logger, long before this.
 */

import type { ContractRunReport, ProviderReport } from './types.js';
import { summarize } from './report.js';

/** The pull request the job opens, or `undefined` when there is nothing to open. */
export interface PullRequestPlan {
  readonly action: 'open-or-update-pr';
  readonly branch: string;
  readonly title: string;
  readonly body: string;
  /** Which generated files moved. A PR is only opened when this is non-empty. */
  readonly changedFiles: readonly string[];
  /** Never set — asserted in the tests so a secret cannot reach a PR body through this path. */
  readonly commits: readonly string[];
}

/** An issue the job files, or `undefined` when there is no finding worth interrupting someone for. */
export interface IssuePlan {
  readonly action: 'file-issue';
  /** Stable slug, so a re-run updates the existing issue instead of filing a duplicate. */
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  /** Providers this issue covers. */
  readonly providers: readonly string[];
  /** Distinguishes a breakage issue from a drift issue; both live in the same label namespace. */
  readonly kind: 'breakage' | 'model-drift';
}

export interface GithubDecision {
  readonly pullRequest?: PullRequestPlan;
  readonly breakageIssue?: IssuePlan;
  readonly driftIssue?: IssuePlan;
  /** Providers deliberately not acted on, with the reason. Carried into the report for review. */
  readonly notActedOn: readonly { readonly provider: string; readonly reason: string }[];
}

/**
 * Decide what the job should do on GitHub.
 *
 * `changedFiles` is what the generated-artifact step found on disk. An empty list with a real drift is
 * a contradiction, so it is treated as "nothing to open" and the drift is reported instead of being
 * silently dropped: the job regenerates the catalogue and the document before this call, so an empty
 * list genuinely means there was nothing to change.
 */
export function decideGithubActions(
  report: ContractRunReport,
  changedFiles: readonly string[],
): GithubDecision {
  const notActedOn: { provider: string; reason: string }[] = [];

  // A provider that was never contacted cannot be reported as broken or as drifted, and saying so
  // explicitly keeps the exclusion auditable rather than incidental.
  const contacted = new Set<string>();
  const unconfigured = new Set(report.unconfiguredProviders);
  for (const provider of report.providers) {
    if (unconfigured.has(provider.id)) continue;
    contacted.add(provider.id);
  }

  const broken: ProviderReport[] = [];
  const drifted: ProviderReport[] = [];
  for (const provider of report.providers) {
    if (unconfigured.has(provider.id)) {
      notActedOn.push({
        provider: provider.id,
        reason: 'no credential was configured, so nothing was asked and nothing was learned',
      });
      continue;
    }
    if (!contacted.has(provider.id)) {
      notActedOn.push({ provider: provider.id, reason: 'the job did not contact this provider' });
      continue;
    }
    if (provider.broken) broken.push(provider);
    // Only a *removal* is drift in the sense §22.7 means. An addition is a review suggestion, and
    // filing an issue for it would train people to ignore drift issues.
    if (provider.models?.drift) drifted.push(provider);
  }

  const pullRequest =
    changedFiles.length > 0
      ? {
          action: 'open-or-update-pr' as const,
          branch: 'p5-17/provider-contract',
          title: `chore(providers): refresh generated provider data — ${summarize(report)}`,
          body: renderPullRequestBody(report, changedFiles),
          changedFiles: [...changedFiles],
          commits: [],
        }
      : undefined;

  const breakageIssue =
    broken.length > 0
      ? {
          action: 'file-issue' as const,
          slug: 'p5-17-provider-breakage',
          title: `[p5-17] ${broken.length} provider(s) failing the live contract check`,
          body: renderIssueBody(report, broken, 'breakage'),
          providers: broken.map((provider) => provider.id),
          kind: 'breakage' as const,
        }
      : undefined;

  const driftIssue =
    drifted.length > 0
      ? {
          action: 'file-issue' as const,
          slug: 'p5-17-model-drift',
          title: `[p5-17] curated model list differs from ${drifted.length} provider(s)`,
          body: renderIssueBody(report, drifted, 'model-drift'),
          providers: drifted.map((provider) => provider.id),
          kind: 'model-drift' as const,
        }
      : undefined;

  return {
    ...(pullRequest ? { pullRequest } : {}),
    ...(breakageIssue ? { breakageIssue } : {}),
    ...(driftIssue ? { driftIssue } : {}),
    notActedOn,
  };
}

/**
 * The PR body.
 *
 * Leads with what changed and why it is safe to merge, because a PR opened by a nightly job is
 * reviewed by someone who did not watch the run. The note that the job is informational belongs here:
 * a reader should understand that merging this does not gate anything and does not mark the provider
 * as verified for users.
 */
function renderPullRequestBody(report: ContractRunReport, changedFiles: readonly string[]): string {
  const lines: string[] = [];
  lines.push('Opened by the nightly live AI-provider contract job (P5-17, README §22.7).');
  lines.push('');
  lines.push(`Run summary: ${summarize(report)}.`);
  lines.push('');
  lines.push('### Files regenerated');
  lines.push('');
  for (const file of changedFiles) lines.push(`- \`${file}\``);
  lines.push('');
  lines.push('### What drove the change');
  lines.push('');
  for (const provider of report.providers) {
    const browser = provider.checks.find((check) => check.kind === 'browserDirect');
    const modelNote = provider.models
      ? provider.models.added.length > 0 || provider.models.removed.length > 0
        ? `model list changed (+${provider.models.added.length}/−${provider.models.removed.length})`
        : 'model list unchanged'
      : 'model list not checked';
    const corsNote = browser?.browserOutcome
      ? `browserDirect \`${browser.browserOutcome.browserDirect}\`${
          browser.browserOutcome.unavailable ? ' (unverified)' : ''
        }`
      : 'browserDirect not probed';
    lines.push(
      `- **${provider.name}** — \`test()\` ${statusWord(provider)}, ${modelNote}, ${corsNote}.`,
    );
  }
  lines.push('');
  if (report.brokenProviders.length > 0) {
    lines.push(
      `> ${report.brokenProviders.join(', ')} failed \`test()\`. An issue has been filed for that ` +
        'separately; this PR is only the regenerated data.',
    );
    lines.push('');
  }
  lines.push(
    'This job is informational and does not gate merges. The `browserDirect` values below come from a ' +
      'real browser context in this run, not from a Node-side request, and a provider whose CORS ' +
      'posture could not be reached is left at its declared value rather than being guessed at.',
  );
  return lines.join('\n');
}

/** The issue body, for either kind. */
function renderIssueBody(
  report: ContractRunReport,
  providers: readonly ProviderReport[],
  kind: 'breakage' | 'model-drift',
): string {
  const lines: string[] = [];
  lines.push(
    kind === 'breakage'
      ? 'Filed by the nightly live AI-provider contract job (P5-17, README §22.7 step 5).'
      : 'Filed by the nightly live AI-provider contract job (P5-17, README §22.7 step 2).',
  );
  lines.push('');
  lines.push(`Run: ${report.generatedAt} — ${summarize(report)}.`);
  lines.push('');
  if (kind === 'breakage') {
    lines.push(
      'These providers authenticated and then did not behave as their descriptor claims. This is ' +
        'distinct from a provider having no credential configured, which the job reports separately ' +
        'and does not file here.',
    );
  } else {
    lines.push(
      "The curated fallback model list offers a model the provider no longer returns. §17.2's chooser " +
        'renders that list, so a user can currently select a model that fails when they use it.',
    );
  }
  lines.push('');
  for (const provider of providers) {
    lines.push(`## ${provider.name} (\`${provider.id}\`)`);
    lines.push('');
    for (const check of provider.checks) {
      lines.push(`- **${check.kind}** — ${check.status}: ${check.detail}`);
    }
    if (provider.models) {
      lines.push(`- **model list** — ${provider.models.status}: ${provider.models.detail}`);
      if (provider.models.removed.length > 0) {
        lines.push(`  - removed: ${provider.models.removed.map((id) => `\`${id}\``).join(', ')}`);
      }
      if (provider.models.added.length > 0) {
        lines.push(`  - added: ${provider.models.added.map((id) => `\`${id}\``).join(', ')}`);
      }
    }
    lines.push('');
  }
  if (report.unconfiguredProviders.length > 0) {
    lines.push('### Not covered by this issue');
    lines.push('');
    lines.push(
      `These had no credential configured and were never contacted, so nothing was learned about ` +
        `them either way: ${report.unconfiguredProviders.join(', ')}.`,
    );
    lines.push('');
  }
  lines.push(
    'No credential appears in this issue: the job redacts every value it handles before writing it ' +
      'anywhere.',
  );
  return lines.join('\n');
}

/** `test()`'s status in words, for a prose sentence. */
function statusWord(provider: ProviderReport): string {
  const test = provider.checks.find((check) => check.kind === 'test');
  return test ? test.status : 'was not run';
}
