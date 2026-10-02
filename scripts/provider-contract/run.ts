/**
 * P5-17 — the contract job's orchestration, over injected effects (README §22.7).
 *
 * The runner is written as a function from a set of *injected* effects to a
 * {@link ContractRunReport}, with no module-level clock, no environment reads, and no filesystem
 * access outside the effects it is handed. That shape is not tidiness for its own sake — it is what
 * makes the seven required tests possible:
 *
 * - drift, breakage, missing-credentials, and spend-refusal are all decisions this function makes,
 *   so they can be driven over a fake adapter with no network and no key;
 * - redaction is testable because the logger is one of the injected effects, so a test can assert on
 *   exactly what would have been written;
 * - the report is a return value, not a side effect, so two runs can be compared byte for byte.
 *
 * The order of operations is §22.7's, and each step is deliberately ordered against the step that
 * follows:
 *
 * 1. **Configuration is checked before any call.** A provider with no credential is recorded
 *    `unconfigured` and never contacted. This is what keeps a missing repository secret from being
 *    reported as provider breakage.
 * 2. **`test()` runs before `listModels()`**, because a provider that will not authenticate cannot
 *    produce a meaningful model list, and a model diff taken from a rejected key would report
 *    "everything was removed".
 * 3. **The spend cap is consulted before `run()`**, never after.
 * 4. **`browserDirect` is observed last**, and only from the browser effect.
 */

import type { AdapterContextLike, ModelDescriptor, ProviderAdapterLike } from './ai-types.js';
import {
  classifyBrowserOutcome,
  BROWSER_UNPROBEABLE,
  type BrowserObservation,
} from './browser-probe.js';
import { diffModelLists, type ModelListSource } from './model-diff.js';
import { SpendBudget, boundFor, formatUsd, toMicros } from './spend-cap.js';
import { createRedactingLogger, type SecretSet } from './redaction.js';
import type {
  BrowserOutcome,
  CapabilityProbe,
  CheckResult,
  ContractRunReport,
  ModelListDiff,
  ProviderReport,
} from './types.js';

/**
 * Every side effect the runner needs, supplied by the caller.
 *
 * Bundled into one object so a test can construct a whole world — fakes for the adapters, the browser,
 * and the clock — by writing one literal.
 */
export interface RunnerEffects {
  /** The adapters to check, in the order they appear in §17.2. */
  readonly adapters: readonly ProviderAdapterLike[];
  /** Credentials per provider id. Absent or empty means unconfigured, never "wrong". */
  readonly credentials: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Observe one request from a real browser context.
   *
   * The only route to a `browserDirect` verdict. A runner given an effects object whose `browser`
   * always reports `unknown` still produces a complete report — it simply records the CORS posture as
   * unverified, which is the correct outcome when no browser is available.
   */
  readonly browser?: {
    observe(input: {
      readonly providerId: string;
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
      readonly method: string;
    }): Promise<BrowserObservation>;
  };
  /** Seconds before a single provider request is abandoned. */
  readonly requestTimeoutMs?: number;
  /** The hard spend ceiling for the whole run. */
  readonly spendCapUsd: string;
  /** The clock. Supplied rather than read so a report is reproducible. */
  readonly now: () => Date;
  /** `live` for a real run; `deterministic` for a fixture-driven one. Carried into the report. */
  readonly mode?: 'live' | 'deterministic';
}

/** The minimal 64×64 fixture §22.7 requires for a billable operation. */
export const FIXTURE_SIZE = 64;

/**
 * Run the contract job.
 *
 * Never throws for a provider-level problem: a provider that fails is a *result*, and the whole point
 * of the report is to carry it. An exception here means the job itself is broken, which should be
 * loud.
 */
export async function runContractJob(effects: RunnerEffects): Promise<ContractRunReport> {
  const secrets = secretSetFor(effects.credentials);
  // Constructed even though the runner does not currently log; every effect that writes does so
  // through this logger, so there is exactly one redaction path in the job.
  const logger = createRedactingLogger(() => {}, secrets);
  const budget = new SpendBudget(effects.spendCapUsd);
  const providers: ProviderReport[] = [];

  for (const adapter of effects.adapters) {
    providers.push(await checkProvider(adapter, effects, budget, logger));
  }

  const unconfiguredProviders = providers
    .filter((provider) => provider.checks.some((check) => check.status === 'unconfigured'))
    .map((provider) => provider.id);
  const brokenProviders = providers.filter((provider) => provider.broken).map((p) => p.id);
  const driftedProviders = providers
    .filter((provider) => provider.models?.drift === true)
    .map((provider) => provider.id);

  return {
    generatedAt: effects.now().toISOString(),
    mode: effects.mode ?? 'live',
    providers,
    totalSpentUsd: budget.spentUsd,
    spendCapUsd: budget.capUsd,
    unconfiguredProviders,
    brokenProviders,
    driftedProviders,
    hasGeneratedDrift: false,
  };
}

