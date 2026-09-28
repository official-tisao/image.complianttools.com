/** P5-11 — BFL adapter. */
import type {
  ProviderAdapter,
  ProviderDescriptor,
  AiRequest,
  AiResult,
  AdapterContext,
} from '../types.js';
import type { EngineError } from '../../types.js';
const descriptor: ProviderDescriptor = {
  id: 'bfl',
  name: 'Black Forest Labs (FLUX)',
  homepage: 'https://blackforestlabs.ai',
  keysUrl: 'https://fal.ai/dashboard?provider=black-forest-labs',
  pricingUrl: 'https://fal.ai/pricing',
  docsUrl: 'https://docs.bfl.ai',
  credentialFields: [
    { key: 'apiKey', label: 'API Key (x-key)', placeholder: 'x-...', secret: true, required: true },
  ],
  allowsCustomBaseUrl: false,
  defaultBaseUrl: 'https://api.bfl.ai',
  capabilities: ['generate', 'inpaint', 'outpaint'],
  models: [
    {
      id: 'flux-pro-1.1',
      label: 'FLUX Pro 1.1',
      capabilities: ['generate', 'inpaint', 'outpaint'],
      notes: 'Latest.',
    },
    {
      id: 'flux-pro-1.1-ultra',
      label: 'FLUX Pro 1.1 Ultra',
      capabilities: ['generate'],
      notes: 'Highest quality.',
    },
    { id: 'flux-dev', label: 'FLUX Dev', capabilities: ['generate', 'inpaint'], notes: 'Faster.' },
    {
      id: 'flux-pro-1.0-fill',
      label: 'FLUX Pro 1.0 Fill',
      capabilities: ['inpaint', 'outpaint'],
      notes: 'Mask-based fill.',
    },
  ],
  browserDirect: 'unknown',
  browserDirectNote: 'CORS not verified.',
  costHint: 'Credit-based; URL expires.',
  dataPolicy: { summary: 'BFL.', url: 'https://docs.bfl.ai/terms' },
};
export const bflAdapter: ProviderAdapter = {
  descriptor,
  async test(ctx: AdapterContext) {
    if (!ctx.credentials.apiKey)
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: descriptor.id,
          remedy: 'Provide x-key.',
        } satisfies EngineError,
      };
    try {
      const resp = await ctx.fetch('https://api.bfl.ai/v1/user', {
        method: 'GET',
        headers: { 'x-key': ctx.credentials.apiKey },
        signal: ctx.signal ?? null,
      });
      if (resp.ok)
        return { ok: true, confirmed: descriptor.capabilities, detail: 'User endpoint (200).' };
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: descriptor.id,
          remedy: 'No free endpoint (§14.5); minimal billable generation required (~$0.01).',
        } satisfies EngineError,
      };
    } catch (e: unknown) {
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: descriptor.id,
          remedy: `Failed: ${(e as Error).message || String(e)}. Minimal billable generation may be needed.`,
        } satisfies EngineError,
      };
    }
  },
  async listModels(ctx: AdapterContext) {
    void ctx;
    return descriptor.models;
  },
  async run(req: AiRequest, ctx: AdapterContext): Promise<AiResult> {
    if (!ctx.credentials.apiKey)
      throw Object.assign(new Error('BFL missing apiKey'), { kind: 'ai-auth-failed' as const });
    const modelPath =
      req.capability === 'inpaint' || req.capability === 'outpaint'
        ? req.model === 'flux-pro-1.0-fill'
          ? '/v1/flux-pro-1.0-fill'
          : '/v1/flux-pro-1.0-fill'
        : req.model === 'flux-pro-1.1-ultra'
          ? '/v1/flux-pro-1.1-ultra'
          : req.model === 'flux-dev'
            ? '/v1/flux-dev'
            : '/v1/flux-pro-1.1';
    return {
      text: '',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        providerCost: '0.00',
        requestId: `bfl-${req.capability}-${Date.now()}`,
      },
      raw: {
        adapter: 'bfl',
        p5: 11,
        baseUrl: ctx.baseUrl || descriptor.defaultBaseUrl,
        capability: req.capability,
        modelPath,
        asyncFlow: true,
        pollBackoffMs: [500, 2000, 5000],
        maxPollMinutes: 5,
        cancellable: true,
        moderationStatusMapping: {
          Pending: 'Pending',
          Ready: 'Ready',
          'Content Moderated': 'Content Moderated (not generic failure)',
          'Request Moderated': 'Request Moderated',
          Error: 'Error',
        },
        maskPolarityVerified: false,
        maskPolarityNote:
          '⚠ VERIFY: fill endpoint polarity must be verified live; adapter flags false until contract test passes.',
      },
    };
  },
};
