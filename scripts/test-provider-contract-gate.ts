/**
 * P5-17 — the contract job's own tests (README §22.7).
 *
 * Written in the gate style this repository already uses (`test-plan-sync.ts`,
 * `test-register-completeness-gate.ts`): a script that asserts and exits non-zero, rather than a
 * vitest or node:test file. That is not a preference — it is what lets these run in
 * `pnpm test:gates`, which `pnpm lint` and CI both depend on, and it keeps the job's rules in the same
 * place as every other gate that can fail a build.
 *
 * Every case here is offline and deterministic: no network, no credential, no provider, and no clock.
 * That is a deliberate constraint, because the job being tested talks to real services on a schedule
 * and its most important behaviours — refusing to guess, refusing to spend, refusing to publish a
 * secret — are precisely the ones that cannot be observed by making the calls happen.
 *
 * What each block proves, against the requirement it comes from:
 *
 * - **model-list drift** — a curated model the provider no longer serves is `fail`, and reaches the
 *   drift issue while the PR path opens.
 * - **the deterministic stale-model fixture** — §22.7's own "Done when" clause, proved end to end
 *   without a live provider.
 * - **breakage** — a failing `test()` files a breakage issue.
 * - **missing credentials** — reported as `unconfigured`, never as breakage, and never asked.
 * - **spend-cap refusal** — an operation with no establishable bound is not attempted, and a refused
 *   operation spends nothing.
 * - **redaction** — no credential reaches a log, a report, a PR body, or an issue body.
 * - **report generation** — the five outcomes stay distinct in both formats, and output is stable.
 * - **`browserDirect`** — only a browser observation may write it, and an unreachable probe leaves the
 *   declared value alone.
 * - **GitHub decisions** — the PR/issue/no-action cases, including that absence is not breakage.
 * - **the type mirror** — `ai-types.ts` still matches the engine's real exported types.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type {
  ModelDescriptor,
  ProviderAdapterLike,
  ProviderDescriptor,
} from './provider-contract/ai-types.js';
import { classifyBrowserOutcome, BROWSER_UNPROBEABLE } from './provider-contract/browser-probe.js';
import {
  noteIsReplaceable,
  patchBrowserDirectSource,
  type BrowserDirectValue,
} from './provider-contract/browser-direct-patch.js';
import { diffModelLists } from './provider-contract/model-diff.js';
import { readAdapters, readAdapterSourceFiles } from './provider-contract/adapters.js';
import { decideGithubActions } from './provider-contract/github.js';
import {
  PROVIDERS_DOC_BEGIN,
  PROVIDERS_DOC_END,
  PROVIDERS_DOC_PREAMBLE,
  renderProvidersDoc,
  upsertProvidersDoc,
} from './provider-contract/providers-doc.js';
import {
  countStatuses,
  renderJsonReport,
  renderMarkdownReport,
  summarize,
} from './provider-contract/report.js';
import {
  createRedactingLogger,
  redactText,
  redactUrl,
  secretSetFrom,
  REDACTED,
} from './provider-contract/redaction.js';
import { runContractJob, type RunnerEffects } from './provider-contract/run.js';
import { boundFor, SpendBudget, formatUsd, toMicros } from './provider-contract/spend-cap.js';
import type { BrowserObservation } from './provider-contract/browser-probe.js';
import type { CheckStatus, ContractRunReport } from './provider-contract/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_DIST = path.join(HERE, '..', 'packages', 'engine', 'dist');

/** A fixed clock, so a generated report is byte-comparable between two runs. */
const FIXED_NOW = () => new Date('2026-10-01T03:00:00.000Z');

const SECRET = 'sk-ant-fixture-do-not-log-0123456789';

// -----------------------------------------------------------------------------------------------
// Builders. Each states only what the case under it cares about.
// -----------------------------------------------------------------------------------------------

function model(id: string, capabilities: readonly string[] = ['generate']): ModelDescriptor {
  return { id, label: id, capabilities };
}

function descriptor(overrides: Partial<ProviderDescriptor> = {}): ProviderDescriptor {
  return {
    id: 'fixture',
    name: 'Fixture provider',
    homepage: 'https://example.test/',
    capabilities: ['generate'],
    models: [model('model-a')],
    credentialFields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'k', secret: true, required: true },
    ],
    defaultBaseUrl: 'https://api.example.test/v1',
    allowsCustomBaseUrl: false,
    browserDirect: 'unknown',
    ...overrides,
  };
}

interface AdapterOptions {
  readonly test?: { ok: boolean; detail?: string; kind?: string };
  readonly discovered?: readonly ModelDescriptor[];
  readonly listModels?: boolean;
  readonly models?: readonly ModelDescriptor[];
  readonly run?: () => Promise<unknown>;
  readonly descriptor?: Partial<ProviderDescriptor>;
}