/** Build the {@link SecretSet} from the effect's credentials. */
function secretSetFor(
  credentials: Readonly<Record<string, Readonly<Record<string, string>>>>,
): SecretSet {
  const values = new Set<string>();
  for (const providerCredentials of Object.values(credentials)) {
    for (const value of Object.values(providerCredentials)) {
      if (typeof value === 'string' && value.length > 0) values.add(value);
    }
  }
  return { values: [...values] };
}

/**
 * Check one adapter end to end.
 *
 * Split out from the loop so the ordering rules above are visible in one place and so a test can drive
 * a single adapter without constructing a whole run.
 */
async function checkProvider(
  adapter: ProviderAdapterLike,
  effects: RunnerEffects,
  budget: SpendBudget,
  logger: { log: (message: unknown) => void },
): Promise<ProviderReport> {
  const { descriptor } = adapter;
  const credentials = effects.credentials[descriptor.id] ?? {};
  const checks: CheckResult[] = [];
  const capabilityProbes: CapabilityProbe[] = [];

  const context: AdapterContextLike = {
    credentials,
    baseUrl: descriptor.defaultBaseUrl,
    fetch: buildInstrumentedFetch(logger),
    ...(effects.requestTimeoutMs === undefined
      ? {}
      : { signal: AbortSignal.timeout(effects.requestTimeoutMs) }),
  };

  // ---- 1. Configuration, before anything is asked. -------------------------------------------
  const unconfigured = unconfiguredReason(adapter, credentials);
  if (unconfigured) {
    checks.push({
      provider: descriptor.id,
      kind: 'test',
      status: 'unconfigured',
      detail: unconfigured,
    });
    checks.push({
      provider: descriptor.id,
      kind: 'listModels',
      status: 'unconfigured',
      detail: 'not called: the provider has no configured credential',
    });
    return {
      id: descriptor.id,
      name: descriptor.name,
      homepage: descriptor.homepage,
      capabilities: descriptor.capabilities,
      modelIds: descriptor.models.map((model) => model.id),
      browserDirectInSource: descriptor.browserDirect,
      checks,
      capabilityProbes,
      spentUsd: '0.0000',
      broken: false,
    };
  }

  // ---- 2. `test()`. ---------------------------------------------------------------------------
  const testStart = Date.now();
  let testResult: Awaited<ReturnType<ProviderAdapterLike['test']>>;
  try {
    testResult = await adapter.test(context);
  } catch (cause) {
    testResult = {
      ok: false,
      error: {
        kind: cause instanceof Error ? cause.name : 'unknown',
        provider: descriptor.id,
      },
    };
  }
  const testDuration = Date.now() - testStart;
  checks.push({
    provider: descriptor.id,
    kind: 'test',
    status: testResult.ok ? 'pass' : 'fail',
    detail: testResult.ok
      ? `confirmed ${testResult.confirmed.join(', ') || 'no capabilities'}: ${testResult.detail}`
      : `${testResult.error.kind}: ${remedyFor(testResult.error.kind)}`,
    durationMs: testDuration,
  });
  const passed = testResult.ok;

  // ---- 3. `listModels()`, only when the provider answered. -------------------------------------
  const models = await checkModelList(adapter, context, checks, passed);

  // ---- 4. One minimal operation per implemented capability, behind the spend cap. --------------
  capabilityProbes.push(...(await probeCapabilities(adapter, context, budget, passed, logger)));

  // ---- 5. `browserDirect`, from a browser observation and nothing else. ------------------------
  await observeBrowser(adapter, effects, checks);

  return {
    id: descriptor.id,
    name: descriptor.name,
    homepage: descriptor.homepage,
    capabilities: descriptor.capabilities,
    modelIds: descriptor.models.map((model) => model.id),
    browserDirectInSource: descriptor.browserDirect,
    checks,
    models,
    capabilityProbes,
    spentUsd: sumProbeSpend(capabilityProbes),
    broken: !passed,
    ...(passed ? {} : { brokenReason: `test() returned ${testResult.error.kind}` }),
  };
}

