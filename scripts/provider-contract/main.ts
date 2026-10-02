/**
 * P5-17 — the live provider contract job's entry point (README §22.7).
 *
 * Run by `.github/workflows/provider-contract.yml` on a nightly schedule and on manual dispatch. It
 * assembles the pieces and writes four artifacts:
 *
 * | Artifact | Purpose |
 * | --- | --- |
 * | `.generated/provider-contract/report.json` | The machine-readable run, consumed by the PR/issue steps |
 * | `.generated/provider-contract/report.md` | The human-readable run, posted to the job summary |
 * | `docs/PROVIDERS.md` | The generated table §15.2 promises a reader will consult |
 * | `.generated/provider-contract/decision.json` | What the GitHub steps should do about the run |
 *
 * Three properties this file is responsible for, each of which is a requirement rather than a nicety:
 *
 * 1. **Secrets reach the runner from the environment and leave only through the redacting logger.**
 *    They are read once, here, into a map the runner passes to adapters; they are never interpolated
 *    into a log line, a report, an issue body, or a PR body. Every string that reaches disk goes
 *    through {@link createRedactingLogger} or is a rendered function of the already-redacted report.
 * 2. **The exit code is informational.** §22.7 calls the job "non-blocking". A provider being
 *    unreachable tonight must not fail the workflow, because a failed nightly reads as a broken
 *    build and gets investigated as one. Only a failure of the *job itself* — an unreadable adapter,
 *    an unwritable artifact — exits non-zero.
 * 3. **Provider selection is data, not a list.** Credentials come from `PROVIDER_CONTRACT_CREDENTIALS`
 *    as JSON, so a provider is configured by adding a secret, not by editing this file and getting it
 *    wrong.
 */

import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser, observeInBrowser, type BrowserLike } from './browser.js';
import { decideGithubActions } from './github.js';
import { patchBrowserDirectSource, type BrowserDirectUpdate } from './browser-direct-patch.js';
import { readAdapters, readAdapterSourceFiles } from './adapters.js';
import { renderJsonReport, renderMarkdownReport } from './report.js';
import { PROVIDERS_DOC_PREAMBLE, renderProvidersDoc, upsertProvidersDoc } from './providers-doc.js';
import { createRedactingLogger, secretSetFrom } from './redaction.js';
import { runContractJob } from './run.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

/** Where generated run artifacts go. `.generated/` is already git-ignored for generated output. */
const OUTPUT_DIR = path.join(ROOT, '.generated', 'provider-contract');

/** The hard ceiling for the whole run, overridable but never above this default. */
const DEFAULT_SPEND_CAP_USD = '0.20';

/**
 * The absolute ceiling, enforced even if the environment asks for more.
 *
 * §22.7 asks for "one minimal operation per capability". Even with every implemented adapter probed
 * that is a handful of calls against the two price-table entries, so this ceiling is generous for a
 * correct run and still bounded if something goes wrong. A workflow variable cannot raise it: the
 * one thing that should be able to *lower* a spend limit is the same thing that must not be able to
 * raise it.
 */
const ABSOLUTE_SPEND_CAP_USD = '2.00';

