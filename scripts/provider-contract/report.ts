/**
 * P5-17 — the two report formats the contract job writes (README §22.7).
 *
 * §22.7 calls the job "non-blocking, reports", so the report *is* the deliverable; the job's exit
 * code is secondary. Two formats, because they are read by different things: the JSON is consumed by
 * the workflow's later steps (the PR/issue decisions) and by anyone diffing two nights, and the
 * Markdown is what a human reads in the Actions summary, in a PR body, or in an issue.
 *
 * The constraint that shapes both is that **the five outcomes must stay distinguishable in both
 * formats**. A report that renders `unconfigured` and `fail` the same way — both "did not pass" — is
 * how a nightly job ends up filing a "Stability is broken" issue on the night somebody forgot to add
 * a repository secret. Every status therefore gets its own label and its own glyph, and the summary
 * counts each one separately rather than collapsing them into a pass rate.
 *
 * Spend is reported per provider and in total, per §22.7. It is shown whether or not anything ran,
 * so a night on which the job spent nothing still visibly says so rather than omitting the section.
 *
 * Both renderers are pure and take the report as their only input: they never read a clock, never
 * read an environment variable, and never touch the filesystem. That is what makes the byte-for-byte
 * comparisons in the tests possible, and it is why nothing here can leak a credential — the report
 * it is handed has already been through the runner's redacting logger.
 */

import type { CheckStatus, ContractRunReport, ProviderReport } from './types.js';

/**
 * The label and glyph for each status.
 *
 * Distinct on purpose. `unconfigured` and `skipped` are both "nothing was proven", and collapsing
 * them loses the difference between "we had no key" (a repository setup problem) and "we chose not
 * to run this" (a deliberate decision recorded in the job). `unsupported` is its own case again: the
 * adapter has no implementation, which is a statement about this codebase, not about the provider.
 */
const STATUS_DISPLAY: Readonly<
  Record<CheckStatus, { readonly label: string; readonly glyph: string }>
> = {
  pass: { label: 'pass', glyph: '✅' },
  fail: { label: 'fail', glyph: '❌' },
  unconfigured: { label: 'unconfigured', glyph: '⚪' },
  unsupported: { label: 'unsupported', glyph: '🚫' },
  skipped: { label: 'skipped', glyph: '⏭️' },
};

/** A one-line summary of the run, for a PR title or an issue subject. */
export function summarize(report: ContractRunReport): string {
  const counts = countStatuses(report);
  const passed = counts.pass;
  const failed = counts.fail;
  const parts = [`${passed} passing`, `${failed} failing`];
  if (counts.unconfigured > 0) parts.push(`${counts.unconfigured} unconfigured`);
  if (counts.unsupported > 0) parts.push(`${counts.unsupported} unsupported`);
  if (counts.skipped > 0) parts.push(`${counts.skipped} skipped`);
  parts.push(`spent $${report.totalSpentUsd} of $${report.spendCapUsd}`);
  return parts.join(', ');
}

/** Total checks per status across the whole run. */
export function countStatuses(report: ContractRunReport): Record<CheckStatus, number> {
  const counts: Record<CheckStatus, number> = {
    pass: 0,
    fail: 0,
    unconfigured: 0,
    unsupported: 0,
    skipped: 0,
  };
  for (const provider of report.providers) {
    for (const check of provider.checks) counts[check.status] += 1;
  }
  return counts;
}

