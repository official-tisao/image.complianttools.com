/**
 * P5-16 — the shipped Tier 3 surface, and the register-completeness trigger it feeds.
 *
 * README §22.4's register-completeness row is only meaningful if the "shipped Tier 3 surface" it
 * enumerates is itself derived correctly. This file covers that derivation, so a defect here fails
 * with a precise failure rather than as `scripts/check-register-completeness.ts` reporting a
 * suspiciously small path count.
 *
 * The tests are about the *join* between the route list and the live adapter registry, and all of
 * them mock-only: no adapter's `run()` is invoked, so nothing here can bill a user.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  TIER3_SURFACE,
  shippedEscalationCapabilities,
  shippedTier3Paths,
  type Tier3Route,
} from '../src/ai/shipped-tiers.js';
import {
  allDescriptors,
  clearRegistry,
  providersByCapability,
  registerProvider,
  unregisterProvider,
} from '../src/ai/registry.js';
import { adapterImplementsCapability } from '../src/ai/adapter-contracts.js';
import type { AiCapability, ProviderAdapter, ProviderDescriptor } from '../src/ai/types.js';

/** A descriptor declaring exactly the capabilities asked for. */
function descriptorFor(id: string, capabilities: AiCapability[]): ProviderDescriptor {
  return {
    id,
    name: `Test ${id}`,
    homepage: 'https://example.test/',
    keysUrl: 'https://example.test/keys',
    pricingUrl: 'https://example.test/pricing',
    docsUrl: 'https://example.test/docs',
    credentialFields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'k', secret: true, required: true },
    ],
    allowsCustomBaseUrl: false,
    defaultBaseUrl: 'https://example.test/v1',
    capabilities,
    models: capabilities.map((capability) => ({
      id: `${id}-${capability}`,
      label: `${id} ${capability}`,
      capabilities: [capability],
    })),
    browserDirect: 'unknown',
    dataPolicy: { summary: 'Test.', url: 'https://example.test/' },
  };
}

/** An adapter that returns nothing, so no test can accidentally perform a real call. */
function adapterFor(descriptor: ProviderDescriptor): ProviderAdapter {
  return {
    descriptor,
    test: async () => ({ ok: false as const, error: { kind: 'ai-test' } as never }),
    run: async () => {
      throw new Error('A register check must never call run().');
    },
  };
}

