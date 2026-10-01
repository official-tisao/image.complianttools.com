/**
 * P5-15 — the implemented-adapter allowlist, as a plain `Set` the UI can filter with.
 *
 * A re-export rather than a second list. `adapter-contracts.ts` in the engine is the single
 * declaration of which adapters genuinely implement a capability, and duplicating it here would
 * create exactly the drift this repo's other generated copies were built to avoid — a provider added
 * to the engine's list would be withheld from the picker until someone remembered to update a
 * second file.
 *
 * It is a module-level constant rather than a call because the web app filters providers from
 * descriptor copies (see `providers.ts`) and must not import ten adapters to render a `<select>`.
 * This constant costs nothing; `implementedProviderIdsFor` exists for the cases that do need the
 * adapters themselves.
 */

import { implementedAdapterIds } from '@complianttools/image-engine/ai/adapter-contracts';

export const IMPLEMENTED_ADAPTER_IDS: ReadonlySet<string> = new Set(implementedAdapterIds());
