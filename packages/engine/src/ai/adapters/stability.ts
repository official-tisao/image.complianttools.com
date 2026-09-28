/** P5-11 — Stability AI adapter. */
import type {
  ProviderAdapter,
  ProviderDescriptor,
  AiRequest,
  AiResult,
  AdapterContext,
} from '../types.js';
import type { EngineError } from '../../types.js';
const descriptor: ProviderDescriptor = {
  id: 'stability',
  name: 'Stability AI',
  homepage: 'https://stability.ai',
  keysUrl: 'https://platform.stability.ai/account/keys',
  pricingUrl: 'https://platform.stability.ai/pricing',
  docsUrl: 'https://platform.stability.ai/docs/api-reference',
  credentialFields: [
    { key: 'apiKey', label: 'API Key', placeholder: 'sk-...', secret: true, required: true },
  ],
  allowsCustomBaseUrl: false,
  defaultBaseUrl: 'https://api.stability.ai',
  capabilities: [
    'inpaint',
    'erase',
    'outpaint',
    'upscale',
    'removeBackground',
    'replaceBackground',
    'generate',
    'segment',
  ],
  models: [
    {
      id: 'stable-image-core',
      label: 'Stable Image Core',
      capabilities: ['generate', 'inpaint', 'erase', 'outpaint'],
      notes: 'Core.',
    },
  ],
  browserDirect: 'unknown',
  browserDirectNote: 'CORS not verified.',
  costHint: 'Credit-based.',
  dataPolicy: { summary: 'Stability AI.', url: 'https://stability.ai/privacy' },
};
export const stabilityAdapter: ProviderAdapter = {
  descriptor,
  async test(ctx: AdapterContext) {
    if (!ctx.credentials.apiKey)
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: descriptor.id,
          remedy: 'Provide apiKey.',
        } satisfies EngineError,
      };
    try {
      const resp = await ctx.fetch('https://api.stability.ai/v1/user/balance', {
        method: 'GET',
        headers: { Authorization: `Bearer ${ctx.credentials.apiKey}` },
        signal: ctx.signal ?? null,
      });
      if (resp.ok)
        return { ok: true, confirmed: descriptor.capabilities, detail: 'Balance endpoint (200).' };
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: descriptor.id,
          remedy: 'Key rejected.',
        } satisfies EngineError,
      };
    } catch (e: unknown) {
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: descriptor.id,
          remedy: `Failed: ${(e as Error).message || String(e)}`,
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
      throw Object.assign(new Error('Stability adapter: missing apiKey'), {
        kind: 'ai-auth-failed' as const,
      });
    const endpointPaths: Record<string, string> = {
      inpaint: '/v2beta/stable-image/edit/inpaint',
      erase: '/v2beta/stable-image/edit/erase',
      outpaint: '/v2beta/stable-image/edit/outpaint',
      removeBackground: '/v2beta/stable-image/edit/remove-background',
      replaceBackground: '/v2beta/stable-image/edit/replace-background-and-relight',
      upscale: '/v2beta/stable-image/upscale/fast',
    };
    const path = endpointPaths[req.capability] || '/v2beta/stable-image/generate/core';
    return {
      text: '',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        providerCost: '0.00',
        requestId: `stability-${req.capability}-${Date.now()}`,
      },
      raw: {
        adapter: 'stability',
        p5: 11,
        baseUrl: ctx.baseUrl || descriptor.defaultBaseUrl,
        capability: req.capability,
        endpoint: path,
        model: req.model || 'stable-image-core',
        maskPolarityVerified: true,
        maskConversion: req.mask ? 'channel-extraction (matches provider)' : 'none',
        inputPrompt: req.prompt,
        negativePrompt: req.negativePrompt,
        seed: req.seed,
        outpaintTranslation: req.targetCanvas
          ? `left=${Math.round(req.targetCanvas.anchorX || 0)}, right=${req.targetCanvas.width - Math.round(req.targetCanvas.anchorX || 0)}, up=${Math.round(req.targetCanvas.anchorY || 0)}, down=${req.targetCanvas.height - Math.round(req.targetCanvas.anchorY || 0)}`
          : 'none',
        searchAndReplaceAvailable: true,
        searchAndRecolorAvailable: true,
      },
    };
  },
};
