/**
 * P5-10 — Google Gemini adapter (local implementation only).
 * Spec: README §14.3; PLAN.md 818-823.
 * Not verified against live Gemini endpoint (no credentials / confirmed live access).
 */
import type {
  ProviderAdapter,
  ProviderDescriptor,
  AiRequest,
  AiResult,
  AdapterContext,
} from '../types.js';
import type { EngineError } from '../../types.js';

const descriptor: ProviderDescriptor = {
  id: 'gemini',
  name: 'Google Gemini',
  homepage: 'https://ai.google.dev/gemini-api/docs/image-generation',
  keysUrl: 'https://aistudio.google.com/app/apikey',
  pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  docsUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
  credentialFields: [
    { key: 'apiKey', label: 'API Key', placeholder: 'AIza...', secret: true, required: true },
  ],
  allowsCustomBaseUrl: false,
  defaultBaseUrl: 'https://generativelanguage.googleapis.com',
  capabilities: ['generate', 'edit', 'describe'],
  models: [
    {
      id: 'gemini-3.1-flash-image',
      label: 'Gemini 3.1 Flash Image',
      capabilities: ['generate', 'edit', 'describe'],
      supportedInputMime: ['image/png', 'image/jpeg'],
      supportedSizes: ['1024x1024', '1536x1024', '1024x1536', '2K', '4K'],
      supportsMask: false,
      supportsSeed: false,
      notes: 'Default.',
    },
    {
      id: 'gemini-3.1-flash-lite-image',
      label: 'Gemini 3.1 Flash Lite Image',
      capabilities: ['generate', 'edit', 'describe'],
      supportedInputMime: ['image/png', 'image/jpeg'],
      supportedSizes: ['1024x1024', '1536x1024', '1024x1536'],
      supportsMask: false,
      supportsSeed: false,
      notes: 'Fastest/cheapest.',
    },
    {
      id: 'gemini-3-pro-image',
      label: 'Gemini 3 Pro Image',
      capabilities: ['generate', 'edit', 'describe'],
      supportedInputMime: ['image/png', 'image/jpeg'],
      supportedSizes: ['1024x1024', '1536x1024', '1024x1536', '2K', '4K'],
      supportsMask: false,
      supportsSeed: false,
      notes: 'Highest quality.',
    },
    {
      id: 'gemini-2.5-flash-image',
      label: 'Gemini 2.5 Flash Image (legacy)',
      capabilities: ['generate', 'edit', 'describe'],
      supportedInputMime: ['image/png', 'image/jpeg'],
      supportedSizes: ['1024x1024', '1536x1024'],
      supportsMask: false,
      supportsSeed: false,
      notes: 'Legacy.',
    },
  ],
  browserDirect: 'yes-with-header',
  browserDirectNote: 'Requires x-goog-api-key header; live CORS not verified here.',
  costHint: 'Generative; charged by image count/size.',
  dataPolicy: {
    summary: 'Google AI; SynthID watermarking applies to outputs.',
    url: 'https://ai.google.dev/gemini-api/docs/image-generation#data-use',
  },
};

export const geminiAdapter: ProviderAdapter = {
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
    // This used to return `ok: true` with every declared capability "confirmed" without making a
    // single request. §17.3's Test connection is the moment a user decides to trust this
    // integration, so reporting success there on no evidence at all is the one thing that step must
    // never do — the copy in `ProviderWalkthrough.svelte` even said so in its `detail` while the
    // `confirmed` array above it said the opposite.
    //
    // Gemini has no free metadata endpoint documented in §14.3 to probe against, so the honest
    // answer is a real credential-shape check plus an explicit "nothing confirmed yet". The
    // nightly job (§22.7) and the first real operation are what confirm a capability.
    return {
      ok: true,
      confirmed: [],
      detail:
        'The key was accepted locally, but no request was sent: §14.3 documents no free endpoint to ' +
        'probe it against, so nothing is confirmed yet. Each capability is verified the first time ' +
        'you use it.',
    };
  },
  async listModels(ctx: AdapterContext) {
    void ctx;
    return descriptor.models;
  },
  async run(req: AiRequest, ctx: AdapterContext): Promise<AiResult> {
    if (!ctx.credentials.apiKey)
      throw Object.assign(new Error('missing apiKey'), { kind: 'ai-auth-failed' as const });
    const model = req.model || 'gemini-3.1-flash-image';
    // Request body structure per README §14.3 (documented, not executed live).
    const inputItems: unknown[] = [];
    if (req.capability === 'generate') inputItems.push({ type: 'text', text: req.prompt || '' });
    else if (req.capability === 'describe') {
      inputItems.push({ type: 'text', text: req.prompt || 'Describe.' });
      if (req.image) inputItems.push({ type: 'image', mime_type: 'image/png', data: 'STUB' });
    } else if (req.capability === 'edit') {
      inputItems.push({ type: 'text', text: req.prompt || 'Edit.' });
      if (req.image) inputItems.push({ type: 'image', mime_type: 'image/png', data: 'STUB' });
    }
    const responseFormat =
      req.capability === 'describe'
        ? { type: 'text' }
        : { type: 'image', mime_type: 'image/png', aspect_ratio: '16:9', image_size: '2K' };
    // Adapter returns local stub; no real POST to /v1beta/interactions performed.
    return {
      text:
        req.capability === 'describe' ? 'Gemini describe result (local stub — no live call)' : '',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        providerCost: '0.00',
        requestId: 'gemini-p5-10-stub',
      },
      raw: {
        adapter: 'gemini',
        p5: 10,
        note: 'Not verified live; endpoint: README §14.3.',
        inputItems,
        responseFormat,
        model,
        previous_interaction_id: undefined,
      },
    };
  },
};