async function main(): Promise<void> {
  const credentials = readCredentials();
  const secrets = secretSetFrom(credentials);
  // The single redaction path for this process. Everything written to a log goes through it.
  const logger = createRedactingLogger((line) => console.log(line), secrets);

  const requestedCap = process.env['PROVIDER_CONTRACT_SPEND_CAP'] ?? DEFAULT_SPEND_CAP_USD;
  const cap = clampCap(requestedCap);
  if (cap !== requestedCap) {
    logger.log(
      `[p5-17] spend cap ${requestedCap} exceeds the absolute ceiling ${ABSOLUTE_SPEND_CAP_USD}; using the ceiling.`,
    );
  }

  const adapters = await readAdapters();
  logger.log(`[p5-17] checking ${adapters.length} adapter(s) against a $${cap} hard spend cap`);

  const browser = await launchBrowser();
  if (!browser) {
    logger.log(
      '[p5-17] no Playwright browser could be launched; browserDirect will be recorded as unverified ' +
        'rather than assumed. A Node-side request cannot stand in for this.',
    );
  } else {
    logger.log('[p5-17] browser context ready; CORS will be observed from a real page');
  }

  try {
    const report = await runContractJob({
      adapters,
      credentials,
      ...(browser ? { browser: browserEffect(browser) } : {}),
      spendCapUsd: cap,
      now: () => new Date(),
      requestTimeoutMs: 45_000,
      mode: 'live',
    });

    // ---- Regenerate the generated artifacts from the run. -------------------------------------
    const adapterSources = await readAdapterSourceFiles();
    const changedFiles: string[] = [];
    changedFiles.push(...(await applyBrowserDirectUpdates(report, adapterSources, logger)));
    changedFiles.push(...(await writeProvidersDoc(report, logger)));

    const decision = decideGithubActions(report, changedFiles);
    const finalReport = { ...report, hasGeneratedDrift: changedFiles.length > 0 };

    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(path.join(OUTPUT_DIR, 'report.json'), renderJsonReport(finalReport), 'utf8');
    const markdown = renderMarkdownReport(finalReport);
    await writeFile(path.join(OUTPUT_DIR, 'report.md'), markdown, 'utf8');
    await writeFile(
      path.join(OUTPUT_DIR, 'decision.json'),
      `${JSON.stringify(decision, null, 2)}\n`,
      'utf8',
    );

    // The job summary is a convenience, not the record; the artifacts above are the record.
    const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
    if (summaryPath) await appendFile(summaryPath, markdown, 'utf8');

    // Step outputs, so the workflow's PR and issue steps branch on what the runner decided rather
    // than re-deriving it. Written to GITHUB_OUTPUT only when a value is meaningful, and every one
    // is a literal 'true'/'false' — a missing key must read as "do nothing", never as "do it".
    await writeStepOutputs({
      drift: decision.pullRequest !== undefined,
      drift_title: decision.pullRequest?.title ?? '',
      breakage: decision.breakageIssue !== undefined,
      drift_issue: decision.driftIssue !== undefined,
    });

    logger.log(
      `[p5-17] spent $${finalReport.totalSpentUsd} of the $${finalReport.spendCapUsd} cap`,
    );
    logger.log(
      `[p5-17] ${finalReport.brokenProviders.length} broken, ${finalReport.driftedProviders.length} drifted, ` +
        `${finalReport.unconfiguredProviders.length} unconfigured`,
    );

    // Non-blocking by design. The findings are in the report; see the module header.
    process.exitCode = 0;
  } finally {
    await browser?.close();
  }
}

/** The browser effect, in the shape the runner expects. */
function browserEffect(browser: BrowserLike) {
  return {
    async observe(input: {
      providerId: string;
      url: string;
      headers: Readonly<Record<string, string>>;
      method: string;
    }) {
      return observeInBrowser(browser, input);
    },
  };
}

/**
 * Read credentials from the environment.
 *
 * `PROVIDER_CONTRACT_CREDENTIALS` is JSON so a provider is added by configuring a secret rather than
 * by editing this file. A malformed value is reported and treated as "no providers configured", which
 * produces a full report of `unconfigured` providers — the honest reading of "I could not parse your
 * configuration" is not "everything is broken".
 */
function readCredentials(): Record<string, Record<string, string>> {
  const raw = process.env['PROVIDER_CONTRACT_CREDENTIALS'];
  if (!raw || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: Record<string, Record<string, string>> = {};
    for (const [providerId, fields] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof fields !== 'object' || fields === null) continue;
      const entry: Record<string, string> = {};
      for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
        if (typeof value === 'string') entry[key] = value;
      }
      result[providerId] = entry;
    }
    return result;
  } catch {
    console.warn(
      '[p5-17] PROVIDER_CONTRACT_CREDENTIALS is not valid JSON; treating every provider as unconfigured.',
    );
    return {};
  }
}