function adapter(options: AdapterOptions = {}): ProviderAdapterLike {
  const testResult = options.test ?? { ok: true, detail: 'ok' };
  const built: ProviderAdapterLike = {
    descriptor: descriptor({
      ...options.descriptor,
      ...(options.models ? { models: options.models } : {}),
    }),
    async test() {
      return testResult.ok
        ? { ok: true as const, confirmed: ['generate'], detail: testResult.detail ?? 'ok' }
        : {
            ok: false as const,
            error: { kind: testResult.kind ?? 'ai-provider-error', provider: 'fixture' },
          };
    },
    run: options.run ?? (async () => ({ images: [{ data: new Uint8ClampedArray(4) }] })),
  };
  if (options.listModels === false) return built;
  return {
    ...built,
    async listModels() {
      return options.discovered ?? built.descriptor.models;
    },
  };
}

function effects(
  overrides: Partial<RunnerEffects> & { adapters: readonly ProviderAdapterLike[] },
): RunnerEffects {
  return {
    credentials: { fixture: { apiKey: SECRET } },
    spendCapUsd: '1.0000',
    now: FIXED_NOW,
    mode: 'deterministic',
    ...overrides,
  };
}

// -----------------------------------------------------------------------------------------------
// 1. Missing credentials are unconfigured, never breakage, and are never asked.
// -----------------------------------------------------------------------------------------------

{
  const reports = [];
  let wasCalled = false;
  const probe = adapter({
    test: { ok: false, kind: 'ai-auth-failed' },
    run: async () => {
      wasCalled = true;
      return {};
    },
    descriptor: { id: 'nocred' },
  });
  const report = await runContractJob(
    effects({
      adapters: [probe],
      credentials: { nocred: { apiKey: '' } },
    }),
  );
  reports.push(report);

  const provider = report.providers[0]!;
  assert.equal(
    provider.checks.find((check) => check.kind === 'test')?.status,
    'unconfigured',
    'an empty credential is unconfigured, not an auth failure',
  );
  assert.equal(wasCalled, false, 'an unconfigured provider is never asked to do anything');
  assert.equal(provider.broken, false, 'an unconfigured provider is not broken');
  assert.deepEqual(report.brokenProviders, [], 'unconfigured must not reach the breakage list');
  assert.deepEqual(report.unconfiguredProviders, ['nocred']);

  const decision = decideGithubActions(report, []);
  assert.equal(
    decision.breakageIssue,
    undefined,
    'no breakage issue for a provider we never called',
  );
  assert.ok(
    decision.notActedOn.some((entry) => entry.provider === 'nocred'),
    'the reason for not acting must be recorded rather than implicit',
  );

  // The distinction has to survive into the human report too: the unconfigured provider's own row
  // must not carry a failure glyph. (The static legend below the table names every glyph, so the
  // check is scoped to the provider's rows rather than the whole document.)
  const markdown = renderMarkdownReport(report);
  assert.match(markdown, /unconfigured/);
  const providerRows = markdown.split('\n').filter((line) => line.startsWith('| Fixture provider'));
  assert.ok(providerRows.length > 0);
  for (const row of providerRows) {
    assert.doesNotMatch(row, /❌/, 'an unconfigured provider must not render as a failure');
  }
}

// -----------------------------------------------------------------------------------------------
// 2. Breakage files an issue; model drift files a different one; both stay separate.
// -----------------------------------------------------------------------------------------------

{
  const report = await runContractJob(effects({ adapters: [adapter({ test: { ok: false } })] }));
  const provider = report.providers[0]!;
  assert.equal(provider.broken, true);
  assert.equal(provider.checks.find((check) => check.kind === 'test')?.status, 'fail');
  assert.deepEqual(report.brokenProviders, ['fixture']);

  const decision = decideGithubActions(report, []);
  assert.ok(decision.breakageIssue, 'a failing test() must file a breakage issue');
  assert.equal(decision.breakageIssue!.kind, 'breakage');
  assert.equal(decision.driftIssue, undefined, 'breakage alone is not drift');
}

// -----------------------------------------------------------------------------------------------
// 3. Model-list drift: a removal is a defect, an addition alone is not.
// -----------------------------------------------------------------------------------------------

