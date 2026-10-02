/** P5-11 — BFL adapter. */
import type {
  ProviderAdapter,
  ProviderDescriptor,
  AiRequest,
  AiResult,
  AdapterContext,
} from '../types.js';
import type { EngineError } from '../../types.js';
import { classifyTestResponse, classifyThrownByTransport } from '../adapter-support.js';
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
      if (resp.ok) {
        // §14.5 is explicit that BFL has no free endpoint: "no free account endpoint; minimal
        // billable generation required (~$0.01)". `GET /v1/user` therefore proves the credential
        // and nothing else. It previously returned `descriptor.capabilities`, so a successful key
        // check was reported as confirmation that generate, inpaint, and outpaint all work —
        // capabilities whose endpoints were never called.
        return {
          ok: true,
          confirmed: [],
          detail:
            'BFL accepted the credential (GET /v1/user returned 200). This proves the key only: ' +
            '§14.5 documents no free endpoint for the model APIs, so no capability is confirmed ' +
            'until an operation is run.',
        };
      }
      // A non-2xx from the user endpoint is a real answer with a real cause, so it is classified
      // rather than flattened to "no free endpoint" regardless of status.
      return {
        ok: false,
        error: classifyTestResponse(resp.status, descriptor.id, resp.headers) satisfies EngineError,
      };
    } catch (e: unknown) {
      // A browser-side network failure is not an authentication failure. §17.3 gives the two
      // different messages and different fixes: a CORS block means the key was never sent, so
      // telling the user to re-copy it sends them looking for the wrong problem entirely.
      return {
        ok: false,
        error: classifyThrownByTransport(e, descriptor.id) satisfies EngineError,
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
          'Content Moderated': 'moderation: Content Moderated',
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
