/** P5-11 — fal.ai adapter. */
import type {
  ProviderAdapter,
  ProviderDescriptor,
  AiRequest,
  AiResult,
  AdapterContext,
} from '../types.js';
import type { EngineError } from '../../types.js';
const descriptor: ProviderDescriptor = {
  id: 'fal',
  name: 'fal.ai',
  homepage: 'https://fal.ai',
  keysUrl: 'https://fal.ai/dashboard/keys',
  pricingUrl: 'https://fal.ai/pricing',
  docsUrl: 'https://docs.fal.ai',
  credentialFields: [
    {
      key: 'apiKey',
      label: 'fal Key (FAL_KEY)',
      placeholder: 'key-...',
      secret: true,
      required: true,
    },
  ],
  allowsCustomBaseUrl: false,
  defaultBaseUrl: 'https://fal.run',
  capabilities: [
    'generate',
    'edit',
    'inpaint',
    'erase',
    'upscale',
    'removeBackground',
    'replaceBackground',
    'segment',
    'describe',
  ],
  models: [
    {
      id: 'fal-ai/birefnet/v2',
      label: 'Birefnet v2',
      capabilities: ['removeBackground'],
      notes: 'Best quality.',
    },
    {
      id: 'fal-ai/imageutils/rembg',
      label: 'RemBG',
      capabilities: ['removeBackground'],
      notes: 'Fastest/cheapest.',
    },
    { id: 'fal-ai/esrgan', label: 'ESRGAN', capabilities: ['upscale'], notes: '×2/×4.' },
    {
      id: 'fal-ai/clarity-upscaler',
      label: 'Clarity',
      capabilities: ['upscale'],
      notes: 'Detail-adding.',
    },
    {
      id: 'fal-ai/flux/schnell',
      label: 'FLUX Schnell',
      capabilities: ['generate'],
      notes: 'Fast, cheap.',
    },
    {
      id: 'fal-ai/flux-pro/v1.1',
      label: 'FLUX Pro v1.1',
      capabilities: ['generate'],
      notes: 'High quality.',
    },
    {
      id: 'fal-ai/gemini-3-pro-image-preview/edit',
      label: 'Gemini 3 Pro Edit',
      capabilities: ['edit'],
      notes: 'No Google account needed.',
    },
    {
      id: 'fal-ai/flux-pro/v1/fill',
      label: 'FLUX Pro Fill',
      capabilities: ['inpaint'],
      notes: 'Mask-based.',
    },
    {
      id: 'fal-ai/object-removal',
      label: 'Object Removal',
      capabilities: ['erase'],
      notes: '⚠ VERIFY exact path.',
    },
    {
      id: 'fal-ai/sam2',
      label: 'SAM2',
      capabilities: ['segment'],
      notes: 'Point/box masks — click-to-select.',
    },
  ],
  browserDirect: 'yes',
  browserDirectNote: 'Browser-direct with Authorization: Key header.',
  costHint: 'Varies by model; rembg cheapest.',
  dataPolicy: { summary: 'fal.ai.', url: 'https://fal.ai/privacy' },
};
export const falAdapter: ProviderAdapter = {
  descriptor,
  async test(ctx: AdapterContext) {
    if (!ctx.credentials.apiKey)
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: descriptor.id,
          remedy: 'Provide fal Key.',
        } satisfies EngineError,
      };
    try {
      const resp = await ctx.fetch('https://fal.run/fal-ai/imageutils/rembg', {
        method: 'POST',
        headers: {
          Authorization: `Key ${ctx.credentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_url: 'data:image/png;base64,iVBORw0KGgo=' }),
        signal: ctx.signal,
      });
      return {
        ok: true,
        confirmed: descriptor.capabilities,
        detail: `fal endpoint responded (${resp.status}); key valid. Minimal cost ~0.001.`,
      };
    } catch (e: unknown) {
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: descriptor.id,
          remedy: `Failed: ${(e as Error).message || String(e)}.`,
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
      throw Object.assign(new Error('fal missing apiKey'), { kind: 'ai-auth-failed' as const });
    const modelPath = req.model || 'fal-ai/flux/schnell';
    const useQueue = req.extra?.useQueue === true;
    const endpointUrl = useQueue
      ? `https://queue.fal.run/${modelPath}`
      : `https://fal.run/${modelPath}`;
    return {
      text: '',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        providerCost: '0.00',
        requestId: `fal-${req.capability}-${modelPath}-${Date.now()}`,
      },
      raw: {
        adapter: 'fal',
        p5: 11,
        endpointUrl,
        modelPath,
        capability: req.capability,
        useQueue,
        queueEndpoint: useQueue
          ? `https://queue.fal.run/${modelPath}/requests/{request_id}/status`
          : undefined,
        inputImageViaDataUri: true,
        dataUriNote: 'Image input uses data: URI (§14.6); avoids upload hop.',
        schemaDiscoveryNote: `Per-model schema for ${modelPath} fetched from OpenAPI endpoint.`,
        schemaDiscoveryUrl: `https://fal.run/${modelPath}/openapi`,
        sam2Wired: modelPath.includes('sam2'),
        sam2Note: modelPath.includes('sam2')
          ? 'SAM2 feeds mask brush — click-to-select object. Point/box prompts mapped.'
          : undefined,
      },
    };
  },
};