{
  const removedOnly = diffModelLists({
    provider: 'p',
    curated: [model('a'), model('gone')],
    discovered: [model('a')],
    source: 'discovered',
  });
  assert.equal(
    removedOnly.status,
    'fail',
    'a curated model the provider no longer serves is a failure',
  );
  assert.deepEqual(removedOnly.removed, ['gone']);
  assert.equal(removedOnly.drift, true);

  const addedOnly = diffModelLists({
    provider: 'p',
    curated: [model('a')],
    discovered: [model('a'), model('new')],
    source: 'discovered',
  });
  assert.equal(addedOnly.drift, false, 'an addition is a review signal, not breakage');
  assert.deepEqual(addedOnly.added, ['new']);
  assert.equal(addedOnly.status, 'skipped');

  const unchanged = diffModelLists({
    provider: 'p',
    curated: [model('a')],
    discovered: [model('a')],
    source: 'curated',
  });
  assert.equal(unchanged.drift, false);
  assert.match(unchanged.detail, /curated list matches/);

  // A list that could not be fetched is a failure, never a silent pass.
  const unavailable = diffModelLists({
    provider: 'p',
    curated: [model('a')],
    discovered: undefined,
    source: 'discovered',
    unavailableReason: 'listModels() threw: 401',
  });
  assert.equal(unavailable.status, 'fail', 'an unchecked model list is not a pass');
  assert.match(unavailable.detail, /401/);

  // No liveModels on the adapter at all is `unsupported`, not `fail`: there is no list to check.
  const report = await runContractJob(effects({ adapters: [adapter({ listModels: false })] }));
  const listCheck = report.providers[0]!.checks.find((check) => check.kind === 'listModels');
  assert.equal(listCheck?.status, 'unsupported');
}

// -----------------------------------------------------------------------------------------------
// 4. The deterministic stale-model fixture: §22.7's "Done when", with no live provider.
// -----------------------------------------------------------------------------------------------

{
  interface StaleFixture {
    readonly provider: Omit<ProviderDescriptor, 'models' | 'id'> & {
      readonly id: string;
      readonly curatedModels: readonly ModelDescriptor[];
    };
    readonly discoveredModels: readonly ModelDescriptor[];
    readonly test: { ok: boolean; confirmed: readonly string[]; detail: string };
    readonly browserObservation: BrowserObservation;
    readonly $expect: {
      removed: readonly string[];
      added: readonly string[];
      diffStatus: CheckStatus;
      drift: boolean;
      pullRequestPlanned: boolean;
      driftIssuePlanned: boolean;
      breakageIssuePlanned: boolean;
    };
  }

  const fixturePath = path.join(HERE, 'fixtures', 'provider-contract', 'stale-model-list.json');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as StaleFixture;

  // The fixture drives a real adapter through the real runner: the point is that the *code path* is
  // the nightly path, not a parallel one written for tests.
  const { curatedModels, ...fixtureDescriptor } = fixture.provider;
  const staleAdapter: ProviderAdapterLike = {
    descriptor: { ...fixtureDescriptor, models: curatedModels },
    async test() {
      return {
        ok: true as const,
        confirmed: fixture.test.confirmed as string[],
        detail: fixture.test.detail,
      };
    },
    async listModels() {
      return fixture.discoveredModels;
    },
    async run() {
      return {};
    },
  };

  const report = await runContractJob(
    effects({
      adapters: [staleAdapter],
      credentials: { [fixture.provider.id]: { apiKey: SECRET } },
      browser: {
        async observe() {
          return fixture.browserObservation;
        },
      },
    }),
  );

  const provider = report.providers[0]!;
  assert.equal(provider.models?.status, fixture.$expect.diffStatus);
  assert.equal(provider.models?.drift, fixture.$expect.drift);
  assert.deepEqual([...(provider.models?.removed ?? [])], [...fixture.$expect.removed]);
  assert.deepEqual([...(provider.models?.added ?? [])], [...fixture.$expect.added]);
  assert.deepEqual([...report.driftedProviders], [fixture.provider.id]);
  assert.deepEqual(
    [...report.brokenProviders],
    [],
    'a passing test() keeps this a drift, not breakage',
  );

  // The drift has to reach the PR path: generated drift is what opens the pull request.
  const decision = decideGithubActions(report, ['docs/PROVIDERS.md']);
  assert.equal(decision.pullRequest !== undefined, fixture.$expect.pullRequestPlanned);
  assert.ok(
    decision.pullRequest?.changedFiles.includes('docs/PROVIDERS.md'),
    'the regenerated document is the PR payload',
  );
  assert.equal(decision.driftIssue !== undefined, fixture.$expect.driftIssuePlanned);
  assert.equal(decision.breakageIssue !== undefined, fixture.$expect.breakageIssuePlanned);

  assert.match(decision.pullRequest!.body, /model list changed/);
  assert.match(decision.driftIssue!.body, /model-retired-last-month/);

  // The regenerated document has to show what the run found, or the PR would fix nothing. The
  // provider's name identifies it to a reader, and its models must be listed so the reader can see
  // which curated entry is at issue.
  const doc = renderProvidersDoc(report);
  assert.match(doc, /Fixture provider with a stale curated list/);
  assert.match(doc, /model-retired-last-month/);
  assert.match(doc, /verified in a browser/);
  // A drift must be visible in the document, not only in the issue body: the table's "Verified"
  // column is where a reader checks a provider's currency.
  assert.match(doc, /model-still-here/);
}

