/**
 * P5-15 — provider and model selection for the AI-only routes (README §4.9, §13.1.3, §17.2).
 *
 * The routes used to take a free-text endpoint URL and a free-text model string. That design has
 * three problems this module replaces:
 *
 * 1. **It cannot honour a capability.** A URL is not a capability declaration, so nothing stops the
 *    UI offering a model whose adapter does not implement the requested operation.
 * 2. **It ignores the provider's own request shape.** Each adapter builds a different body — JSON
 *    vs multipart, one field or another — and a hand-rolled `{capability, model, prompt, image}`
 *    envelope matches none of them.
 * 3. **It cannot offer or withhold honestly.** With a text box there is nothing to filter against.
 *
 * So selection is driven by `PROVIDER_CATALOGUE` (the P5-14 generated descriptors) and filtered
 * through the engine's `adapterImplementsCapability`. The web app must not bundle all ten adapters to
 * do this — that is the 45 kB connect-ai budget — so a descriptor-only view here, with the adapter
 * itself `import()`ed only when the user presses the request button.
 */

import type {
  AiCapability,
  ModelDescriptor,
  ProviderAdapter,
  ProviderDescriptor,
} from '@complianttools/image-engine/ai/types';
import {
  contractGapMessage,
  descriptorContractGap,
  type ContractGapReason,
} from '@complianttools/image-engine/ai/adapter-contracts';
import { PROVIDER_CATALOGUE } from '../connect/provider-catalogue';
import { IMPLEMENTED_ADAPTER_IDS } from './implemented-adapters';

/** One selectable provider/model pair, with everything the UI needs to render the row. */
export interface ProviderOption {
  readonly descriptor: ProviderDescriptor;
  /** The model this option runs. `undefined` when the provider is used with its own default. */
  readonly model?: ModelDescriptor;
  /** `ai.id/model.id`, or just `ai.id` when the provider has no models. */
  readonly value: string;
  readonly label: string;
}

/**
 * Providers that really implement `capability`, with their models that declare it.
 *
 * Two filters, and both are load-bearing:
 *
 * - the descriptor must declare the capability (§13.2: "Adapters declare capabilities, not models"),
 * - the adapter must actually implement it (`adapterImplementsCapability`).
 *
 * The second filter is what stops the picker listing FLUX or Gemini for generation: their adapters
 * document the endpoint but their `run()` returns a description of a request instead of an image.
 */
export function providerOptionsFor(
  capability: AiCapability,
  catalogue: readonly ProviderDescriptor[] = PROVIDER_CATALOGUE,
  implemented: ReadonlySet<string> = IMPLEMENTED_ADAPTER_IDS,
): ProviderOption[] {
  const options: ProviderOption[] = [];
  for (const descriptor of catalogue) {
    // A provider whose adapter has no verified `run()` is not offered at all, whatever its
    // descriptor claims. Without this the picker would list providers that return a description of
    // a request instead of the image.
    if (!implemented.has(descriptor.id)) continue;
    if (!descriptor.capabilities.includes(capability)) continue;
    // A provider with no models (openai-compatible probes its own) is offered as a single option.
    const models = descriptor.models.filter((model) => model.capabilities.includes(capability));
    if (models.length === 0) {
      options.push({ descriptor, value: descriptor.id, label: descriptor.name });
      continue;
    }
    for (const model of models) {
      options.push({
        descriptor,
        model,
        value: `${descriptor.id}/${model.id}`,
        label: `${descriptor.name} — ${model.label}`,
      });
    }
  }
  return options;
}

/**
 * Providers withheld from `capability`, with the reason, so the UI can explain each absence.
 *
 * §17.3's contract is that every absence is explained. A provider that is silently missing from the
 * picker reads as "we forgot", which is worse than saying its adapter is not verified against the
 * live API.
 */
export interface WithheldProvider {
  readonly descriptor: ProviderDescriptor;
  readonly reason: ContractGapReason;
  readonly message: string;
}

/**
 * Which catalogue providers are withheld from `capability`.
 *
 * Only reports a provider that *claims* the capability in its descriptor but whose adapter does not
 * implement it. A provider that never claimed it is simply a different tool and is not an omission.
 */
export function withheldProvidersFor(
  capability: AiCapability,
  implemented: ReadonlySet<string>,
  catalogue: readonly ProviderDescriptor[] = PROVIDER_CATALOGUE,
): WithheldProvider[] {
  const withheld: WithheldProvider[] = [];
  for (const descriptor of catalogue) {
    // Only a provider that *claims* the capability can be withheld from it. One that never claimed
    // it is simply a different tool, and listing it as missing would be noise.
    if (!descriptor.capabilities.includes(capability)) continue;
    if (implemented.has(descriptor.id)) continue;
    const reason = descriptorContractGap(descriptor, capability, false) ?? 'not-implemented';
    withheld.push({
      descriptor,
      reason,
      message: contractGapMessage(descriptor, capability, reason),
    });
  }
  return withheld;
}

