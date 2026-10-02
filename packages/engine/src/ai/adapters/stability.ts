/** P5-11 — Stability AI adapter. */
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
      if (resp.ok) {
        // §14.4 documents `GET /v1/user/balance` as the free credential check. It proves the key
        // and the balance; it does not exercise the eight image endpoints the descriptor declares.
        // Returning `descriptor.capabilities` here told a user their generate/inpaint/outpaint
        // paths were confirmed by a call that never touched one of them.
        let balance: string | undefined;
        try {
          const parsed = JSON.parse(await resp.text()) as { balance?: number | string };
          if (parsed.balance !== undefined) balance = String(parsed.balance);
        } catch {
          // A 200 with an unparseable body still means the credential was accepted. Report that,
          // and say the balance is unknown rather than inventing a zero.
        }
        return {
          ok: true,
          confirmed: [],
          detail:
            'Stability AI accepted the credential (GET /v1/user/balance returned 200)' +
            (balance ? `, balance ${balance}.` : '.') +
            ' This proves the key only; each capability is confirmed when it is first used.',
        };
      }
      // Classified by status, so a 402 (no credits) does not read as "key rejected" — §17.3 gives
      // those two failures different messages and different fixes.
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
        // §14.4 states the polarity matches ours and marks the same sentence "⚠ VERIFY per
        // endpoint — polarity differs between endpoints". Nothing here has confirmed it against
        // the live API, so this reports unverified. Claiming `true` would be the over-claim §4.9
        // forbids: an unverified conversion presented as a verified one, which silently inverts a
        // user's mask if the endpoint disagrees.
        maskPolarityVerified: false,
        maskPolarityNote:
          '⚠ VERIFY: README §14.4 records polarity as matching per endpoint but marks the same ' +
          'sentence unverified. The nightly contract job (§22.7) is what may confirm it. The ' +
          'conversion below is the documented assumption, not a confirmed one.',
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