/**
 * Publish step outputs for the workflow's later steps.
 *
 * Values are appended rather than spread so that a value containing a newline (a PR title never
 * does, but a title built from a provider name could) cannot inject a second output key.
 */
async function writeStepOutputs(
  outputs: Readonly<Record<string, string | boolean>>,
): Promise<void> {
  const outputPath = process.env['GITHUB_OUTPUT'];
  if (!outputPath) return;
  let payload = '';
  for (const [key, value] of Object.entries(outputs)) {
    payload += `${key}=${typeof value === 'boolean' ? String(value) : value}\n`;
  }
  await appendFile(outputPath, payload, 'utf8');
}

/** Clamp a requested cap to the absolute ceiling, keeping the two in comparable units. */
function clampCap(requested: string): string {
  const toMicros = (text: string): number => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
    if (!match) return Number.POSITIVE_INFINITY;
    const whole = Number.parseInt(match[1] ?? '0', 10);
    const fraction = (match[2] ?? '').padEnd(4, '0').slice(0, 4);
    return whole * 10_000 + Number.parseInt(fraction || '0', 10);
  };
  const ceiling = toMicros(ABSOLUTE_SPEND_CAP_USD);
  const value = toMicros(requested);
  return value > ceiling ? ABSOLUTE_SPEND_CAP_USD : requested;
}

/** Adapter source text by provider id, so a `browserDirect` line can be rewritten in place. */
type AdapterSources = ReadonlyMap<string, { path: string; source: string }>;

/**
 * Write browser-observed `browserDirect` values back into the adapter sources.
 *
 * Only a verified observation writes anything, and only the `browserDirect` value plus a recognised
 * placeholder note — see `./browser-direct-patch.ts`. Returns the paths that actually changed.
 */
async function applyBrowserDirectUpdates(
  report: Awaited<ReturnType<typeof runContractJob>>,
  sources: AdapterSources,
  logger: { log: (message: unknown) => void },
): Promise<string[]> {
  const changed: string[] = [];
  for (const provider of report.providers) {
    const check = provider.checks.find((entry) => entry.kind === 'browserDirect');
    const outcome = check?.browserOutcome;
    if (!outcome || !sources.has(provider.id)) continue;

    const file = sources.get(provider.id);
    if (!file) continue;

    const update: BrowserDirectUpdate = {
      providerId: provider.id,
      filePath: file.path,
      declared: provider.browserDirectInSource ?? 'unknown',
      observed: outcome.browserDirect,
      verified: outcome.unavailable === undefined && outcome.browserDirect !== 'unknown',
      ...(check.httpStatus === undefined ? {} : { httpStatus: check.httpStatus }),
    };
    const result = patchBrowserDirectSource(file.source, update);
    if (result.changed && result.source) {
      await writeFile(file.path, result.source, 'utf8');
      changed.push(path.relative(ROOT, file.path).replaceAll('\\', '/'));
      logger.log(
        `[p5-17] ${provider.id}: browserDirect ${update.declared} → ${update.observed} (from a browser observation)`,
      );
    }
  }
  return changed;
}

/** Regenerate `docs/PROVIDERS.md` and return it if the content moved. */
async function writeProvidersDoc(
  report: Awaited<ReturnType<typeof runContractJob>>,
  logger: { log: (message: unknown) => void },
): Promise<string[]> {
  const docPath = path.join(ROOT, 'docs', 'PROVIDERS.md');
  const generated = renderProvidersDoc(report);
  let existing: string | undefined;
  try {
    existing = await readFile(docPath, 'utf8');
  } catch {
    existing = undefined;
  }
  const next = upsertProvidersDoc(existing, generated, PROVIDERS_DOC_PREAMBLE);
  // Byte-identical when nothing changed, so a night with no findings produces no diff at all.
  if (existing === next) return [];
  await writeFile(docPath, next, 'utf8');
  logger.log('[p5-17] docs/PROVIDERS.md regenerated from this run');
  return ['docs/PROVIDERS.md'];
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await main();
}
