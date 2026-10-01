/**
 * P5-15 — capability honesty for the AI-only routes (README §4.9, §13.1.3).
 *
 * The rule under test is the one in `adapter-contracts.ts`: **a provider is offered for a capability
 * only if its `run()` really produces that capability's output.** Across this repository the
 * descriptor `capabilities` arrays conflate "documents this endpoint" with "does this work", and
 * offering a user the former while delivering the latter's absence is exactly the failure mode
 * §4.9's "display usable provider results" rule exists to prevent.
 *
 * These tests are mock-only. No adapter performs a network call; `test()` and `run()` are exercised
 * through injected fakes.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  adapterImplementsCapability,
  contractGap,
  contractGapMessage,
  descriptorContractGap,
  implementedAdapterIds,
  implementedAdaptersFor,
  requiredOutputFor,
  resultIsUsable,
} from '../src/ai/adapter-contracts.js';
import {
  capabilityToProviders,
  providersByCapability,
  allDescriptors,
} from '../src/ai/registry.js';
import type { AiCapability, ProviderAdapter, ProviderDescriptor } from '../src/ai/types.js';
import {
  anthropicAdapter,
  openaiAdapter,
  geminiAdapter,
  replicateAdapter,
  bflAdapter,
} from '../src/ai/adapters/index.js';

/** A minimal descriptor, so each test states only what it cares about. */
function descriptor(
  id: string,
  capabilities: AiCapability[],
  overrides: Partial<ProviderDescriptor> = {},
): ProviderDescriptor {
  return {
    id,
    name: `Test ${id}`,
    homepage: 'https://example.test/',
    keysUrl: 'https://example.test/keys',
    pricingUrl: 'https://example.test/pricing',
    docsUrl: 'https://example.test/docs',
    credentialFields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'test-key', secret: true, required: true },
    ],
    allowsCustomBaseUrl: false,
    defaultBaseUrl: 'https://example.test/v1',
    capabilities,
    models: [{ id: `${id}-model`, label: 'Model', capabilities }],
    browserDirect: 'unknown',
    dataPolicy: { summary: 'Test.', url: 'https://example.test/' },
    ...overrides,
  };
}

/** An adapter whose `run()` returns whatever `output` holds, with no network. */
function adapterFor(d: ProviderDescriptor, output: unknown = {}): ProviderAdapter {
  return {
    descriptor: d,
    test: async () => ({ ok: true as const, confirmed: d.capabilities, detail: 'mock' }),
    run: async () => output,
  };
}

