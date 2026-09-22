/**
 * P5-01 — Capability-based provider registry.
 * Key design: providers register by capability, not by hard-coded name.
 * A new adapter declaring `upscale` lights up T32 escalation with zero registry change.
 */

import type {
  AiCapability,
  ProviderAdapter,
  ProviderDescriptor,
  ModelDescriptor,
} from './types.js';

/** Internal registry entry linking an adapter to its descriptor. */
interface RegistryEntry {
  adapter: ProviderAdapter;
  descriptor: ProviderDescriptor;
}

const registry = new Map<string, RegistryEntry>();

/** Register a provider adapter. Idempotent on duplicate id (last wins). */
export function registerProvider(adapter: ProviderAdapter): void {
  const id = adapter.descriptor.id;
  registry.set(id, { adapter, descriptor: adapter.descriptor });
}

/** Unregister by provider id — used in tests, not production flow. */
export function unregisterProvider(id: string): boolean {
  return registry.delete(id);
}

/** All registered provider descriptors. */
export function registeredProviders(): ProviderDescriptor[] {
  return Array.from(registry.values()).map((v) => v.descriptor);
}

/** Lookup adapter + descriptor by provider id. */
export function getProvider(id: string): ProviderAdapter | undefined {
  return registry.get(id)?.adapter;
}

/** All adapters that declare the given capability (primary lookup). */
export function providersByCapability(cap: AiCapability): ProviderAdapter[] {
  return Array.from(registry.values())
    .filter((v) => v.descriptor.capabilities.includes(cap))
    .map((v) => v.adapter);
}

/** All adapters whose descriptor carries at least one of the requested capabilities. */
export function providersByCapabilities(caps: AiCapability[]): ProviderAdapter[] {
  const set = new Set(caps);
  return Array.from(registry.values())
    .filter((v) => v.descriptor.capabilities.some((c) => set.has(c)))
    .map((v) => v.adapter);
}

/** All descriptors that expose at least one capability. */
export function descriptorsWithCapabilities(): ProviderDescriptor[] {
  return Array.from(registry.values())
    .map((v) => v.descriptor)
    .filter((d) => d.capabilities.length > 0);
}

/** All registered adapter descriptors, deterministic order. */
export function allDescriptors(): ProviderDescriptor[] {
  return Array.from(registry.values())
    .map((v) => v.descriptor)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Return true if any registered adapter claims the capability. */
export function capabilityRegistered(cap: AiCapability): boolean {
  return Array.from(registry.values()).some((v) => v.descriptor.capabilities.includes(cap));
}

/** Return capability → provider descriptors mapping (deterministic). */
export function capabilityToProviders(): Map<AiCapability, ProviderDescriptor[]> {
  const result = new Map<AiCapability, ProviderDescriptor[]>();
  const allCaps = new Set<AiCapability>();
  for (const v of registry.values()) {
    for (const c of v.descriptor.capabilities) allCaps.add(c);
  }
  for (const cap of Array.from(allCaps).sort()) {
    result.set(
      cap,
      Array.from(registry.values())
        .filter((v) => v.descriptor.capabilities.includes(cap))
        .map((v) => v.descriptor)
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  }
  return result;
}

/** Find descriptors that declare a model supporting a given capability. */
export function modelsForCapability(cap: AiCapability): ModelDescriptor[] {
  const models: ModelDescriptor[] = [];
  for (const v of registry.values()) {
    for (const m of v.descriptor.models) {
      if (m.capabilities.includes(cap)) {
        models.push({ ...m });
      }
    }
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

/** Clear registry — test-only. */
export function clearRegistry(): void {
  registry.clear();
}

/** Number of registered providers — test-only verification. */
export function registeredCount(): number {
  return registry.size;
}
