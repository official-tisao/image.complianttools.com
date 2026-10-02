/**
 * P5-17 — loading the real adapters and their source files.
 *
 * The job must run against the adapters that ship, not against a list someone maintained for it: a
 * contract job that checked a copy of the adapters would go on reporting green while the shipped ones
 * drifted, which is the exact failure §22.7 exists to prevent. So both functions here go to the engine
 * itself — the same built `dist/` that `check-register-completeness.ts` reads for its registry — and
 * nothing in this directory hard-codes a provider id for the purpose of checking one.
 *
 * The fixture-adding path, `test-stub`, is excluded for a reason worth stating: it is a test adapter
 * whose `run()` returns a description of a request rather than a result. Running the contract job
 * against it would either report a pass that §4.9 forbids or spend a night producing a finding about
 * a fixture. The exclusion is on the id, and it is asserted in the tests so that adding a second
 * fixture cannot quietly join the real run.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { ProviderAdapterLike } from './ai-types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ENGINE_DIST = path.join(ROOT, 'packages', 'engine', 'dist');

/** The adapter module files in `packages/engine/src/ai/adapters/`, by provider id. */
const ADAPTER_SOURCE_PATHS: Readonly<Record<string, string>> = {
  anthropic: 'anthropic.ts',
  openai: 'openai.ts',
  gemini: 'gemini.ts',
  stability: 'stability.ts',
  bfl: 'bfl.ts',
  fal: 'fal.ts',
  replicate: 'replicate.ts',
  removebg: 'removebg.ts',
  clipdrop: 'clipdrop.ts',
  'openai-compatible': 'openai-compatible.ts',
};

/**
 * Provider ids excluded from the live run.
 *
 * `test-stub` is a fixture, not a service. It has no endpoint, no credential, and no real `run()`.
 */
export const EXCLUDED_PROVIDERS: ReadonlySet<string> = new Set(['test-stub']);

/**
 * Load every real adapter from the built engine.
 *
 * Returns them narrowed to the surface this job drives, so the runner cannot accidentally reach a
 * method the contract does not cover. Throws if the engine has not been built, because a job that
 * silently checked nothing is worse than one that stops.
 */
export async function readAdapters(): Promise<ProviderAdapterLike[]> {
  let module: Record<string, unknown>;
  try {
    module = (await import(
      pathToFileURL(path.join(ENGINE_DIST, 'ai', 'adapters', 'index.js')).href
    )) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(
      'The engine must be built before the provider contract job runs ' +
        `(\`pnpm --filter @complianttools/image-engine build\`): ${String(cause)}`,
    );
  }

  const adapters: ProviderAdapterLike[] = [];
  for (const [name, value] of Object.entries(module)) {
    if (!name.endsWith('Adapter')) continue;
    if (typeof value !== 'object' || value === null) continue;
    const adapter = value as ProviderAdapterLike;
    if (EXCLUDED_PROVIDERS.has(adapter.descriptor?.id ?? '')) continue;
    adapters.push(adapter);
  }
  // §17.2's order is not reproducible from the module's export order, and a report whose rows move
  // between nights is a report nobody can diff. Sorting by id makes the run reproducible, which is
  // the property that actually matters here.
  adapters.sort((a, b) => a.descriptor.id.localeCompare(b.descriptor.id));
  return adapters;
}

/**
 * Read each adapter's source text, keyed by provider id.
 *
 * The source is needed to rewrite a `browserDirect` line in place. Only the adapters listed in
 * {@link ADAPTER_SOURCE_PATHS} are read; a missing file is omitted rather than faked, so the
 * patcher simply declines to touch a provider whose source it could not find.
 */
export async function readAdapterSourceFiles(): Promise<
  ReadonlyMap<string, { path: string; source: string }>
> {
  const sources = new Map<string, { path: string; source: string }>();
  for (const [providerId, fileName] of Object.entries(ADAPTER_SOURCE_PATHS)) {
    const filePath = path.join(ROOT, 'packages', 'engine', 'src', 'ai', 'adapters', fileName);
    try {
      sources.set(providerId, { path: filePath, source: await readFile(filePath, 'utf8') });
    } catch {
      // Deliberately absent rather than empty: an absent source must not look like a source with no
      // `browserDirect` line to rewrite.
    }
  }
  return sources;
}

/** Provider ids the job knows how to reach source for. Used by the patch tests. */
export function adapterSourcePath(providerId: string): string | undefined {
  const fileName = ADAPTER_SOURCE_PATHS[providerId];
  return fileName
    ? path.join(ROOT, 'packages', 'engine', 'src', 'ai', 'adapters', fileName)
    : undefined;
}