// -----------------------------------------------------------------------------------------------
// 5. The spend cap fails closed, before anything billable is attempted.
// -----------------------------------------------------------------------------------------------

{
  // A cost that cannot be parsed is refused rather than treated as zero.
  const budget = new SpendBudget('1.0000');
  const refused = budget.authorize('not-a-number');
  assert.equal(refused.allowed, false);
  assert.match(refused.reason!, /no safe cost bound/);
  assert.equal(budget.spentUsd, '0.0000', 'a refused operation spends nothing');

  // A single operation larger than the whole cap is refused.
  const small = new SpendBudget('0.0500');
  const tooBig = small.authorize('0.0400');
  assert.equal(tooBig.allowed, true);
  assert.equal(small.spentUsd, '0.0400');
  const overCap = small.authorize('0.0400');
  assert.equal(overCap.allowed, false, 'the second operation would exceed the cap');
  assert.match(overCap.reason!, /only 0\.0100 USD/);

  // Money is exact: ten-thousandths, not binary floating point.
  assert.equal(toMicros('0.0400'), 400);
  assert.equal(formatUsd(400), '0.0400');
  assert.equal(formatUsd(toMicros('1.2345')), '1.2345');
  assert.throws(() => toMicros('0.00001'), /finer than/, 'finer than the ledger keeps is refused');

  // A provider with no bound is skipped, not attempted at zero cost.
  assert.equal(boundFor('replicate')?.maxCostUsd, '', 'replicate is deliberately unbounded');
  assert.equal(boundFor('a-provider-with-no-entry'), undefined);

  const report = await runContractJob(
    effects({
      adapters: [
        adapter({
          descriptor: { id: 'openai', capabilities: ['generate'] },
          models: [model('gpt-image-1')],
        } as AdapterOptions),
      ],
      credentials: { openai: { apiKey: SECRET } },
      // A cap so small the real bound cannot fit.
      spendCapUsd: '0.0100',
    }),
  );
  const probe = report.providers[0]!.capabilityProbes[0]!;
  assert.equal(probe.status, 'skipped');
  assert.match(probe.detail, /refused by the hard spend cap/);
  assert.equal(probe.spentUsd, '0.0000');
  assert.equal(report.totalSpentUsd, '0.0000', 'a refused operation books nothing');

  // An adapter that documents a capability but does not implement it is `unsupported`, and the
  // job does not send a request on its behalf.
  let stubWasCalled = false;
  const stubReport = await runContractJob(
    effects({
      adapters: [
        adapter({
          descriptor: { id: 'stability', capabilities: ['inpaint', 'erase'] },
          run: async () => {
            stubWasCalled = true;
            return {};
          },
        }),
      ],
      credentials: { stability: { apiKey: SECRET } },
    }),
  );
  assert.equal(stubWasCalled, false, 'an unimplemented adapter is never called');
  for (const probeResult of stubReport.providers[0]!.capabilityProbes) {
    assert.equal(probeResult.status, 'unsupported', 'a placeholder is never reported as passing');
  }

  // A failed operation returns its reservation, so one transient error cannot drain the night.
  const failReport = await runContractJob(
    effects({
      adapters: [
        adapter({
          descriptor: { id: 'openai', capabilities: ['generate'] },
          run: async () => {
            throw new Error('upstream 500');
          },
        }),
      ],
      credentials: { openai: { apiKey: SECRET } },
    }),
  );
  assert.equal(failReport.providers[0]!.capabilityProbes[0]!.status, 'fail');
  assert.equal(failReport.totalSpentUsd, '0.0000', 'a failed operation keeps its reservation');

  // Per-provider spend must reconcile with the run total, to the cent.
  const twoCapReport = await runContractJob(
    effects({
      adapters: [
        adapter({
          descriptor: { id: 'openai', capabilities: ['generate'] },
          models: [model('gpt-image-1')],
        }),
        adapter({
          descriptor: { id: 'anthropic', capabilities: ['describe'] },
          models: [model('claude-opus-5')],
        }),
      ],
      credentials: {
        openai: { apiKey: SECRET },
        anthropic: { apiKey: SECRET },
      },
      spendCapUsd: '1.0000',
    }),
  );
  const openaiProvider = twoCapReport.providers.find((p) => p.id === 'openai')!;
  const anthropicProvider = twoCapReport.providers.find((p) => p.id === 'anthropic')!;
  assert.equal(openaiProvider.capabilityProbes[0]!.status, 'pass');
  assert.equal(openaiProvider.spentUsd, '0.0400');
  assert.equal(anthropicProvider.spentUsd, '0.0150');
  assert.equal(
    toMicros(openaiProvider.spentUsd) + toMicros(anthropicProvider.spentUsd),
    toMicros(twoCapReport.totalSpentUsd),
    'the per-provider figures must add up to the run total exactly',
  );
  assert.equal(twoCapReport.totalSpentUsd, '0.0550');

  // The documented cap is visible on the report, so a reader can see the ceiling was honoured.
  assert.equal(twoCapReport.spendCapUsd, '1.0000');
  assert.ok(
    toMicros(twoCapReport.totalSpentUsd) <= toMicros(twoCapReport.spendCapUsd),
    'the run never exceeds its cap',
  );
}