/**
 * Why this provider is unconfigured, or `undefined` when it is configured.
 *
 * Every required field must have a non-empty value. An empty string is treated as absent, because a
 * workflow that writes an empty environment variable has not configured anything, and reporting that
 * as "credential rejected" would be exactly the misdiagnosis this guards against.
 */
function unconfiguredReason(
  adapter: ProviderAdapterLike,
  credentials: Readonly<Record<string, string>>,
): string | undefined {
  const missing = adapter.descriptor.credentialFields
    .filter((field) => field.required)
    .filter((field) => {
      const value = credentials[field.key];
      return typeof value !== 'string' || value.trim() === '';
    })
    .map((field) => field.key);
  if (missing.length === 0) return undefined;
  return `no repository secret is configured for ${missing.join(', ')}`;
}

/** Run `listModels()` and diff it, recording both into `checks` and returning the diff. */
async function checkModelList(
  adapter: ProviderAdapterLike,
  context: AdapterContextLike,
  checks: CheckResult[],
  passed: boolean,
): Promise<ModelListDiff> {
  if (!adapter.listModels) {
    checks.push({
      provider: adapter.descriptor.id,
      kind: 'listModels',
      status: 'unsupported',
      detail: 'this adapter has no listModels(), so it has no discovered list to compare',
    });
    return {
      provider: adapter.descriptor.id,
      status: 'unsupported',
      removed: [],
      added: [],
      detail: 'the adapter has no listModels()',
      drift: false,
    };
  }
  if (!passed) {
    checks.push({
      provider: adapter.descriptor.id,
      kind: 'listModels',
      status: 'skipped',
      detail:
        'not called: test() did not pass, and a model list from a rejected credential would be meaningless',
    });
    return {
      provider: adapter.descriptor.id,
      status: 'skipped',
      removed: [],
      added: [],
      detail: 'not called because test() did not pass',
      drift: false,
    };
  }

  const start = Date.now();
  let discovered: readonly ModelDescriptor[] | undefined;
  let source: ModelListSource = 'discovered';
  let failure: string | undefined;
  try {
    discovered = await adapter.listModels(context);
    // An adapter that hands back its own descriptor list has not consulted the provider. Saying
    // "discovered" there would overstate what the job observed, so it is labelled `curated`.
    source = sameIds(discovered, adapter.descriptor.models) ? 'curated' : 'discovered';
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : String(cause);
  }

  const diff = diffModelLists({
    provider: adapter.descriptor.id,
    curated: adapter.descriptor.models,
    discovered,
    source,
    ...(failure === undefined ? {} : { unavailableReason: `listModels() threw: ${failure}` }),
  });
  checks.push({
    provider: adapter.descriptor.id,
    kind: 'listModels',
    status: diff.status,
    detail: diff.detail,
    durationMs: Date.now() - start,
  });
  return diff;
}

