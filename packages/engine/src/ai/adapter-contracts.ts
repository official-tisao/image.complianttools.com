/**
 * P5-15 — which adapters actually perform a capability, and which only declare it.
 *
 * README §4.9 and §13.1 both lean on a distinction the descriptor type cannot express. A
 * `ProviderDescriptor` carries `capabilities: AiCapability[]`, but across this repository those
 * arrays mix two very different claims:
 *
 * - **Implemented.** `openai` and `anthropic` issue a real request and return a real result.
 * - **Declared.** `gemini`, `stability`, `bfl`, `fal`, `replicate`, `removebg`, and `clipdrop`
 *   document an endpoint and a request shape, and their `run()` returns a description of the call
 *   that *would* be made instead of the image or text. `replicate` even exports its real
 *   implementation as `executePrediction()` without calling it from `run()`.
 *
 * Both are honest as *documentation*. Neither is honest as a UI affordance. Offering a user
 * "FLUX — generate" and then returning a JSON object describing the request, labelled as a
 * generated image, is the exact failure this file exists to prevent.
 *
 * So the rule here is deliberately narrow and auditable:
 *
 * > An adapter is offered for a capability only if its `run()` **really produces that
 * > capability's output** — image pixels for `generate`/`edit`, text for `describe`.
 *
 * This is a declared allowlist of provider ids, not a capability matrix, because the alternative
 * (introspecting `run()` at runtime) is not possible: `run` is a plain function whose body cannot
 * be interrogated, and calling it to find out is exactly the billable action we must not take. A
 * short list a reviewer can check by reading the adapter is auditable in a way runtime heuristics
 * are not.
 *
 * **When an adapter gains a real `run()`, add its id here.** That is the maintenance contract, and
 * the test suite asserts the two stay consistent in the safe direction: an id in this list must
 * have a `run()` that produces the capability's output.
 */

import type { AiCapability, ProviderAdapter, ProviderDescriptor } from './types.js';

/** What a capability's result has to contain for a `run()` to count as real. */
const REQUIRED_OUTPUT: Readonly<Record<AiCapability, 'image' | 'text' | 'mask'>> = {
  generate: 'image',
  edit: 'image',
  inpaint: 'image',
  outpaint: 'image',
  erase: 'image',
  upscale: 'image',
  removeBackground: 'image',
  replaceBackground: 'image',
  describe: 'text',
  segment: 'mask',
};

/**
 * Adapters whose `run()` genuinely performs the capability. Everything else is documentation.
 *
 * Kept as a `Set` of provider ids. `openai` covers generate/edit/inpaint/describe; `anthropic`
 * covers describe only — which is exactly what its descriptor declares, and §13.1.3's register
 * row for describe is satisfied by it.
 */
const IMPLEMENTED_ADAPTER_IDS: ReadonlySet<string> = new Set(['openai', 'anthropic']);

/**
 * Whether an adapter really performs `capability`.
 *
 * False for an id that is not in the allowlist, and false for a capability the adapter's own
 * descriptor does not declare — the allowlist grants the adapter's *implementation*, the
 * descriptor still governs its *surface*, and both must agree before a UI may offer it.
 */
export function adapterImplementsCapability(
  adapter: ProviderAdapter,
  capability: AiCapability,
): boolean {
  if (!IMPLEMENTED_ADAPTER_IDS.has(adapter.descriptor.id)) return false;
  return adapter.descriptor.capabilities.includes(capability);
}

/** Whether an adapter's `run()` is a real implementation at all, independent of capability. */
export function adapterIsImplemented(adapter: ProviderAdapter): boolean {
  return IMPLEMENTED_ADAPTER_IDS.has(adapter.descriptor.id);
}

/**
 * Adapters that really perform `capability`, from a candidate list.
 *
 * Callers pass the adapters they are willing to consider; this filters to the ones that will
 * actually deliver a result. Preserves input order, so a UI can keep its own ranking.
 */
export function implementedAdaptersFor(
  adapters: readonly ProviderAdapter[],
  capability: AiCapability,
): ProviderAdapter[] {
  return adapters.filter((adapter) => adapterImplementsCapability(adapter, capability));
}

/**
 * The reason an adapter is being withheld from a capability's picker.
 *
 * Surfaced in the UI so a user who wonders why a provider they read about on `/connect-ai` is
 * missing here gets a sentence rather than silence. §17.3's contract is that every absence is
 * explained.
 */
export type ContractGapReason = 'not-implemented' | 'capability-not-declared';

/** Describe why `adapter` cannot serve `capability`, or `undefined` when it can. */
export function contractGap(
  adapter: ProviderAdapter,
  capability: AiCapability,
): ContractGapReason | undefined {
  return descriptorContractGap(adapter.descriptor, capability, adapterIsImplemented(adapter));
}

/**
 * The same question asked of a bare descriptor.
 *
 * The web app filters providers from `PROVIDER_CATALOGUE` — generated P5-14 descriptor copies —
 * because importing ten adapters to render a `<select>` would put every `run()` implementation in
 * the route's initial chunk. That means it cannot hand us a `ProviderAdapter`, only a descriptor
 * plus what it knows about implementation. Hence this overload.
 */
export function descriptorContractGap(
  descriptor: Pick<ProviderDescriptor, 'id' | 'name' | 'capabilities'>,
  capability: AiCapability,
  isImplemented: boolean,
): ContractGapReason | undefined {
  if (isImplemented && descriptor.capabilities.includes(capability)) return undefined;
  return descriptor.capabilities.includes(capability)
    ? 'not-implemented'
    : 'capability-not-declared';
}

/** The user-facing sentence for a withheld adapter. */
export function contractGapMessage(
  descriptor: Pick<ProviderDescriptor, 'name'>,
  capability: AiCapability,
  reason: ContractGapReason,
): string {
  return reason === 'not-implemented'
    ? `${descriptor.name} documents ${capability} but has no verified implementation behind it, ` +
        'so it is not offered here. Its adapter has not been confirmed against the live API.'
    : `${descriptor.name} does not implement ${capability}.`;
}

/** What output a capability is expected to produce. Exported so tests and UI share one definition. */
export function requiredOutputFor(capability: AiCapability): 'image' | 'text' | 'mask' {
  return REQUIRED_OUTPUT[capability];
}

/**
 * Whether a result from an adapter's `run()` is usable.
 *
 * §4.9 requires that a placeholder is never reported as success, and the stub adapters' `run()`
 * returns exactly that: a `raw` contract description, `usage.providerCost: '0.00'`, and no pixels.
 * A caller that checked `result.images !== undefined` alone would still pass an empty array, so
 * this checks the *contents* rather than the presence of the key.
 */
export function resultIsUsable(
  result: { readonly images?: readonly unknown[]; readonly text?: string },
  capability: AiCapability,
): boolean {
  const required = REQUIRED_OUTPUT[capability];
  if (required === 'text') return typeof result.text === 'string' && result.text.trim() !== '';
  // A zero-length frame array is what the stub adapters produce; treat it as no result.
  if (required === 'image') {
    return Array.isArray(result.images) && result.images.length > 0;
  }
  // `segment`/`mask` are not offered by any AI-only route in §4.9; the conservative reading is
  // that we have no mask output to verify, so nothing counts as usable.
  return false;
}

/** The ids currently in the allowlist. Exported for the test that pins this list. */
export function implementedAdapterIds(): readonly string[] {
  return [...IMPLEMENTED_ADAPTER_IDS].sort();
}