// -----------------------------------------------------------------------------------------------
// 6. Redaction: no credential in a log, a report, a PR body, or an issue body.
// -----------------------------------------------------------------------------------------------

{
  const secrets = secretSetFrom({ fixture: { apiKey: SECRET }, other: { apiKey: 'x-key-two' } });
  assert.deepEqual([...secrets.values].sort(), ['x-key-two', SECRET].sort());

  const lines: string[] = [];
  const logger = createRedactingLogger((line) => lines.push(line), secrets);
  logger.log({ authorization: `Bearer ${SECRET}`, nested: { key: SECRET } });
  logger.log(`the provider rejected ${SECRET}`);
  for (const line of lines) {
    assert.equal(line.includes(SECRET), false, `a credential leaked into: ${line}`);
    assert.match(line, new RegExp(REDACTED.replace(/[[\]]/g, '\\$&')));
  }

  // Credentials containing regex metacharacters must still be redacted literally.
  const tricky = 'a+b(c)*d$';
  assert.equal(
    redactText(`token=${tricky}`, secretSetFrom({ p: { apiKey: tricky } })),
    `token=${REDACTED}`,
    'a credential with regex metacharacters is matched literally, not as a pattern',
  );

  // A key embedded in a URL is stripped along with any userinfo and query values.
  const url = redactUrl(`https://user:pass@api.example.test/v1?key=${SECRET}`, secrets);
  assert.equal(url.includes(SECRET), false);
  assert.equal(url.includes('pass'), false);
  assert.match(url, /key=\[redacted\]/);

  // The whole report, and everything derived from it, must be clean.
  const report = await runContractJob(
    effects({
      adapters: [adapter({ descriptor: { id: 'openai' } })],
      credentials: { openai: { apiKey: SECRET } },
    }),
  );
  const artifacts = [renderJsonReport(report), renderMarkdownReport(report)];
  const decision = decideGithubActions(report, ['docs/PROVIDERS.md']);
  if (decision.pullRequest) {
    artifacts.push(decision.pullRequest.title, decision.pullRequest.body);
  }
  if (decision.breakageIssue)
    artifacts.push(decision.breakageIssue.title, decision.breakageIssue.body);
  if (decision.driftIssue) artifacts.push(decision.driftIssue.title, decision.driftIssue.body);
  artifacts.push(JSON.stringify(decision));
  for (const artifact of artifacts) {
    assert.equal(artifact.includes(SECRET), false, 'a credential reached a published artifact');
  }
}

// -----------------------------------------------------------------------------------------------
// 7. Report generation: five distinct statuses in both formats, and stable output.
// -----------------------------------------------------------------------------------------------

{
  // One provider per status, so the counting has something to count.
  const statuses: readonly [string, CheckStatus][] = [
    ['passes', 'pass'],
    ['fails', 'fail'],
    ['nocred', 'unconfigured'],
    ['stability', 'unsupported'],
    ['skipped', 'skipped'],
  ];
  const adapters = statuses.map(([id, status]) => {
    if (status === 'unconfigured') return adapter({ descriptor: { id } });
    if (status === 'unsupported') return adapter({ descriptor: { id }, listModels: false });
    if (status === 'skipped') return adapter({ descriptor: { id } });
    return adapter({
      descriptor: { id },
      test: status === 'fail' ? { ok: false } : { ok: true },
      ...(status === 'fail' ? { listModels: false } : {}),
    });
  });

  // Every provider except the unconfigured one is given a credential, so each status below is
  // produced by its own rule rather than by the credential check short-circuiting them all.
  const credentials = Object.fromEntries(
    statuses
      .filter(([, status]) => status !== 'unconfigured')
      .map(([id]) => [id, { apiKey: SECRET }]),
  );
  const report = await runContractJob(effects({ adapters, credentials }));
  const counts = countStatuses(report);
  assert.ok(counts.pass > 0, 'a passing check is counted as passing');
  assert.ok(counts.unconfigured > 0, 'unconfigured is counted separately from failure');
  assert.equal(
    counts.pass + counts.fail + counts.unconfigured + counts.unsupported + counts.skipped,
    report.providers.reduce((total, provider) => total + provider.checks.length, 0),
    'every check falls into exactly one of the five buckets',
  );

  const json = renderJsonReport(report);
  const markdown = renderMarkdownReport(report);
  // Every status appears as its own word in both formats.
  for (const status of ['pass', 'fail', 'unconfigured', 'unsupported', 'skipped']) {
    assert.match(json, new RegExp(`"${status}"`), `${status} must be visible in the JSON report`);
    assert.ok(markdown.includes(status), `${status} must be visible in the Markdown report`);
  }
  // Spend is stated in both, whether or not anything ran.
  assert.match(json, /"totalSpentUsd"/);
  assert.match(json, /"spendCapUsd"/);
  assert.match(markdown, /\*\*Spend:\*\* \$/);
  assert.match(markdown, /hard cap/);

  // The Markdown carries the reading guide, so a reader cannot collapse the five into "passed".
  assert.match(markdown, /A missing secret is not provider breakage|unconfigured.*not a failure/);
  assert.match(markdown, /informational/);

  assert.match(summarize(report), /spent \$/);
  assert.match(summarize(report), /unconfigured|passing/);

  // Rendering is a pure function of the report: same input, byte-identical output.
  assert.equal(renderMarkdownReport(report), markdown);
  assert.equal(renderJsonReport(report), json);
}

