/**
 * P5-16 — the shipped Tier 3 surface, derived from the repository's own metadata.
 *
 * README §13.1.3 makes a merge-blocking promise: "**A Tier 3 code path may not be merged without a
 * row in this table.**" §22.4 turns it into a required CI check (*register completeness*), and the
 * whole point of that check is that P11 becomes structural rather than cultural.
 *
 * The obvious way to write it — a hardcoded array of capability names checked against the README — is
 * the one that leaves P11 cultural. It proves the array agrees with the README, which is a statement
 * about a list someone typed. Two failures survive it: a new Tier 3 path never added to the array is
 * invisible, and removing a README row still passes because nothing cross-checks the array against
 * the code that actually ships.
 *
 * So the surface is **derived** from two independent sources the app already depends on:
 *
 * - `TIER3_SURFACE` names the routes that can escalate and the `AiCapability` each escalates to.
 *   This is the same six `Local ⇗AI` tools README §22.6a and §22.4 name, and it is the only place in
 *   the repository that states the route → capability mapping, so a route edited in one place and
 *   forgotten in the other is exactly the drift `implemented-adapters.ts` warns about.
 * - `shippedTier3Paths()` asks the **live adapter registry** for the providers behind each
 *   capability, so an adapter that declares a capability is seen immediately with no edit here.
 *
 * A register row is then required for every path some registered adapter declares. That is the
 * narrow, correct trigger — it is a Tier 3 path in the sense §13.1.3 means.
 *
 * Two boundaries are worth stating, because both look like loopholes and are not:
 *
 * - The ten `AiCapability` values as a bare set are **not** the trigger. `segment`, `erase`, and
 *   `outpaint` are declared by adapters no route can reach and no adapter `run()` implements;
 *   demanding a row for each would demand rows for code paths that do not ship.
 * - Whether an adapter's `run()` is *implemented* is reported as evidence but does **not** gate the
 *   row. The register's job is to justify why Tiers 0–2 measurably fail for a capability, which is
 *   true of the path regardless of how many adapters currently perform it. Gating on `run()` would
 *   let a register row be deleted simply by not finishing an adapter.
 */

import type { AiCapability } from './types.js';
import { providersByCapability } from './registry.js';
import { adapterImplementsCapability } from './adapter-contracts.js';

/**
 * The shipped routes that can escalate to an external model, and the capability each escalates to.
 *
 * §13.1.2's ladder is `Local ⇗AI`, and the product name for the AI end of it is "Tier 3". Every entry
 * has a working local path a user may choose to leave. The three AI-only routes (`/ai/generate`,
 * `/ai/edit`, `/ai/describe`) are deliberately absent: they have no local path, so there is nothing
 * to escalate *from*. They carry register rows already, because their whole existence is the
 * justification.
 */
export interface Tier3Route {
  /** The shipped route path, as the web app serves it. */
  readonly route: string;
  /** The tool number from README Appendix A. Also the register row's anchor. */
  readonly tool: string;
  /** The `AiCapability` this route escalates to. */
  readonly capability: AiCapability;
}

export const TIER3_SURFACE: readonly Tier3Route[] = [
  { route: '/upscale', tool: 'T32', capability: 'upscale' },
  { route: '/ocr', tool: 'T62', capability: 'describe' },
  { route: '/remove-object', tool: 'T66', capability: 'inpaint' },
  { route: '/expand-image', tool: 'T67', capability: 'outpaint' },
  { route: '/remove-background', tool: 'T68', capability: 'removeBackground' },
  { route: '/replace-background', tool: 'T69', capability: 'replaceBackground' },
];

/** One derived Tier 3 path: a shipped route plus the provider evidence behind it. */
export interface ShippedTier3Path {
  readonly route: string;
  readonly tool: string;
  readonly capability: AiCapability;
  /** Provider ids declaring this capability. Documentation-only adapters included. */
  readonly declaredProviders: readonly string[];
  /**
   * The subset whose `run()` also really performs the capability — the providers that could actually
   * bill a user. Evidence for the register row, never a gate on it.
   */
  readonly implementedProviders: readonly string[];
}

/**
 * Every shipped Tier 3 path, with provider evidence attached.
 *
 * A route whose capability no registered adapter declares is omitted: with nothing to reach, the
 * route cannot make a request, so it is not a Tier 3 path and must not demand a register row. If a
 * future adapter declares one, the route reappears here and the register check starts demanding its
 * row — which is the behaviour §13.1.3 wants, arriving from a code change rather than a checklist.
 *
 * Reads the registry, so callers must have imported the adapter registrations first (see
 * `adapters/index.ts`). Returning an empty list against an unpopulated registry would otherwise make
 * the check silently vacuous rather than failing.
 */
export function shippedTier3Paths(): readonly ShippedTier3Path[] {
  const paths: ShippedTier3Path[] = [];
  for (const entry of TIER3_SURFACE) {
    const adapters = providersByCapability(entry.capability);
    if (adapters.length === 0) continue;
    paths.push({
      route: entry.route,
      tool: entry.tool,
      capability: entry.capability,
      declaredProviders: adapters
        .map((adapter) => adapter.descriptor.id)
        .slice()
        .sort(),
      implementedProviders: adapters
        .filter((adapter) => adapterImplementsCapability(adapter, entry.capability))
        .map((adapter) => adapter.descriptor.id)
        .sort(),
    });
  }
  return paths;
}

/** The distinct capabilities the shipped surface escalates to, in sorted order. */
export function shippedEscalationCapabilities(): AiCapability[] {
  return [...new Set(TIER3_SURFACE.map((entry) => entry.capability))].sort();
}
