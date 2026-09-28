import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerProvider,
  clearRegistry,
  getProvider,
  registeredCount,
} from '../src/ai/registry.js';
import { stabilityAdapter } from '../src/ai/adapters/stability.js';
import { bflAdapter } from '../src/ai/adapters/bfl.js';
import { falAdapter } from '../src/ai/adapters/fal.js';

describe('P5-11 adapter contracts (Stability / BFL / fal.ai)', () => {
  beforeEach(() => {
    clearRegistry();
  });
  afterEach(() => {
    clearRegistry();
  });

  it('Stability adapter registers (§14.4)', () => {
    registerProvider(stabilityAdapter);
    expect(getProvider('stability')).toBeDefined();
  });

  it('BFL adapter registers (§14.5)', () => {
    registerProvider(bflAdapter);
    expect(getProvider('bfl')).toBeDefined();
  });

  it('fal adapter registers (§14.6)', () => {
    registerProvider(falAdapter);
    expect(getProvider('fal')).toBeDefined();
  });

  it('Stability mask polarity verified (§14.4)', async () => {
    registerProvider(stabilityAdapter);
    const adapter = getProvider('stability');
    const result = await adapter.run(
      { capability: 'inpaint', model: 'stable-image-core', prompt: 'fill' },
      {
        credentials: { apiKey: 'sk-test' },
        baseUrl: adapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );
    expect(result.raw?.maskPolarityVerified).toBe(true);
  });

  it('Stability outpaint directional translation (§14.4)', async () => {
    registerProvider(stabilityAdapter);
    const adapter = getProvider('stability');
    const result = await adapter.run(
      {
        capability: 'outpaint',
        model: 'stable-image-core',
        targetCanvas: { width: 2000, height: 1500, anchorX: 500, anchorY: 300 },
      },
      {
        credentials: { apiKey: 'sk-test' },
        baseUrl: adapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );
    expect(result.raw?.outpaintTranslation).toContain('left=');
  });

  it('BFL async flow (§14.5)', async () => {
    registerProvider(bflAdapter);
    const adapter = getProvider('bfl');
    const result = await adapter.run(
      { capability: 'generate', model: 'flux-pro-1.1' },
      {
        credentials: { apiKey: 'x-key' },
        baseUrl: adapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );
    expect(result.raw?.asyncFlow).toBe(true);
  });

  it('BFL moderation mapping distinct (§14.5)', async () => {
    registerProvider(bflAdapter);
    const adapter = getProvider('bfl');
    const result = await adapter.run(
      { capability: 'inpaint', model: 'flux-pro-1.0-fill' },
      {
        credentials: { apiKey: 'x-key' },
        baseUrl: adapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );
    const mapping = result.raw?.moderationStatusMapping;
    expect(mapping['Content Moderated']).toContain('moderation');
    expect(mapping['Content Moderated']).not.toBe(mapping['Error']);
  });

  it('fal data URI (§14.6)', async () => {
    registerProvider(falAdapter);
    const adapter = getProvider('fal');
    const result = await adapter.run(
      { capability: 'removeBackground', model: 'fal-ai/birefnet/v2' },
      {
        credentials: { apiKey: 'fal-key' },
        baseUrl: adapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );
    expect(result.raw?.inputImageViaDataUri).toBe(true);
  });

  it('fal schema discovery (§14.6)', async () => {
    registerProvider(falAdapter);
    const adapter = getProvider('fal');
    const result = await adapter.run(
      { capability: 'generate', model: 'fal-ai/flux-pro/v1.1' },
      {
        credentials: { apiKey: 'fal-key' },
        baseUrl: adapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );
    expect(result.raw?.schemaDiscoveryNote).toContain('OpenAPI');
  });

  it('fal sam2 wired (§14.6)', async () => {
    registerProvider(falAdapter);
    const adapter = getProvider('fal');
    const result = await adapter.run(
      { capability: 'segment', model: 'fal-ai/sam2' },
      {
        credentials: { apiKey: 'fal-key' },
        baseUrl: adapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );
    expect(result.raw?.sam2Wired).toBe(true);
  });

  it('fal queue endpoint (§14.6)', async () => {
    registerProvider(falAdapter);
    const adapter = getProvider('fal');
    const result = await adapter.run(
      { capability: 'generate', model: 'fal-ai/flux/schnell', extra: { useQueue: true } },
      {
        credentials: { apiKey: 'fal-key' },
        baseUrl: adapter.descriptor.defaultBaseUrl,
        fetch: globalThis.fetch,
      },
    );
    expect(result.raw?.useQueue).toBe(true);
  });

  it('Three adapters without conflict', () => {
    registerProvider(stabilityAdapter);
    registerProvider(bflAdapter);
    registerProvider(falAdapter);
    expect(registeredCount()).toBe(3);
  });
});