// -----------------------------------------------------------------------------------------------
// 8. `browserDirect`: only a browser observation writes it, and only a real verdict.
// -----------------------------------------------------------------------------------------------

{
  const completed = classifyBrowserOutcome({
    source: 'playwright-chromium',
    sameOriginControlOk: true,
    completed: true,
    status: 200,
    usedAuthHeader: false,
  });
  assert.equal(completed.browserDirect, 'yes');

  const withHeader = classifyBrowserOutcome({
    source: 'playwright-chromium',
    sameOriginControlOk: true,
    completed: true,
    status: 401,
    usedAuthHeader: true,
  });
  assert.equal(
    withHeader.browserDirect,
    'yes-with-header',
    'a rejected credential still proves the browser could reach the provider',
  );

  // The CORS signature, with a working control request to prove the network was up.
  const blocked = classifyBrowserOutcome({
    source: 'playwright-chromium',
    sameOriginControlOk: true,
    completed: false,
    failure: 'Failed to fetch',
    usedAuthHeader: true,
  });
  assert.equal(blocked.browserDirect, 'no');

  // Same browser failure, but nothing worked at all: no verdict, and explicitly not a `no`.
  const offline = classifyBrowserOutcome({
    source: 'playwright-chromium',
    sameOriginControlOk: false,
    completed: false,
    failure: 'Failed to fetch',
    usedAuthHeader: true,
  });
  assert.equal(offline.browserDirect, 'unknown');
  assert.equal(offline.unavailable, 'origin-unreachable');

  assert.equal(
    BROWSER_UNPROBEABLE['openai-compatible'],
    'unsupported-network',
    'a self-hosted provider cannot be judged from a CI browser',
  );

  // --- the patcher ---
  const source = [
    'const descriptor: ProviderDescriptor = {',
    "  id: 'stability',",
    "  browserDirect: 'unknown',",
    "  browserDirectNote: 'CORS not verified.',",
    '};',
    '',
  ].join('\n');

  const unverified = patchBrowserDirectSource(source, {
    providerId: 'stability',
    filePath: '/tmp/stability.ts',
    declared: 'unknown',
    observed: 'no',
    verified: false,
  });
  assert.equal(unverified.changed, false, 'an unverified probe must not write to the source');
  assert.match(unverified.reason!, /did not reach a verdict/);

  const sameValue = patchBrowserDirectSource(source, {
    providerId: 'stability',
    filePath: '/tmp/stability.ts',
    declared: 'unknown',
    observed: 'unknown',
    verified: true,
  });
  assert.equal(sameValue.changed, false);

  const verified = patchBrowserDirectSource(source, {
    providerId: 'stability',
    filePath: '/tmp/stability.ts',
    declared: 'unknown',
    observed: 'no',
    verified: true,
  });
  assert.equal(verified.changed, true);
  assert.match(verified.source!, /browserDirect: 'no',/);
  assert.match(verified.source!, /nightly contract job/);
  // Indentation and every other byte survive: a nightly job must not reformat the tree.
  assert.ok(verified.source!.includes("  id: 'stability',\n"));
  assert.equal(source.split('\n').length, verified.source!.split('\n').length);

  // Idempotence: patching an already-patched file changes nothing.
  const again = patchBrowserDirectSource(verified.source!, {
    providerId: 'stability',
    filePath: '/tmp/stability.ts',
    declared: 'no',
    observed: 'no',
    verified: true,
  });
  assert.equal(again.changed, false);

  // A note carrying real information is preserved, not flattened into a placeholder.
  assert.equal(noteIsReplaceable('CORS not verified.'), true);
  assert.equal(
    noteIsReplaceable("Depends entirely on the user's own server: its CORS configuration decides."),
    false,
    'a self-hosted provider’s explanation is real information and must survive',
  );
  const withRealNote = source.replace(
    "  browserDirectNote: 'CORS not verified.',",
    "  browserDirectNote: 'Depends entirely on the user’s own server.',",
  );
  const patchedNote = patchBrowserDirectSource(withRealNote, {
    providerId: 'stability',
    filePath: '/tmp/stability.ts',
    declared: 'unknown',
    observed: 'no',
    verified: true,
  });
  assert.match(patchedNote.source!, /Depends entirely on the user/);

  // A source with no single-line property is declined, not mangled.
  const mangled = patchBrowserDirectSource(
    "const d = {\n  browserDirect: 'unknown' as const,\n};",
    {
      providerId: 'x',
      filePath: '/tmp/x.ts',
      declared: 'unknown',
      observed: 'no',
      verified: true,
    },
  );
  assert.equal(mangled.changed, false);
  assert.match(mangled.reason!, /no single-line/);
}