describe('P5-15 adapter contracts', () => {
  describe('the allowlist', () => {
    it('contains exactly the adapters whose run() is a real implementation', () => {
      expect(implementedAdapterIds()).toEqual(['anthropic', 'openai']);
    });

    it('offers openai for every capability its descriptor declares', () => {
      for (const capability of openaiAdapter.descriptor.capabilities) {
        expect(adapterImplementsCapability(openaiAdapter, capability)).toBe(true);
      }
    });

    it('offers anthropic for describe but not for image capabilities', () => {
      expect(anthropicAdapter.descriptor.capabilities).toEqual(['describe']);
      expect(adapterImplementsCapability(anthropicAdapter, 'describe')).toBe(true);
      // Anthropic does not generate images, and must never be offered for it.
      expect(adapterImplementsCapability(anthropicAdapter, 'generate')).toBe(false);
      expect(adapterImplementsCapability(anthropicAdapter, 'edit')).toBe(false);
    });

    it('withholds adapters whose run() returns a contract description rather than a result', () => {
      // gemini, replicate and bfl all document endpoints; none of them produces output from run().
      for (const adapter of [geminiAdapter, replicateAdapter, bflAdapter]) {
        expect(adapterImplementsCapability(adapter, 'generate')).toBe(false);
        expect(adapterImplementsCapability(adapter, 'describe')).toBe(false);
      }
    });
  });

  describe('descriptor-declared capability is not enough', () => {
    it('refuses a capability the descriptor does not declare, even for an implemented adapter', () => {
      // `openai` is in the allowlist, but it does not declare `upscale`.
      expect(openaiAdapter.descriptor.capabilities).not.toContain('upscale');
      expect(adapterImplementsCapability(openaiAdapter, 'upscale')).toBe(false);
    });

    it('refuses a stubbed adapter for a capability it does declare', () => {
      // bfl declares generate; it is still withheld because run() does not perform it.
      expect(bflAdapter.descriptor.capabilities).toContain('generate');
      expect(adapterImplementsCapability(bflAdapter, 'generate')).toBe(false);
    });

    it('filters a candidate list to the adapters that will actually deliver', () => {
      const implemented = adapterFor(descriptor('openai', ['generate', 'edit']));
      const stub = adapterFor(descriptor('bfl', ['generate']));
      const result = implementedAdaptersFor([implemented, stub], 'generate');
      expect(result).toEqual([implemented]);
    });
  });

  describe('explaining every absence', () => {
    it('distinguishes "not implemented" from "not declared"', () => {
      const stub = adapterFor(descriptor('bfl', ['generate']));
      expect(contractGap(stub, 'generate')).toBe('not-implemented');

      const implemented = adapterFor(descriptor('openai', ['generate']));
      expect(contractGap(implemented, 'generate')).toBeUndefined();
      expect(contractGap(implemented, 'upscale')).toBe('capability-not-declared');
    });

    it('answers the same question from a bare descriptor, as the web app must', () => {
      // The web app filters generated descriptor copies and must not import adapters to do it.
      const d = descriptor('fal', ['generate', 'describe']);
      expect(descriptorContractGap(d, 'generate', true)).toBeUndefined();
      expect(descriptorContractGap(d, 'generate', false)).toBe('not-implemented');
      expect(descriptorContractGap(d, 'erase', false)).toBe('capability-not-declared');
    });

    it('produces a message that names the provider and the reason', () => {
      const d = descriptor('fal', ['generate']);
      const message = contractGapMessage(d, 'generate', 'not-implemented');
      expect(message).toContain('Test fal');
      expect(message).toContain('generate');
      expect(message).toContain('no verified implementation');
    });
  });

  describe('placeholder results are not success', () => {
    it('rejects a result with no output at all', () => {
      expect(resultIsUsable({}, 'generate')).toBe(false);
      expect(resultIsUsable({}, 'describe')).toBe(false);
    });

    it('rejects an empty image array', () => {
      expect(resultIsUsable({ images: [] }, 'generate')).toBe(false);
    });

    it('rejects blank text', () => {
      expect(resultIsUsable({ text: '' }, 'describe')).toBe(false);
      expect(resultIsUsable({ text: '   \n ' }, 'describe')).toBe(false);
    });

    it('accepts a real result', () => {
      expect(resultIsUsable({ images: [{ width: 1 }] }, 'generate')).toBe(true);
      expect(resultIsUsable({ text: 'A red square.' }, 'describe')).toBe(true);
    });

    it('never reports a mask capability as usable, since no route produces one here', () => {
      // `segment` is declared by several adapters but no AI-only route in §4.9 offers it. Reporting
      // a mask as verifiable would be a claim nothing checks.
      expect(requiredOutputFor('segment')).toBe('mask');
      expect(resultIsUsable({ images: [{ width: 1 }] }, 'segment')).toBe(false);
    });
  });

  describe('the registry now sees the implemented adapters', () => {
    it('finds openai and anthropic by capability', () => {
      // They were implemented and unit-tested but never registered, so `providersByCapability`
      // returned only adapters whose run() is a stub.
      const describe_ = providersByCapability('describe').map((a) => a.descriptor.id);
      expect(describe_).toContain('anthropic');
      expect(describe_).toContain('openai');

      const generate = providersByCapability('generate').map((a) => a.descriptor.id);
      expect(generate).toContain('openai');
    });

    it('reports a descriptor for every registered adapter', () => {
      expect(allDescriptors().length).toBeGreaterThanOrEqual(11);
      expect(capabilityToProviders().has('describe')).toBe(true);
    });
  });

  describe('no adapter is invoked during these checks', () => {
    it('never calls run() when deciding whether to offer a capability', () => {
      const run = vi.fn(async () => ({ text: 'should never be called' }));
      const stub: ProviderAdapter = { ...adapterFor(descriptor('fal', ['generate'])), run };
      // The contract question is answered from the descriptor and the allowlist, not by running it.
      expect(adapterImplementsCapability(stub, 'generate')).toBe(false);
      expect(run).not.toHaveBeenCalled();
    });
  });
});
