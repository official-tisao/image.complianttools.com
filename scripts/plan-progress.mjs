#!/usr/bin/env node
/**
 * Counts every checkbox state in PLAN.md's Appendix A, B, and C so the
 * progress dashboard in §1 stays objective, and fails CI if the dashboard
 * drifts from the actual checkboxes.
 *
 * Per PLAN.md §0.2, the recognised states are:
 *   [x] = done            [ ] = not started
 *   [/] = in progress     [~] = deferred/dropped
 *   [!] = blocked
 *
 * The script is read-only: it never edits PLAN.md. If the §1 dashboard
 * disagrees with the actual Appendix A/B checkboxes, the script exits
 * non-zero with a clear message.
 *
 * Usage:
 *   node scripts/plan-progress.mjs
 *   pnpm progress
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDirectory, '..');
const planPath = join(repoRoot, 'PLAN.md');
const plan = await readFile(planPath, 'utf8');
const lines = plan.split('\n');

// We slice Appendix A, B, and C. Appendix D is added as a sentinel so
// Appendix C's slice terminates at the next appendix heading rather than
// running to the end of the file (where it would absorb Appendices D and
// E and the change log). We do not count Appendix D — only its start
// line is needed.
const appendixHeadings = [
  { key: 'A', label: 'Appendix A', pattern: /^##\s+10\.\s+Appendix A\b/ },
  { key: 'B', label: 'Appendix B', pattern: /^##\s+11\.\s+Appendix B\b/ },
  { key: 'C', label: 'Appendix C', pattern: /^##\s+12\.\s+Appendix C\b/ },
  { key: 'D', label: 'Appendix D', pattern: /^##\s+13\.\s+Appendix D\b/ },
];

// Resolve each required heading's start line. We require the line to match
// `^##\s+N.\s+Appendix X\b` exactly so a future "10a. Appendix A revisited"
// or "20. Appendix A backlog" cannot silently satisfy the check. If any
// required heading is missing, fail loudly instead of producing a wrong
// report — a missing heading would otherwise slice the whole tail of the
// file and inflate the count.
const starts = appendixHeadings.map(({ key, label, pattern }) => {
  const start = lines.findIndex((line) => pattern.test(line));
  if (start < 0) {
    throw new Error(
      `Could not find a heading matching "## N. ${label}" in PLAN.md. ` +
        `Either the appendix was renamed/restructured, or the script's ` +
        `expected section number changed. Update scripts/plan-progress.mjs ` +
        `and PLAN.md §1 together.`,
    );
  }
  return { key, label, start };
});

const countedKeys = new Set(['A', 'B', 'C']);

// Each appendix's slice runs to the next appendix's start (counted or
// sentinel), so the count never bleeds across appendices. Appendix D is
// not counted itself, but its heading still terminates Appendix C's
// slice; otherwise C would absorb the rest of PLAN.md.
const sections = starts
  .filter((entry) => countedKeys.has(entry.key))
  .map((entry) => {
    const ownIndex = starts.findIndex((s) => s.key === entry.key);
    const next = starts[ownIndex + 1];
    const end = next ? next.start : lines.length;
    return { ...entry, end, text: lines.slice(entry.start, end).join('\n') };
  });

const checkboxStates = [
  { state: 'done', marker: 'x', pattern: /\[x\]/g },
  { state: 'notStarted', marker: ' ', pattern: /\[ \]/g },
  { state: 'inProgress', marker: '/', pattern: /\[\/\]/g },
  { state: 'deferred', marker: '~', pattern: /\[~\]/g },
  { state: 'blocked', marker: '!', pattern: /\[!\]/g },
];

function countStates(text) {
  const counts = { done: 0, notStarted: 0, inProgress: 0, deferred: 0, blocked: 0 };
  for (const { state, pattern } of checkboxStates) {
    const matches = text.match(pattern);
    if (matches) counts[state] = matches.length;
  }
  return counts;
}

const reports = sections.map(({ key, label, text }) => {
  const counts = countStates(text);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  // "Complete" means the row is closed-out: done, deferred, or blocked.
  // A deferred or blocked row is an explicit decision per §0.1 rule 6,
  // not "missing work", so it does not count against the denominator.
  const closed = counts.done + counts.deferred + counts.blocked;
  return {
    appendix: key,
    label,
    counts,
    total,
    closed,
    pending: counts.notStarted + counts.inProgress,
  };
});

const byAppendix = Object.fromEntries(reports.map((report) => [report.appendix, report]));

// --- Dashboard reconciliation (PLAN.md §1) -------------------------------
// The §1 dashboard claims it is "derived by pnpm progress" (see the
// paragraph at lines 102-103), so the Tools/Formats rows must agree with
// the actual Appendix A/B counts. We parse the dashboard table and fail
// loudly on any drift instead of letting the script become the source
// of truth it claims not to be.

const dashboardRowPattern =
  /^\|\s*(Tools \(Appendix A\)|Formats \(Appendix B\)|AI adapters \(Appendix C\))\s*\|\s*(\d+|~\d+)\s*\|\s*(\d+)\s*\|/;

const dashboardExpectations = {
  A: { label: 'Tools (Appendix A)', done: byAppendix.A.counts.done, total: byAppendix.A.total },
  B: { label: 'Formats (Appendix B)', done: byAppendix.B.counts.done, total: byAppendix.B.total },
};

const dashboardErrors = [];
for (const [appendix, { label, done, total }] of Object.entries(dashboardExpectations)) {
  const match = lines
    .map((line) => line.match(dashboardRowPattern))
    .find((row) => row && row[1] === label);
  if (!match) {
    dashboardErrors.push(
      `Could not find the "${label}" row in PLAN.md §1. The dashboard must ` +
        `declare its target and done counts explicitly so this script can ` +
        `verify them.`,
    );
    continue;
  }
  const dashboardTarget = match[2].startsWith('~') ? Number(match[2].slice(1)) : Number(match[2]);
  const dashboardDone = Number(match[3]);
  if (dashboardTarget !== total) {
    dashboardErrors.push(
      `PLAN.md §1 row "${label}" declares target ${dashboardTarget} but Appendix ` +
        `${appendix} actually contains ${total} checkboxes. ` +
        `Either the appendix was edited without updating the dashboard, or the ` +
        `dashboard target was edited without adding/removing a row.`,
    );
  }
  if (dashboardDone !== done) {
    dashboardErrors.push(
      `PLAN.md §1 row "${label}" declares ${dashboardDone} done but Appendix ` +
        `${appendix} actually contains ${done} [x] rows. ` +
        `Run \`pnpm progress\` to see the per-state counts and reconcile.`,
    );
  }
}

const report = {
  schemaVersion: 1,
  plan: 'PLAN.md',
  appendices: {
    A: {
      label: 'Appendix A — Tool checklist',
      counts: byAppendix.A.counts,
      total: byAppendix.A.total,
      closed: byAppendix.A.closed,
      pending: byAppendix.A.pending,
    },
    B: {
      label: 'Appendix B — Format checklist',
      counts: byAppendix.B.counts,
      total: byAppendix.B.total,
      closed: byAppendix.B.closed,
      pending: byAppendix.B.pending,
    },
    C: {
      label: 'Appendix C — AI adapter checklist',
      counts: byAppendix.C.counts,
      total: byAppendix.C.total,
      closed: byAppendix.C.closed,
      pending: byAppendix.C.pending,
    },
  },
  dashboard: {
    reconciled: dashboardErrors.length === 0,
    errors: dashboardErrors,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (dashboardErrors.length > 0) {
  process.stderr.write(
    `\nPLAN.md §1 dashboard does not match the actual Appendix A/B checkboxes:\n` +
      dashboardErrors.map((message) => `  - ${message}`).join('\n') +
      '\n',
  );
  process.exit(1);
}