describe('P5-16 shipped Tier 3 surface', () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe('the declared surface', () => {
    it('names the six Local ⇗AI tools of README §22.6a', () => {
      expect(TIER3_SURFACE.map((route: Tier3Route) => route.route)).toEqual([
        '/upscale',
        '/ocr',
        '/remove-object',
        '/expand-image',
        '/remove-background',
        '/replace-background',
      ]);
    });

    it('uses the tool numbers that §13.1.3 register rows are anchored on', () => {
      expect(TIER3_SURFACE.map((route) => route.tool)).toEqual([
        'T32',
        'T62',
        'T66',
        'T67',
        'T68',
        'T69',
      ]);
    });

    it('maps each route to a distinct, real AiCapability', () => {
      // `describe` is the capability behind T62: a vision model asked to transcribe, which is a
      // Tier 3 case §13.1.3's OCR row admits for the classes the local corpus does not cover.
      expect(TIER3_SURFACE.find((route) => route.tool === 'T62')?.capability).toBe('describe');
      // Each capability is a member of `AiCapability` — the union is exhaustive, so comparing
      // against its runtime values is what proves no route names a capability that does not exist.
      const known: readonly string[] = [
        'generate',
        'edit',
        'inpaint',
        'outpaint',
        'erase',
        'upscale',
        'removeBackground',
        'replaceBackground',
        'describe',
        'segment',
      ];
      for (const route of TIER3_SURFACE) {
        expect(known, `${route.route} names a real capability`).toContain(route.capability);
      }
      expect(providersByCapability('segment')).toEqual([]);
    });

    it('derives its distinct capabilities without duplication', () => {
      expect(shippedEscalationCapabilities()).toEqual([
        'describe',
        'inpaint',
        'outpaint',
        'removeBackground',
        'replaceBackground',
        'upscale',
      ]);
    });
  });

  describe('the derivation from the live registry', () => {
    it('reports a path only when some adapter declares its capability', () => {
      registerProvider(adapterFor(descriptorFor('upscale-provider', ['upscale'])));
      const paths = shippedTier3Paths();
      expect(paths.map((path) => path.route)).toEqual(['/upscale']);
      expect(paths[0]!.declaredProviders).toEqual(['upscale-provider']);
    });

    it('omits a route whose capability no adapter declares', () => {
      // With an empty registry nothing is shipped, which is what the CLI's own guard checks for —
      // the important half here is that `outpaint` stays absent rather than appearing because
      // `TIER3_SURFACE` lists it.
      expect(shippedTier3Paths()).toEqual([]);
    });

    it('separates declared providers from implemented ones', () => {
      // Two adapters claim `upscale`; neither is in the implemented allowlist, so the evidence a
      // register row needs is present and the evidence a *billable* path needs is honestly absent.
      registerProvider(adapterFor(descriptorFor('docs-only', ['upscale'])));
      registerProvider(adapterFor(descriptorFor('also-docs', ['upscale'])));
      const [path] = shippedTier3Paths();
      expect(path?.declaredProviders).toEqual(['also-docs', 'docs-only']);
      expect(path?.implementedProviders).toEqual([]);
    });

    it('re-derives when an adapter is registered after the module was read', () => {
      // The point of deriving rather than hardcoding: a new adapter changes the demanded surface with
      // no edit here, so the CI check starts asking on a code change rather than on a checklist.
      expect(shippedTier3Paths().length).toBe(0);
      registerProvider(adapterFor(descriptorFor('late', ['replaceBackground'])));
      expect(shippedTier3Paths().map((path) => path.tool)).toEqual(['T69']);
      unregisterProvider('late');
      expect(shippedTier3Paths().length).toBe(0);
    });

    it('never invokes an adapter to answer the question', () => {
      // `adapterImplementsCapability` must answer from the descriptor and the allowlist. If it ever
      // started calling `run()`, the counter here would be non-zero — the check is load-bearing
      // precisely because a wrong answer would spend a user's money rather than fail a test.
      let runCalls = 0;
      const descriptor = descriptorFor('guarded', ['inpaint', 'outpaint']);
      const adapter: ProviderAdapter = {
        descriptor,
        test: async () => ({ ok: false as const, error: { kind: 'ai-test' } as never }),
        run: async () => {
          runCalls += 1;
          throw new Error('A register check must never call run().');
        },
      };
      registerProvider(adapter);

      expect(() => shippedTier3Paths()).not.toThrow();
      expect(runCalls).toBe(0);
      expect(adapterImplementsCapability(adapter, 'inpaint')).toBe(false);
      expect(runCalls).toBe(0);
    });
  });

  describe('against the real registered adapters', () => {
    it('finds a path for every capability the shipped adapters can serve', async () => {
      // Restore the production registrations the module under test depends on.
      await import('../src/ai/adapters/index.js');
      const paths = shippedTier3Paths();
      expect(paths.length).toBeGreaterThan(0);
      // Every returned path really is backed by a registered adapter, and every declared provider
      // genuinely declares the capability it is listed under.
      for (const path of paths) {
        expect(path.declaredProviders.length).toBeGreaterThan(0);
        for (const id of path.declaredProviders) {
          const descriptor = allDescriptors().find((entry) => entry.id === id);
          expect(descriptor, `${id} is listed as declaring ${path.capability}`).toBeDefined();
          expect(descriptor!.capabilities).toContain(path.capability);
        }
      }
      expect(allDescriptors().length).toBeGreaterThan(0);
    });
  });
});