/** Parse a `provider/model` value back into its parts. */
export function parseOptionValue(value: string): {
  readonly providerId: string;
  readonly modelId?: string;
} {
  const slash = value.indexOf('/');
  if (slash === -1) return { providerId: value };
  return { providerId: value.slice(0, slash), modelId: value.slice(slash + 1) };
}

/**
 * The adapter loader map, keyed by provider id.
 *
 * A dynamic `import()` per adapter, exactly as P5-14 does on the walkthrough pages. Importing them
 * statically would put ten `run()` implementations — and every base64 encoder they pull in — into
 * each AI route's initial chunk. A user who never presses the request button should not download
 * any of it.
 */
const ADAPTER_LOADERS: Readonly<Record<string, () => Promise<ProviderAdapter>>> = {
  anthropic: () =>
    import('@complianttools/image-engine/ai/adapters/anthropic').then((m) => m.anthropicAdapter),
  openai: () =>
    import('@complianttools/image-engine/ai/adapters/openai').then((m) => m.openaiAdapter),
  gemini: () =>
    import('@complianttools/image-engine/ai/adapters/gemini').then((m) => m.geminiAdapter),
  stability: () =>
    import('@complianttools/image-engine/ai/adapters/stability').then((m) => m.stabilityAdapter),
  bfl: () => import('@complianttools/image-engine/ai/adapters/bfl').then((m) => m.bflAdapter),
  fal: () => import('@complianttools/image-engine/ai/adapters/fal').then((m) => m.falAdapter),
  replicate: () =>
    import('@complianttools/image-engine/ai/adapters/replicate').then((m) => m.replicateAdapter),
  removebg: () =>
    import('@complianttools/image-engine/ai/adapters/removebg').then((m) => m.removeBgAdapter),
  clipdrop: () =>
    import('@complianttools/image-engine/ai/adapters/clipdrop').then((m) => m.clipdropAdapter),
  'openai-compatible': () =>
    import('@complianttools/image-engine/ai/adapters/openai-compatible').then(
      (m) => m.openaiCompatibleAdapter,
    ),
};

/** Load one adapter, or `undefined` if the id is not one we offer. */
export function loadAdapterFor(providerId: string): Promise<ProviderAdapter | undefined> {
  const loader = ADAPTER_LOADERS[providerId];
  return loader ? loader() : Promise.resolve(undefined);
}

/**
 * The provider ids whose adapters genuinely implement `capability`.
 *
 * Computed once at module load by loading every adapter. That is a real cost — ten dynamic imports
 * — so this is only used by tests and by the `/connect-ai` explanation panels, never by the AI
 * routes' render path. The routes call {@link providerOptionsFor} and filter at the descriptor
 * level, which is why they need no adapter bytes before the user acts.
 */
export async function implementedProviderIdsFor(
  capability: AiCapability,
): Promise<ReadonlySet<string>> {
  const { adapterImplementsCapability } =
    await import('@complianttools/image-engine/ai/adapter-contracts');
  const ids = Object.keys(ADAPTER_LOADERS);
  const adapters = await Promise.all(ids.map((id) => loadAdapterFor(id)));
  const implemented = new Set<string>();
  for (const adapter of adapters) {
    if (adapter && adapterImplementsCapability(adapter, capability))
      implemented.add(adapter.descriptor.id);
  }
  return implemented;
}

/** The resolved endpoint, or the reason there isn't one. Discriminated on `ok`. */
export type EndpointResult =
  { readonly ok: true; readonly url: string } | { readonly ok: false; readonly error: string };

/**
 * The endpoint URL for a provider, honouring a user-supplied base URL.
 *
 * A descriptor's `defaultBaseUrl` is the provider's own API root; the adapters append their own path
 * (`/images/generations`, `/v1/messages`). The `openai-compatible` provider is the case where the
 * user must supply the host, since it is their own server and guessing one would send their images
 * somewhere they never picked.
 */
export function endpointFor(descriptor: ProviderDescriptor, userBaseUrl: string): EndpointResult {
  const trimmed = userBaseUrl.trim();
  if (trimmed !== '') {
    // Local servers are legitimately http:// on localhost; only reject a remote non-HTTPS URL.
    const isLocal = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/u.test(trimmed);
    if (!trimmed.startsWith('https://') && !isLocal) {
      return {
        ok: false,
        error:
          'A provider base URL must use https. Only a localhost address may use http, because that ' +
          'traffic never leaves your machine.',
      };
    }
    return { ok: true, url: trimmed.replace(/\/+$/u, '') };
  }
  if (descriptor.id === 'openai-compatible') {
    return {
      ok: false,
      error:
        'Point at the server you run. Ollama is http://localhost:11434/v1, LM Studio ' +
        'http://localhost:1234/v1, vLLM http://localhost:8000/v1.',
    };
  }
  return { ok: true, url: descriptor.defaultBaseUrl.replace(/\/+$/u, '') };
}
