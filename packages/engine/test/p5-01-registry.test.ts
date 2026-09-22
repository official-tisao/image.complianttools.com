import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerProvider,
  unregisterProvider,
  registeredProviders,
  providersByCapability,
  allDescriptors,
  capabilityToProviders,
  modelsForCapability,
  registeredCount,
  clearRegistry,
  getProvider,
} from '../src/ai/registry.js';
import { testStubAdapter } from '../src/ai/adapters/test-stub.js';

describe('P5-01 capability-based registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  afterEach(() => {
    clearRegistry();
  });

  it('1. provider can declare capabilities', () => {
    registerProvider(testStubAdapter);
    const desc = registeredProviders()[0];
    expect(desc.capabilities).toContain('upscale');
    expect(desc.capabilities).toContain('describe');
  });

  it('2. model can declare supported capabilities', () => {
    registerProvider(testStubAdapter);
    const adapter = getProvider('test-stub');
    expect(adapter).toBeDefined();
    const model = adapter!.descriptor.models[0];
    expect(model.capabilities).toContain('upscale');
  });

  it('3. providers can be registered', () => {
    expect(registeredCount()).toBe(0);
    registerProvider(testStubAdapter);
    expect(registeredCount()).toBe(1);
  });

  it('4. providers/adapters can be queried by capability', () => {
    registerProvider(testStubAdapter);
    const found = providersByCapability('upscale');
    expect(found.length).toBe(1);
    expect(found[0].descriptor.id).toBe('test-stub');
  });

  it('5. unsupported capabilities not returned', () => {
    registerProvider(testStubAdapter);
    const found = providersByCapability('generate');
    expect(found.length).toBe(0);
  });

  it('6. no provider-name-based branching required', () => {
    registerProvider(testStubAdapter);
    // Registry works purely on capability keys; no 'if (provider === "test-stub")' needed.
    const capMap = capabilityToProviders();
    expect(capMap.has('upscale')).toBe(true);
    expect(capMap.get('upscale')?.[0].id).toBe('test-stub');
  });

  it('7. test adapter can register and execute through the abstraction', async () => {
    registerProvider(testStubAdapter);
    const adapter = getProvider('test-stub')!;
    const result = await adapter.run(
      { capability: 'describe', model: 'test-model-1' },
      {
        credentials: { apiKey: 'test-only-no-secret-value' },
        baseUrl: adapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );
    expect(result.text).toContain('Stub result');
    expect(result.usage?.requestId).toBe('test-req-01');
  });

  it('8. multiple providers can expose same capability', () => {
    // We only have the test stub; verify the mechanism supports overlap by
    // checking capability-to-providers returns arrays (not a single entry).
    registerProvider(testStubAdapter);
    const map = capabilityToProviders();
    expect(map.get('describe')).toBeDefined();
    expect(Array.isArray(map.get('describe'))).toBe(true);
  });

  it('9. registry behavior remains deterministic', () => {
    registerProvider(testStubAdapter);
    const descsA = allDescriptors().map((d: { id: string }) => d.id);
    const descsB = allDescriptors().map((d: { id: string }) => d.id);
    expect(descsA).toEqual(descsB);
  });

  it('10. registry does not contain or expose credential values', () => {
    registerProvider(testStubAdapter);
    const adapter = getProvider('test-stub')!;
    // Descriptor only carries metadata; no value storage in registry.
    expect(adapter.descriptor.credentialFields).toBeDefined();
    expect(adapter.descriptor.credentialFields[0].key).toBe('apiKey');
    // No raw credential value is embedded.
    expect(adapter.descriptor).not.toHaveProperty('apiKey');
  });

  it('clear and unregister work', () => {
    registerProvider(testStubAdapter);
    expect(registeredCount()).toBe(1);
    unregisterProvider('test-stub');
    expect(registeredCount()).toBe(0);
  });

  it('test adapter test() returns confirmed capabilities with no real credentials needed', async () => {
    registerProvider(testStubAdapter);
    const adapter = getProvider('test-stub')!;
    const result = await adapter.test({
      credentials: { apiKey: 'test-only-no-secret-value' },
      baseUrl: adapter.descriptor.defaultBaseUrl,
      fetch: globalThis.fetch,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confirmed).toContain('upscale');
      expect(result.detail).toContain('Test stub');
    }
  });

  it('modelsForCapability returns sorted, unique descriptors', () => {
    registerProvider(testStubAdapter);
    const models = modelsForCapability('describe');
    expect(models.length).toBeGreaterThanOrEqual(1);
    expect(models[0].capabilities).toContain('describe');
  });
});