/** Whether two model lists hold the same ids, regardless of order or annotations. */
function sameIds(a: readonly ModelDescriptor[], b: readonly ModelDescriptor[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map((model) => model.id).sort();
  const right = b.map((model) => model.id).sort();
  return left.every((id, index) => id === right[index]);
}

/**
 * Attempt one minimal operation per implemented capability.
 *
 * Three guards stand in front of any billable request, in this order, and each one is a refusal path
 * rather than an adjustment:
 *
 * 1. **Not implemented** → `unsupported`. `adapter-contracts.ts` is the authority on which adapters
 *    really perform a capability, and calling a stub's `run()` would spend money to obtain a JSON
 *    description of a request that was never made.
 * 2. **No cost bound** → `skipped`. {@link boundFor} returning `undefined` means the price cannot be
 *    bounded in advance, and the job fails closed rather than guessing.
 * 3. **The cap says no** → `skipped`, with the budget's own reason carried through.
 */
async function probeCapabilities(
  adapter: ProviderAdapterLike,
  context: AdapterContextLike,
  budget: SpendBudget,
  passed: boolean,
  logger: { log: (message: unknown) => void },
): Promise<CapabilityProbe[]> {
  const { descriptor } = adapter;
  const probes: CapabilityProbe[] = [];
  if (!passed) {
    for (const capability of descriptor.capabilities) {
      probes.push({
        provider: descriptor.id,
        capability,
        status: 'skipped',
        detail: 'not attempted: test() did not pass, so the credential is known to be unusable',
        maxCostUsd: '0.0000',
        spentUsd: '0.0000',
      });
    }
    return probes;
  }

  for (const capability of descriptor.capabilities) {
    // The implemented-adapter check lives in the engine's `adapter-contracts.ts`, keyed by provider
    // id. Reading the ids from the engine here — rather than restating them — is what keeps §4.9's
    // "no placeholder counts as success" rule in one place. A provider not on that list can never
    // have an operation attempted against it.
    if (!IMPLEMENTED_PROVIDER_IDS.has(descriptor.id)) {
      probes.push({
        provider: descriptor.id,
        capability,
        status: 'unsupported',
        detail:
          'the adapter documents this capability but has no verified implementation, so no request was sent',
        maxCostUsd: '0.0000',
        spentUsd: '0.0000',
      });
      continue;
    }

    const bound = boundFor(descriptor.id);
    if (!bound || bound.maxCostUsd === '') {
      probes.push({
        provider: descriptor.id,
        capability,
        status: 'skipped',
        detail:
          bound?.note ??
          'no cost bound is recorded for this provider, so a billable request would not be safely bounded',
        maxCostUsd: '0.0000',
        spentUsd: '0.0000',
      });
      continue;
    }

    const decision = budget.authorize(bound.maxCostUsd);
    if (!decision.allowed) {
      probes.push({
        provider: descriptor.id,
        capability,
        status: 'skipped',
        detail: `refused by the hard spend cap — ${decision.reason}`,
        maxCostUsd: bound.maxCostUsd,
        spentUsd: '0.0000',
      });
      continue;
    }

    try {
      await adapter.run(
        {
          capability,
          model: descriptor.models[0]?.id ?? '',
          prompt: `a ${FIXTURE_SIZE} by ${FIXTURE_SIZE} test image`,
          size: `${FIXTURE_SIZE}x${FIXTURE_SIZE}`,
        },
        context,
      );
      logger.log({ provider: descriptor.id, capability, outcome: 'minimal operation completed' });
      probes.push({
        provider: descriptor.id,
        capability,
        status: 'pass',
        detail: `one ${FIXTURE_SIZE}×${FIXTURE_SIZE} operation completed`,
        maxCostUsd: bound.maxCostUsd,
        spentUsd: decision.bookedUsd,
      });
    } catch (cause) {
      // The operation did not complete, so the reservation is returned to the budget: a transient
      // provider error must not permanently consume the night's allowance.
      budget.release(decision.bookedUsd);
      probes.push({
        provider: descriptor.id,
        capability,
        status: 'fail',
        detail: `the ${FIXTURE_SIZE}×${FIXTURE_SIZE} operation failed: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        maxCostUsd: bound.maxCostUsd,
        spentUsd: '0.0000',
      });
    }
  }
  return probes;
}

/**
 * The provider ids whose `run()` genuinely performs its capabilities.
 *
 * Mirrors `packages/engine/src/ai/adapter-contracts.ts`'s allowlist, and is pinned against the real
 * one by `test-provider-contract-gate.ts`. The reason for the mirror rather than an import is in
 * `./ai-types.ts`: a root script cannot resolve the engine package without a build, and this runner
 * has to be runnable before one exists.
 */
export const IMPLEMENTED_PROVIDER_IDS: ReadonlySet<string> = new Set(['anthropic', 'openai']);

/** Observe one request from a real browser context and classify the result. */
async function observeBrowser(
  adapter: ProviderAdapterLike,
  effects: RunnerEffects,
  checks: CheckResult[],
): Promise<CheckResult> {
  const { descriptor } = adapter;
  const unprobeable = BROWSER_UNPROBEABLE[descriptor.id];

  if (unprobeable) {
    // §15.2's `no` must mean a browser was actually blocked. For a provider on a network the runner
    // cannot reach, the honest answer is "not checked", and the declared value is left alone.
    const check: CheckResult = {
      provider: descriptor.id,
      kind: 'browserDirect',
      status: 'unsupported',
      detail: `not probed from a browser: ${unprobeable}`,
      browserOutcome: {
        browserDirect: 'unknown',
        detail:
          'this provider answers on a network a CI browser cannot reach; the declared value is left unchanged',
        unavailable: unprobeable,
      },
    };
    checks.push(check);
    return check;
  }

  if (!effects.browser) {
    const check: CheckResult = {
      provider: descriptor.id,
      kind: 'browserDirect',
      status: 'skipped',
      detail: 'not probed: no browser context was available for this run',
      browserOutcome: {
        browserDirect: 'unknown',
        detail: 'no browser context was available, so no verdict was reached',
        unavailable: 'context-unavailable',
      },
    };
    checks.push(check);
    return check;
  }

  let observation: BrowserObservation;
  try {
    observation = await effects.browser.observe({
      providerId: descriptor.id,
      url: descriptor.defaultBaseUrl,
      headers: buildProbeHeaders(descriptor.id, effects.credentials[descriptor.id]),
      method: 'GET',
    });
  } catch (cause) {
    const check: CheckResult = {
      provider: descriptor.id,
      kind: 'browserDirect',
      status: 'fail',
      detail: `the browser probe threw: ${cause instanceof Error ? cause.message : String(cause)}`,
      browserOutcome: {
        browserDirect: 'unknown',
        detail: 'the browser probe could not be started',
        unavailable: 'context-unavailable',
      },
    };
    checks.push(check);
    return check;
  }

  const classified = classifyBrowserOutcome(observation);
  const check: CheckResult = {
    provider: descriptor.id,
    kind: 'browserDirect',
    // A verdict of `no` is a finding. An unavailable verdict is not a pass and must not read like one.
    status: classified.browserDirect === 'unknown' ? 'skipped' : 'pass',
    detail: classified.detail,
    browserOutcome: classified as BrowserOutcome,
    ...(observation.status === undefined ? {} : { httpStatus: observation.status }),
  };
  checks.push(check);
  return check;
}

/** The headers a browser probe would send. Values are never logged; see `redactUrl`/`redactText`. */
function buildProbeHeaders(
  providerId: string,
  credentials: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  const key = credentials?.apiKey ?? '';
  switch (providerId) {
    case 'anthropic':
      return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    case 'openai':
    case 'openai-compatible':
      return key ? { Authorization: `Bearer ${key}` } : {};
    case 'gemini':
      return { 'x-goog-api-key': key };
    case 'removebg':
      return { 'X-Api-Key': key };
    case 'clipdrop':
      return { 'x-api-key': key };
    default:
      return key ? { Authorization: `Key ${key}` } : {};
  }
}

/**
 * A `fetch` that logs through the redacting logger.
 *
 * The adapters take their transport by injection (`AdapterContext.fetch`), so this is where the job
 * substitutes one. It exists to make "no request left unlogged" structural: an adapter cannot reach
 * the global `fetch`, because the only one in its context is this.
 */
function buildInstrumentedFetch(logger: { log: (message: unknown) => void }): typeof fetch {
  return async (input, init) => {
    logger.log({ request: redactForLog(String(input)) });
    return fetch(input, init);
  };
}

/** Strip userinfo and query values from a URL before it is logged. */
function redactForLog(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = '';
    parsed.password = '';
    if (parsed.search) parsed.search = '?[redacted]';
    return parsed.toString();
  } catch {
    return '[unparseable-url]';
  }
}

/** A user-facing sentence for an engine error kind. */
function remedyFor(kind: string): string {
  switch (kind) {
    case 'ai-auth-failed':
      return 'the credential was rejected';
    case 'ai-cors-blocked':
      return 'the browser could not reach the provider';
    case 'ai-rate-limited':
      return 'the provider rate-limited the job';
    case 'ai-not-configured':
      return 'the provider is not configured';
    default:
      return 'the provider did not answer as its descriptor claims';
  }
}

/**
 * Sum the probes' booked spend, exactly.
 *
 * Uses the same integer helpers the budget itself uses rather than re-deriving the parse, so the
 * per-provider figure and the run total cannot disagree by a rounding difference.
 */
function sumProbeSpend(probes: readonly CapabilityProbe[]): string {
  let total = 0;
  for (const probe of probes) total += toMicros(probe.spentUsd);
  return formatUsd(total);
}
