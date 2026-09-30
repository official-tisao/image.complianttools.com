/**
 * Regenerates `apps/web/src/lib/connect/provider-catalogue.ts` from the live adapter descriptors.
 *
 * ## Why this file exists
 *
 * `/connect-ai` has a 45 kB JavaScript budget. Importing the adapters directly to read their
 * descriptors pulls every adapter's `run()` implementation into the hub's client bundle — about
 * 16 kB gzipped on top of an ~18 kB i18n catalog and a ~41 kB baseline, which is roughly double the
 * budget. The page needs the descriptors at build time and needs exactly one adapter at run time.
 *
 * So the descriptors are captured here, at authoring time, into a plain data module. Two things
 * make that safe rather than a silent copy:
 *
 * 1. **`checkProviderCatalogue` re-derives the same data from the live adapters and compares it
 *    field by field.** A descriptor change that does not regenerate this file fails the test suite.
 *    Drift cannot pass silently.
 * 2. **The walkthrough dynamic-imports only the one adapter it needs** when the user presses
 *    *Test connection*, so `run()` reaches the client at the moment it is used and not before.
 *
 * Run with: `tsx scripts/generate-provider-catalogue.mts`
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProviderDescriptor } from '@complianttools/image-engine/ai/types';
import { anthropicAdapter } from '@complianttools/image-engine/ai/adapters/anthropic';
import { openaiAdapter } from '@complianttools/image-engine/ai/adapters/openai';
import { geminiAdapter } from '@complianttools/image-engine/ai/adapters/gemini';
import { stabilityAdapter } from '@complianttools/image-engine/ai/adapters/stability';
import { bflAdapter } from '@complianttools/image-engine/ai/adapters/bfl';
import { falAdapter } from '@complianttools/image-engine/ai/adapters/fal';
import { replicateAdapter } from '@complianttools/image-engine/ai/adapters/replicate';
import { removeBgAdapter } from '@complianttools/image-engine/ai/adapters/removebg';
import { clipdropAdapter } from '@complianttools/image-engine/ai/adapters/clipdrop';
import { openaiCompatibleAdapter } from '@complianttools/image-engine/ai/adapters/openai-compatible';

/** The adapters the connect pages offer, in README §17.2's order. */
export const CATALOGUE_ADAPTERS: readonly ProviderDescriptor[] = [
  anthropicAdapter.descriptor,
  openaiAdapter.descriptor,
  geminiAdapter.descriptor,
  stabilityAdapter.descriptor,
  bflAdapter.descriptor,
  falAdapter.descriptor,
  replicateAdapter.descriptor,
  removeBgAdapter.descriptor,
  clipdropAdapter.descriptor,
  openaiCompatibleAdapter.descriptor,
];

/** The subset of a descriptor the connect pages read. The rest is the adapter's own business. */
export type CataloguedProvider = {
  id: string;
  name: string;
  homepage: string;
  keysUrl: string;
  pricingUrl: string;
  docsUrl: string;
  credentialFields: ProviderDescriptor['credentialFields'];
  allowsCustomBaseUrl: boolean;
  defaultBaseUrl: string;
  capabilities: ProviderDescriptor['capabilities'];
  browserDirect: ProviderDescriptor['browserDirect'];
  browserDirectNote?: string;
  costHint?: string;
  dataPolicy: ProviderDescriptor['dataPolicy'];
  models: { id: string; label: string; capabilities: ProviderDescriptor['capabilities']; notes?: string }[];
};