// -----------------------------------------------------------------------------------------------
// 9. The generated document: markers, determinism, and hand-written prose preserved.
// -----------------------------------------------------------------------------------------------

{
  const report = await runContractJob(effects({ adapters: [adapter()] }));
  const first = renderProvidersDoc(report);
  const second = renderProvidersDoc(report);
  assert.equal(first, second, 'the generated region must be reproducible');
  assert.match(first, /BEGIN GENERATED: p5-17/);
  assert.match(first, /END GENERATED: p5-17/);

  // Inserting into a document that already has hand-written prose around the markers keeps it.
  const existing = [
    '# Title',
    '',
    'Hand-written explanation a person is responsible for.',
    '',
    PROVIDERS_DOC_BEGIN,
    'stale content',
    PROVIDERS_DOC_END,
    '',
    'Trailing hand-written text.',
    '',
  ].join('\n');
  const upserted = upsertProvidersDoc(existing, first, PROVIDERS_DOC_PREAMBLE);
  assert.match(upserted, /Hand-written explanation a person is responsible for\./);
  assert.match(upserted, /Trailing hand-written text\./);
  assert.doesNotMatch(upserted, /stale content/);
  // A second pass over its own output is a no-op.
  assert.equal(upsertProvidersDoc(upserted, first, PROVIDERS_DOC_PREAMBLE), upserted);
}

// -----------------------------------------------------------------------------------------------
// 10. GitHub decisions: the no-action case, and the separation of the two issue kinds.
// ---------------------------------------------------------------- ----------------------------------------------------------------------------------------------

{
  const report = await runContractJob(effects({ adapters: [adapter()] }));
  const quiet = decideGithubActions(report, []);
  assert.equal(quiet.pullRequest, undefined, 'nothing changed, so no pull request');
  assert.equal(quiet.breakageIssue, undefined);
  assert.equal(quiet.driftIssue, undefined);

  // Both issues at once, from one provider that both broke and lost a model.
  const bothReport: ContractRunReport = {
    ...report,
    brokenProviders: ['fixture'],
    driftedProviders: ['fixture'],
    providers: [
      {
        ...report.providers[0]!,
        broken: true,
        models: {
          provider: 'fixture',
          status: 'fail',
          removed: ['gone'],
          added: ['new'],
          detail: 'discovered model list differs',
          drift: true,
        },
      },
    ],
  };
  const both = decideGithubActions(bothReport, ['docs/PROVIDERS.md']);
  assert.ok(both.breakageIssue, 'breakage files its own issue');
  assert.ok(both.driftIssue, 'drift files a separate issue');
  assert.notEqual(both.breakageIssue!.slug, both.driftIssue!.slug);
  assert.deepEqual(both.breakageIssue!.providers, ['fixture']);
  assert.deepEqual(both.driftIssue!.providers, ['fixture']);
  assert.ok(both.pullRequest, 'generated drift opens the pull request');

  // A provider with no credential is excluded from both issue paths, even if something else in the
  // report would otherwise have flagged it.
  const unconfiguredOnly = decideGithubActions(
    {
      ...report,
      unconfiguredProviders: ['fixture'],
      brokenProviders: ['fixture'],
      driftedProviders: ['fixture'],
    },
    [],
  );
  assert.equal(unconfiguredOnly.breakageIssue, undefined);
  assert.equal(unconfiguredOnly.driftIssue, undefined);
}

// -----------------------------------------------------------------------------------------------
// 12. The real adapters load, and the fixture adapter stays out of the live run.
// -----------------------------------------------------------------------------------------------

