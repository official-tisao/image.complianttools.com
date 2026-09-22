/**
 * P5-01 — Test-only adapter fixture. Clearly named, no production value.
 * Proves the registry abstraction works without implementing any real provider.
 */

import type {
  ProviderAdapter,
  ProviderDescriptor,
  AiRequest,
  AiResult,
  AdapterContext,
  AiCapability,
} from '../types.js';
import type { EngineError } from '../../types.js';

const testDescriptor: ProviderDescriptor = {
  id: 'test-stub',
  name: 'Test Stub (P5-01 only)',
  homepage: 'https://example.test/',
  keysUrl: 'https://example.test/keys',
  pricingUrl: 'https://example.test/pricing',
  docsUrl: 'https://example.test/docs',
  credentialFields: [
    { key: 'apiKey', label: 'API Key', placeholder: 'test-key', secret: true, required: true },
  ],
  allowsCustomBaseUrl: false,
  defaultBaseUrl: 'https://example.test/v1',
  capabilities: ['upscale', 'describe'],
  models: [
    {
      id: 'test-model-1',
      label: 'Test Model v1',
      capabilities: ['upscale', 'describe'],
      maxInputPixels: 4096,
      supportsMask: true,
      supportsSeed: true,
    },
  ],
  browserDirect: 'unknown',
  browserDirectNote: 'Test adapter — no real CORS posture.',
  costHint: 'N/A (test only)',
  dataPolicy: { summary: 'None — test fixture.', url: 'https://example.test/' },
};

export const testStubAdapter: ProviderAdapter = {
  descriptor: testDescriptor,
  async test(ctx: AdapterContext): Promise<
    | {
        ok: true;
        confirmed: AiCapability[];
        detail: string;
      }
    | { ok: false; error: EngineError }
  > {
    const hasKey = Object.prototype.hasOwnProperty.call(ctx.credentials, 'apiKey');
    if (!hasKey) {
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: testDescriptor.id,
          remedy: 'Test stub requires apiKey in context.',
        } satisfies EngineError,
      };
    }
    return {
      ok: true,
      confirmed: testDescriptor.capabilities,
      detail: 'Test stub adapter confirmed all declared capabilities.',
    };
  },
  async run(req: AiRequest, ctx: AdapterContext): Promise<AiResult> {
    // Context is received (not used further) to prove interface exists.
    void ctx;
    return {
      text: `Stub result for capability=${req.capability} model=${req.model}`,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        providerCost: '0.00',
        requestId: 'test-req-01',
      },
    };
  },
};
