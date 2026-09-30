/**
 * P5-14 — provider descriptors, captured from the adapters at authoring time.
 *
 * GENERATED FILE — do not edit. Run `pnpm generate:provider-catalogue` after changing any adapter
 * descriptor, and `checkProviderCatalogue` in the test suite fails if you forget.
 *
 * The connect pages need the descriptors to build the chooser table and each walkthrough, and
 * need exactly one adapter at run time (on *Test connection*). Importing the adapters for their
 * descriptors would put all ten `run()` implementations in the hub's client bundle and roughly
 * double the 45 kB budget. Capturing the data here keeps that bundle small; the drift test keeps
 * the copy honest.
 *
 * Every field below is a verbatim copy of the adapter's own descriptor. Nothing on the connect
 * pages is sourced from anywhere else.
 */

import type { ProviderDescriptor } from '@complianttools/image-engine/ai/types';

/** Captured from the adapter descriptors. See the header for how to regenerate. */
export const PROVIDER_CATALOGUE: readonly ProviderDescriptor[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    homepage: 'https://www.anthropic.com/',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    pricingUrl: 'https://www.anthropic.com/pricing',
    docsUrl: 'https://docs.anthropic.com/en/docs/about-claude/messages',
    credentialFields: [
      {
        key: 'apiKey',
        label: 'Anthropic API Key',
        placeholder: 'sk-ant-...',
        secret: true,
        required: true,
      },
    ],
    allowsCustomBaseUrl: true,
    defaultBaseUrl: 'https://api.anthropic.com',
    capabilities: ['describe'],
    browserDirect: 'yes-with-header',
    browserDirectNote: 'Requires header.',
    costHint: 'Token-based.',
    dataPolicy: {
      summary: 'Not used for training.',
      url: 'https://www.anthropic.com/legal/privacy',
    },
    models: [
      {
        id: 'claude-opus-5',
        label: 'Claude Opus 5',
        capabilities: ['describe'],
        notes: 'Vision.',
      },
      {
        id: 'claude-sonnet-5',
        label: 'Claude Sonnet 5',
        capabilities: ['describe'],
        notes: 'Balanced.',
      },
      {
        id: 'claude-haiku-4-5',
        label: 'Claude Haiku 4.5',
        capabilities: ['describe'],
        notes: 'Fast.',
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT-image-1)',
    homepage: 'https://openai.com/',
    keysUrl: 'https://platform.openai.com/api-keys',
    pricingUrl: 'https://openai.com/pricing',
    docsUrl: 'https://platform.openai.com/docs/guides/images',
    credentialFields: [
      {
        key: 'apiKey',
        label: 'OpenAI API Key',
        placeholder: 'sk-...',
        secret: true,
        required: true,
      },
    ],
    allowsCustomBaseUrl: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    capabilities: ['generate', 'edit', 'inpaint', 'describe'],
    browserDirect: 'yes-with-header',
    browserDirectNote: 'Requires Authorization: Bearer header.',
    costHint: '~$0.02–0.19 / image',
    dataPolicy: {
      summary: 'Not used for training by default.',
      url: 'https://openai.com/enterprise-privacy/',
    },
    models: [
      {
        id: 'gpt-image-1',
        label: 'GPT-image-1',
        capabilities: ['generate', 'edit', 'inpaint', 'describe'],
        notes:
          'Mask uses P5-07 canonical convention: 8-bit grayscale, white (255) = change, black (0) = preserve.',
      },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    homepage: 'https://ai.google.dev/gemini-api/docs/image-generation',
    keysUrl: 'https://aistudio.google.com/app/apikey',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
    credentialFields: [
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'AIza...',
        secret: true,
        required: true,
      },
    ],
    allowsCustomBaseUrl: false,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    capabilities: ['generate', 'edit', 'describe'],
    browserDirect: 'yes-with-header',
    browserDirectNote: 'Requires x-goog-api-key header; live CORS not verified here.',
    costHint: 'Generative; charged by image count/size.',
    dataPolicy: {
      summary: 'Google AI; SynthID watermarking applies to outputs.',
      url: 'https://ai.google.dev/gemini-api/docs/image-generation#data-use',
    },
    models: [
      {
        id: 'gemini-3.1-flash-image',
        label: 'Gemini 3.1 Flash Image',
        capabilities: ['generate', 'edit', 'describe'],
        notes: 'Default.',
      },
      {
        id: 'gemini-3.1-flash-lite-image',
        label: 'Gemini 3.1 Flash Lite Image',
        capabilities: ['generate', 'edit', 'describe'],
        notes: 'Fastest/cheapest.',
      },
      {
        id: 'gemini-3-pro-image',
        label: 'Gemini 3 Pro Image',
        capabilities: ['generate', 'edit', 'describe'],
        notes: 'Highest quality.',
      },
      {
        id: 'gemini-2.5-flash-image',
        label: 'Gemini 2.5 Flash Image (legacy)',
        capabilities: ['generate', 'edit', 'describe'],
        notes: 'Legacy.',
      },
    ],
  },
  {
    id: 'stability',
    name: 'Stability AI',
    homepage: 'https://stability.ai',
    keysUrl: 'https://platform.stability.ai/account/keys',
    pricingUrl: 'https://platform.stability.ai/pricing',
    docsUrl: 'https://platform.stability.ai/docs/api-reference',
    credentialFields: [
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'sk-...',
        secret: true,
        required: true,
      },
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
    browserDirect: 'unknown',
    browserDirectNote: 'CORS not verified.',
    costHint: 'Credit-based.',
    dataPolicy: {
      summary: 'Stability AI.',
      url: 'https://stability.ai/privacy',
    },
    models: [
      {
        id: 'stable-image-core',
        label: 'Stable Image Core',
        capabilities: ['generate', 'inpaint', 'erase', 'outpaint'],
        notes: 'Core.',
      },
    ],
  },
  {
    id: 'bfl',
    name: 'Black Forest Labs (FLUX)',
    homepage: 'https://blackforestlabs.ai',
    keysUrl: 'https://fal.ai/dashboard?provider=black-forest-labs',
    pricingUrl: 'https://fal.ai/pricing',
    docsUrl: 'https://docs.bfl.ai',
    credentialFields: [
      {
        key: 'apiKey',
        label: 'API Key (x-key)',
        placeholder: 'x-...',
        secret: true,
        required: true,
      },
    ],
    allowsCustomBaseUrl: false,
    defaultBaseUrl: 'https://api.bfl.ai',
    capabilities: ['generate', 'inpaint', 'outpaint'],
    browserDirect: 'unknown',
    browserDirectNote: 'CORS not verified.',
    costHint: 'Credit-based; URL expires.',
    dataPolicy: {
      summary: 'BFL.',
      url: 'https://docs.bfl.ai/terms',
    },
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
      {
        id: 'flux-dev',
        label: 'FLUX Dev',
        capabilities: ['generate', 'inpaint'],
        notes: 'Faster.',
      },
      {
        id: 'flux-pro-1.0-fill',
        label: 'FLUX Pro 1.0 Fill',
        capabilities: ['inpaint', 'outpaint'],
        notes: 'Mask-based fill.',
      },
    ],
  },
  {
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
    browserDirect: 'yes',
    browserDirectNote: 'Browser-direct with Authorization: Key header.',
    costHint: 'Varies by model; rembg cheapest.',
    dataPolicy: {
      summary: 'fal.ai.',
      url: 'https://fal.ai/privacy',
    },
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
      {
        id: 'fal-ai/esrgan',
        label: 'ESRGAN',
        capabilities: ['upscale'],
        notes: '×2/×4.',
      },
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
  },
  {
    id: 'replicate',
    name: 'Replicate',
    homepage: 'https://replicate.com',
    keysUrl: 'https://replicate.com/account/api-tokens',
    pricingUrl: 'https://replicate.com/pricing',
    docsUrl: 'https://replicate.com/docs/reference/http',
    credentialFields: [
      {
        key: 'apiKey',
        label: 'Replicate API Token',
        placeholder: 'r8_...',
        secret: true,
        required: true,
      },
    ],
    allowsCustomBaseUrl: true,
    defaultBaseUrl: 'https://api.replicate.com',
    capabilities: [
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
    ],
    browserDirect: 'unknown',
    browserDirectNote:
      'CORS not verified for all endpoints. If a call is blocked, use the Relay (§15) rather than an inscrutable failure.',
    costHint: 'Per-model; community models vary widely.',
    dataPolicy: {
      summary: 'Model-specific — Replicate hosts third-party community models.',
      url: 'https://replicate.com/privacy',
    },
    models: [
      {
        id: 'nightmareai/real-esrgan',
        label: 'Real-ESRGAN (nightmareai)',
        capabilities: ['upscale'],
        notes: '⚠ VERIFY slug still exists; community models disappear. Upscale.',
      },
      {
        id: 'lucataco/remove-bg',
        label: 'remove-bg (lucataco)',
        capabilities: ['removeBackground'],
        notes: '⚠ VERIFY slug still exists; community models disappear.',
      },
      {
        id: 'black-forest-labs/flux-fill-pro',
        label: 'FLUX Fill Pro (black-forest-labs)',
        capabilities: ['inpaint', 'outpaint'],
        notes: '⚠ VERIFY slug still exists; community models disappear. Mask-based fill.',
      },
      {
        id: 'andreasjansson/blip-2',
        label: 'BLIP-2 (andreasjansson)',
        capabilities: ['describe'],
        notes: '⚠ VERIFY slug still exists; a current VLM may be the better default.',
      },
    ],
  },
  {
    id: 'removebg',
    name: 'remove.bg',
    homepage: 'https://www.remove.bg',
    keysUrl: 'https://www.remove.bg/dashboard/api-account',
    pricingUrl: 'https://www.remove.bg/pricing',
    docsUrl: 'https://www.remove.bg/api',
    credentialFields: [
      {
        key: 'apiKey',
        label: 'remove.bg API Key',
        placeholder: '...',
        secret: true,
        required: true,
      },
    ],
    allowsCustomBaseUrl: false,
    defaultBaseUrl: 'https://api.remove.bg',
    capabilities: ['removeBackground'],
    browserDirect: 'yes-with-header',
    browserDirectNote: 'Requires the X-Api-Key request header; live CORS not verified here.',
    costHint: 'Preview is low-cost; export at full size uses one credit.',
    dataPolicy: {
      summary: 'Images processed by remove.bg.',
      url: 'https://www.remove.bg/privacy',
    },
    models: [
      {
        id: 'remove.bg',
        label: 'remove.bg (auto)',
        capabilities: ['removeBackground'],
        notes: 'Best-in-class for hair and fur edges. `type` selects auto|person|product|car.',
      },
    ],
  },
  {
    id: 'clipdrop',
    name: 'Clipdrop',
    homepage: 'https://clipdrop.co',
    keysUrl: 'https://clipdrop.co/apis',
    pricingUrl: 'https://clipdrop.co/apis',
    docsUrl: 'https://clipdrop.co/apis/docs',
    credentialFields: [
      {
        key: 'apiKey',
        label: 'Clipdrop API Key',
        placeholder: '...',
        secret: true,
        required: true,
      },
    ],
    allowsCustomBaseUrl: false,
    defaultBaseUrl: 'https://clipdrop-api.co',
    capabilities: ['removeBackground', 'erase', 'upscale', 'replaceBackground'],
    browserDirect: 'yes-with-header',
    browserDirectNote: 'Requires the x-api-key request header; live CORS not verified here.',
    costHint: 'Credit-based; x-remaining-credits is reported after each call.',
    dataPolicy: {
      summary: 'Images processed by Clipdrop.',
      url: 'https://clipdrop.co/privacy',
    },
    models: [
      {
        id: 'remove-background',
        label: 'Remove Background',
        capabilities: ['removeBackground'],
        notes: 'POST /remove-background/v1.',
      },
      {
        id: 'cleanup',
        label: 'Cleanup (object removal)',
        capabilities: ['erase'],
        notes:
          'POST /cleanup/v1. Per §14.9 the mask is white = remove, matching our convention, so it is sent uninverted. ⚠ VERIFY that match live before relying on it.',
      },
      {
        id: 'image-upscaling',
        label: 'Upscale',
        capabilities: ['upscale'],
        notes:
          'POST /image-upscaling/v1/upscale. Takes explicit target dimensions; clamped to 4096px locally.',
      },
      {
        id: 'replace-background',
        label: 'Replace Background',
        capabilities: ['replaceBackground'],
        notes: 'POST /replace-background/v1.',
      },
    ],
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI-compatible / self-hosted',
    homepage: 'https://github.com/ollama/ollama',
    keysUrl: 'https://github.com/ollama/ollama',
    pricingUrl: 'https://ollama.com',
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    credentialFields: [
      {
        key: 'apiKey',
        label: 'API Key (optional — local servers often need none)',
        placeholder: 'not-needed',
        secret: true,
        required: false,
      },
      {
        key: 'baseUrl',
        label: 'Base URL',
        placeholder: 'http://localhost:11434/v1',
        secret: false,
        required: true,
        help: 'Ollama http://localhost:11434/v1 · LM Studio http://localhost:1234/v1 · vLLM http://localhost:8000/v1 · OpenRouter https://openrouter.ai/api/v1',
      },
    ],
    allowsCustomBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434/v1',
    capabilities: ['generate', 'edit', 'inpaint', 'describe', 'upscale'],
    browserDirect: 'yes-with-header',
    browserDirectNote:
      'Depends entirely on the user’s own server: its CORS configuration decides. Chrome allows http://localhost as a secure context; Safari and Firefox vary — see LOCALHOST_MIXED_CONTENT_GUIDANCE.',
    costHint: 'Whatever the chosen server charges — often nothing, when it runs locally.',
    dataPolicy: {
      summary:
        'Depends on where the server runs. Self-hosted means your images never leave your machine; a hosted gateway does not.',
      url: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    },
    models: [],
  },
] as const satisfies readonly ProviderDescriptor[];