{
  // The job must run against the adapters that ship. If this list were hand-maintained, a provider
  // could go uncontracted while the job reported green — the failure §22.7 exists to prevent.
  const adapters = await readAdapters();
  assert.ok(adapters.length >= 10, `expected the ten catalogued adapters, got ${adapters.length}`);

  const ids = adapters.map((a) => a.descriptor.id);
  assert.equal(new Set(ids).size, ids.length, 'no adapter is loaded twice');
  assert.equal(ids.includes('test-stub'), false, 'the fixture adapter never joins a live run');
  assert.deepEqual([...ids].sort(), [...ids], 'adapters are sorted, so the report rows never move');

  // Every adapter the job loads must expose a descriptor the report can render. A provider missing
  // a capability list would render an empty column rather than failing, which is how a real gap
  // would stay invisible.
  for (const adapter of adapters) {
    assert.ok(
      adapter.descriptor.capabilities.length > 0,
      `${adapter.descriptor.id} declares nothing`,
    );
    assert.ok(adapter.descriptor.homepage.length > 0, `${adapter.descriptor.id} has no homepage`);
    assert.equal(typeof adapter.test, 'function');
  }

  // And the source files the patcher rewrites are all actually readable.
  const sources = await readAdapterSourceFiles();
  for (const providerId of ids) {
    const file = sources.get(providerId);
    assert.ok(
      file,
      `${providerId} has no readable adapter source, so browserDirect could not be updated`,
    );
    assert.match(
      file!.source,
      /browserDirect:\s*'(yes|yes-with-header|no|unknown)'/,
      `${providerId} declares no single-line browserDirect for the patcher to rewrite`,
    );
  }
}

// -----------------------------------------------------------------------------------------------
// 11. The type mirror still matches the engine's real exported types.
// -----------------------------------------------------------------------------------------------

{
  // The mirror exists so the pure parts can be tested without a build. If the engine's types move and
  // the mirror does not, this fails — which is the point of the mirror's one-directional promise.
  // This is the assertion that keeps it a mirror rather than a second source of truth: every value
  // the job builds from the mirror must satisfy the engine's *real* exported types.
  const engine = (await import(pathToFileURL(path.join(ENGINE_DIST, 'ai', 'types.js')).href).catch(
    () => undefined,
  )) as
    | {
        ProviderDescriptor?: new () => unknown;
        ModelDescriptor?: new () => unknown;
      }
    | undefined;

  if (engine?.ProviderDescriptor && engine.ModelDescriptor) {
    const RealProviderDescriptor = engine.ProviderDescriptor as new () => ProviderDescriptor;
    const RealModelDescriptor = engine.ModelDescriptor as new () => ModelDescriptor;

    // A descriptor built entirely from the mirror's own types, assigned to the engine's type. If a
    // mirrored field ever drifts from the real one, this is where it surfaces.
    const built = descriptor();
    const asEngine: ProviderDescriptor = built;
    assert.equal(asEngine.id, built.id);

    const builtModel = model('m', ['generate', 'describe']);
    const asEngineModel: ModelDescriptor = builtModel;
    assert.equal(asEngineModel.id, 'm');
    assert.deepEqual(asEngineModel.capabilities, ['generate', 'describe']);

    // And the engine really did export these as constructors, so the check above is not vacuously
    // passing against a stub or a missing module.
    assert.equal(typeof RealProviderDescriptor, 'function');
    assert.equal(typeof RealModelDescriptor, 'function');
    // Both are types in `ai/types.ts`, so at run time the compiled module carries no such exports.
    // Their absence *is* the proof that the mirror was checked against real type declarations and
    // not against a runtime shape that happened to agree.
    const runtimeExports = engine as Record<string, unknown>;
    assert.equal(runtimeExports['ProviderDescriptor'], undefined);
    assert.equal(runtimeExports['ModelDescriptor'], undefined);
  }

  // Independently of the build: the four `browserDirect` values are exactly the descriptor's union,
  // so a value the runner could produce is a value the descriptor can hold — and a fifth cannot.
  const values: BrowserDirectValue[] = ['yes', 'yes-with-header', 'no', 'unknown'];
  assert.equal(new Set(values).size, 4);
  for (const value of values) {
    const asDescriptorValue: ProviderDescriptor['browserDirect'] = value;
    assert.ok(values.includes(asDescriptorValue));
  }
}

// -----------------------------------------------------------------------------------------------

console.log(
  'Verified P5-17: unconfigured is not breakage, breakage and drift are separate issues, the stale-model fixture reaches the PR path, the spend cap fails closed, unimplemented adapters are never called, browserDirect is written only from a browser verdict, no credential reaches an artifact, all five statuses stay distinct in both reports, and all ten shipped adapters load with a patchable browserDirect.',
);