/** The machine-readable report. Stable key order so two nights diff cleanly. */
export function renderJsonReport(report: ContractRunReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * The human-readable report.
 *
 * Intended for `GITHUB_STEP_SUMMARY`, where GitHub renders the GFM table. Kept as a single
 * self-contained string rather than assembled from `console.log` calls so it can be compared exactly
 * in a test and posted verbatim into a PR or issue body.
 */
export function renderMarkdownReport(report: ContractRunReport): string {
  const counts = countStatuses(report);
  const lines: string[] = [];

  lines.push('## AI provider contract (P5-17)');
  lines.push('');
  lines.push(`- **Mode:** ${report.mode}`);
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push(
    `- **Checks:** ${STATUS_DISPLAY.pass.glyph} ${counts.pass} pass · ` +
      `${STATUS_DISPLAY.fail.glyph} ${counts.fail} fail · ` +
      `${STATUS_DISPLAY.unconfigured.glyph} ${counts.unconfigured} unconfigured · ` +
      `${STATUS_DISPLAY.unsupported.glyph} ${counts.unsupported} unsupported · ` +
      `${STATUS_DISPLAY.skipped.glyph} ${counts.skipped} skipped`,
  );
  lines.push(`- **Spend:** $${report.totalSpentUsd} of the $${report.spendCapUsd} hard cap`);
  lines.push('');

  if (report.unconfiguredProviders.length > 0) {
    lines.push(
      `> ${report.unconfiguredProviders.length} provider(s) had no credential configured and were not ` +
        'contacted: ' +
        `${report.unconfiguredProviders.join(', ')}. A missing secret is not provider breakage.`,
    );
    lines.push('');
  }

  lines.push('### Per provider');
  lines.push('');
  lines.push('| Provider | `test()` | Models | Capabilities | `browserDirect` | Spent |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const provider of report.providers) {
    lines.push(
      `| ${provider.name} (\`${provider.id}\`) | ${statusCell(provider, 'test')} | ` +
        `${modelsCell(provider)} | ${capabilityCell(provider)} | ${browserDirectCell(provider)} | ` +
        `$${provider.spentUsd} |`,
    );
  }
  lines.push('');

  lines.push('### Detail');
  lines.push('');
  for (const provider of report.providers) {
    lines.push(`#### ${provider.name} (\`${provider.id}\`)`);
    lines.push('');
    for (const check of provider.checks) {
      const capability = check.capability ? ` [${check.capability}]` : '';
      const status = check.httpStatus ? ` (HTTP ${check.httpStatus})` : '';
      lines.push(
        `- ${STATUS_DISPLAY[check.status].glyph} **${check.kind}**${capability} — ` +
          `${STATUS_DISPLAY[check.status].label}${status}: ${check.detail}`,
      );
    }
    if (provider.models) {
      const { models } = provider;
      const label = STATUS_DISPLAY[models.status].label;
      lines.push(`- Model list — **${label}**: ${models.detail}`);
    }
    lines.push('');
  }

  lines.push('### How to read this');
  lines.push('');
  lines.push('- **pass** — the check ran and the provider did what its descriptor claims.');
  lines.push(
    '- **fail** — the check ran and the provider did not. This is what files a breakage issue.',
  );
  lines.push(
    '- **unconfigured** — no repository secret was supplied, so nothing was asked. Not a failure.',
  );
  lines.push(
    '- **unsupported** — the adapter documents the capability but has no verified implementation, ' +
      'so nothing was sent. It is not counted as passing.',
  );
  lines.push('- **skipped** — deliberately not run, with the reason recorded above.');
  lines.push('');
  lines.push(
    'This job is informational. It never gates a pull-request merge: a live provider being ' +
      'unreachable tonight is not a reason to reject a change that was green an hour ago.',
  );
  lines.push('');

  return lines.join('\n');
}

/** The `test()` cell for the summary table. */
function statusCell(provider: ProviderReport, kind: 'test' | 'listModels'): string {
  const check = provider.checks.find((entry) => entry.kind === kind);
  if (!check) return '—';
  return `${STATUS_DISPLAY[check.status].glyph} ${STATUS_DISPLAY[check.status].label}`;
}

/** The model-list cell, which carries its own detail. */
function modelsCell(provider: ProviderReport): string {
  if (!provider.models) return '—';
  const { status, added, removed } = provider.models;
  const glyph = STATUS_DISPLAY[status].glyph;
  if (added.length === 0 && removed.length === 0) return `${glyph} ${STATUS_DISPLAY[status].label}`;
  const changes: string[] = [];
  if (added.length > 0) changes.push(`+${added.length}`);
  if (removed.length > 0) changes.push(`−${removed.length}`);
  return `${glyph} ${STATUS_DISPLAY[status].label} (${changes.join(', ')})`;
}

/** The capability-probe cell: every probe's status, plus the count of probes that ran. */
function capabilityCell(provider: ProviderReport): string {
  if (provider.capabilityProbes.length === 0) return '—';
  const glyphs = provider.capabilityProbes.map((probe) => STATUS_DISPLAY[probe.status].glyph);
  return glyphs.join(' ');
}

/** The `browserDirect` cell, taken only from a browser observation. */
function browserDirectCell(provider: ProviderReport): string {
  const check = provider.checks.find((entry) => entry.kind === 'browserDirect');
  if (!check?.browserOutcome) return '—';
  const { browserDirect, unavailable } = check.browserOutcome;
  const glyph = STATUS_DISPLAY[check.status].glyph;
  // An unprobeable provider (`openai-compatible`, whose answer depends on the user's own server) is
  // shown as unverified rather than being given the word "no", which would contradict its own note.
  return unavailable === undefined
    ? `${glyph} \`${browserDirect}\``
    : `${glyph} \`${browserDirect}\` (${unavailable})`;
}