/** Reduce a live descriptor to the fields the pages consume. */
export function catalogueProvider(descriptor: ProviderDescriptor): CataloguedProvider {
  return {
    id: descriptor.id,
    name: descriptor.name,
    homepage: descriptor.homepage,
    keysUrl: descriptor.keysUrl,
    pricingUrl: descriptor.pricingUrl,
    docsUrl: descriptor.docsUrl,
    credentialFields: descriptor.credentialFields,
    allowsCustomBaseUrl: descriptor.allowsCustomBaseUrl,
    defaultBaseUrl: descriptor.defaultBaseUrl,
    capabilities: descriptor.capabilities,
    browserDirect: descriptor.browserDirect,
    ...(descriptor.browserDirectNote === undefined ? {} : { browserDirectNote: descriptor.browserDirectNote }),
    ...(descriptor.costHint === undefined ? {} : { costHint: descriptor.costHint }),
    dataPolicy: descriptor.dataPolicy,
    models: descriptor.models.map((m) => ({
      id: m.id,
      label: m.label,
      capabilities: m.capabilities,
      ...(m.notes === undefined ? {} : { notes: m.notes }),
    })),
  };
}

/** The expected catalogue, derived from the live adapters every time this module loads. */
export function expectedCatalogue(): readonly CataloguedProvider[] {
  return CATALOGUE_ADAPTERS.map(catalogueProvider);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CATALOGUE_PATH = path.join(
  HERE,
  'src',
  'lib',
  'connect',
  'provider-catalogue.ts',
);

/** The generated module's source text, with no timestamp so the output is reproducible. */
export function renderCatalogueModule(providers: readonly CataloguedProvider[]): string {
  return `/**
 * P5-14 — provider descriptors, captured from the adapters at authoring time.
 *
 * GENERATED FILE — do not edit. Run \`pnpm generate:provider-catalogue\` after changing any adapter
 * descriptor, and \`checkProviderCatalogue\` in the test suite fails if you forget.
 *
 * The connect pages need the descriptors to build the chooser table and each walkthrough, and
 * need exactly one adapter at run time (on *Test connection*). Importing the adapters for their
 * descriptors would put all ten \`run()\` implementations in the hub's client bundle and roughly
 * double the 45 kB budget. Capturing the data here keeps that bundle small; the drift test keeps
 * the copy honest.
 *
 * Every field below is a verbatim copy of the adapter's own descriptor. Nothing on the connect
 * pages is sourced from anywhere else.
 */

import type { ProviderDescriptor } from '@complianttools/image-engine/ai/types';

/** Captured from the adapter descriptors. See the header for how to regenerate. */
export const PROVIDER_CATALOGUE: readonly ProviderDescriptor[] = ${JSON.stringify(providers, null, 2)} as const satisfies readonly ProviderDescriptor[];
`;
}

/** Compare the generated module's data against the live adapters, field by field. */
export async function checkProviderCatalogue(): Promise<string[]> {
  const source = await readFile(CATALOGUE_PATH, 'utf8');
  const match = source.match(
    /export const PROVIDER_CATALOGUE: readonly ProviderDescriptor\[\] = ([\s\S]*?) as const satisfies/su,
  );
  if (!match?.[1]) return ['could not find PROVIDER_CATALOGUE in provider-catalogue.ts'];

  const actual: CataloguedProvider[] = JSON.parse(match[1]);
  const expected = expectedCatalogue();
  const problems: string[] = [];

  if (actual.length !== expected.length) {
    problems.push(
      `provider count is ${actual.length}, adapters provide ${expected.length} — a provider was added or removed without regenerating`,
    );
  }
  for (const want of expected) {
    const got = actual.find((p) => p.id === want.id);
    if (!got) {
      problems.push(`provider "${want.id}" is missing from the catalogue`);
      continue;
    }
    for (const key of Object.keys(want) as (keyof CataloguedProvider)[]) {
      const a = JSON.stringify(got[key]);
      const b = JSON.stringify(want[key]);
      if (a !== b) {
        problems.push(`provider "${want.id}" field "${key}" has drifted: catalogue has ${a}, adapter has ${b}`);
      }
    }
  }
  for (const got of actual) {
    if (!expected.some((p) => p.id === got.id)) {
      problems.push(`provider "${got.id}" is in the catalogue but no adapter provides it`);
    }
  }
  return problems;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const providers = expectedCatalogue();
  await writeFile(CATALOGUE_PATH, renderCatalogueModule(providers), 'utf8');
  console.log(
    `wrote ${path.relative(process.cwd(), CATALOGUE_PATH)} with ${providers.length} providers`,
  );
}
