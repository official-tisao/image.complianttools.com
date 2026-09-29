/**
 * P5-12 — Clipdrop adapter (multi-op).
 * Source of truth: README §14.9, PLAN.md P5-12.
 *
 * Three things §14.9 singles out and this adapter honours:
 * - `cleanup` masks are **white = remove**, which is the same polarity as our canonical convention
 *   (`ai/mask-convention.ts`: white 255 = change), so the mask is passed through *un-inverted*.
 *   Getting this backwards would erase the background instead of the masked object.
 * - Upscaling takes explicit target dimensions rather than a factor, so `scaleFactor` is
 *   translated and clamped, and a clamp is reported so the UI can say the request was reduced.
 * - `x-remaining-credits` feeds the cost ledger.
 *
 * `remove-text` and `reimagine` appear in the §14.9 endpoint table but map to no `AiCapability`,
 * so they are surfaced as documented extra operations rather than invented capabilities.
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
import { readLedgerHeaders, usageFromLedgerHeaders } from '../adapter-support.js';
import type { LedgerHeaderReading } from '../adapter-support.js';

const DESCRIPTOR_ID = 'clipdrop';

/** Endpoint per capability, per the §14.9 table. */
const ENDPOINTS: Record<string, string> = {
  removeBackground: '/remove-background/v1',
  erase: '/cleanup/v1',
  upscale: '/image-upscaling/v1/upscale',
  replaceBackground: '/replace-background/v1',
};

/**
 * Documented upscale ceiling.
 *
 * ⚠ VERIFY: §14.9 says only "clamp to the documented maximum" without stating the value. This is a
 * conservative local bound so a large factor cannot produce an out-of-range request; it is not
 * claimed to be Clipdrop's published limit.
 */
export const CLIPDROP_MAX_UPSCALE_DIMENSION = 4096;

const descriptor: ProviderDescriptor = {
  id: DESCRIPTOR_ID,
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
  capabilities: ['removeBackground', 'erase', 'upscale', 'replaceBackground'] as AiCapability[],
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
      supportsMask: true,
      notes:
        'POST /cleanup/v1. Per §14.9 the mask is white = remove, matching our convention, so it is sent uninverted. ⚠ VERIFY that match live before relying on it.',
    },
    {
      id: 'image-upscaling',
      label: 'Upscale',
      capabilities: ['upscale'],
      notes: `POST /image-upscaling/v1/upscale. Takes explicit target dimensions; clamped to ${CLIPDROP_MAX_UPSCALE_DIMENSION}px locally.`,
    },
    {
      id: 'replace-background',
      label: 'Replace Background',
      capabilities: ['replaceBackground'],
      notes: 'POST /replace-background/v1.',
    },
  ],
  browserDirect: 'yes-with-header',
  browserDirectNote: 'Requires the x-api-key request header; live CORS not verified here.',
  costHint: 'Credit-based; x-remaining-credits is reported after each call.',
  dataPolicy: {
    summary: 'Images processed by Clipdrop.',
    url: 'https://clipdrop.co/privacy',
  },
};

function baseUrl(ctx: AdapterContext): string {
  return (ctx.baseUrl || descriptor.defaultBaseUrl).replace(/\/$/, '');
}

export interface UpscaleTranslation {
  targetWidth: number;
  targetHeight: number;
  /** True when either dimension had to be reduced to the local ceiling. */
  clamped: boolean;
  maxDimension: number;
}

/**
 * Translate a scale factor into Clipdrop's explicit target dimensions (§14.9).
 *
 * Clipdrop does not take a factor, so ×2/×4 must be resolved against the source size and then
 * clamped. A clamp is reported rather than silently applied, so the UI can tell the user the
 * request was reduced instead of quietly returning a smaller image than they asked for.
 */
export function translateUpscale(
  scaleFactor: number,
  sourceWidth: number,
  sourceHeight: number,
): UpscaleTranslation {
  const factor = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 2;
  const rawWidth = Math.round(sourceWidth * factor);
  const rawHeight = Math.round(sourceHeight * factor);
  const scaleDown = Math.min(1, CLIPDROP_MAX_UPSCALE_DIMENSION / Math.max(rawWidth, rawHeight));
  return {
    targetWidth: Math.max(1, Math.round(rawWidth * scaleDown)),
    targetHeight: Math.max(1, Math.round(rawHeight * scaleDown)),
    clamped: scaleDown < 1,
    maxDimension: CLIPDROP_MAX_UPSCALE_DIMENSION,
  };
}

export const clipdropAdapter: ProviderAdapter = {
  descriptor,

  /**
   * §14.9 says "⚠ VERIFY for an account endpoint" and documents no free account call.
   *
   * With no verified free endpoint, the only way to prove the key works is a billable operation.
   * Rather than spend the user's credits or quietly claim capabilities, this reports that the
   * credential could not be verified cheaply and confirms nothing.
   */
  async test(ctx: AdapterContext) {
    if (!ctx.credentials.apiKey) {
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: DESCRIPTOR_ID,
          remedy: 'Provide a Clipdrop API key.',
        } satisfies EngineError,
      };
    }
    return {
      ok: true,
      // Nothing is confirmed: no free endpoint is documented, so nothing was proven.
      confirmed: [] as AiCapability[],
      detail:
        'Key present, but Clipdrop documents no free account endpoint (§14.9 "⚠ VERIFY for an account endpoint"), so no capability could be confirmed without spending a credit. The first real call will confirm or reject the key.',
    };
  },

  async listModels(ctx: AdapterContext) {
    void ctx;
    return descriptor.models;
  },

  async run(req: AiRequest, ctx: AdapterContext): Promise<AiResult> {
    if (!ctx.credentials.apiKey) {
      throw Object.assign(new Error('Clipdrop missing apiKey'), {
        kind: 'ai-auth-failed' as const,
      });
    }
    if (!descriptor.capabilities.includes(req.capability)) {
      throw new Error(`Clipdrop adapter: unsupported capability ${req.capability}`);
    }
    const endpoint = ENDPOINTS[req.capability];
    if (!endpoint) {
      throw new Error(`Clipdrop adapter: no endpoint for capability ${req.capability}`);
    }

    const requestId = `clipdrop-${req.capability}-${Date.now()}`;
    const ledger: LedgerHeaderReading = { present: false };

    // Upscale is the only capability that needs a request/response shape translation (§14.9).
    const upscale =
      req.capability === 'upscale'
        ? translateUpscale(req.scaleFactor ?? 2, req.image?.width ?? 0, req.image?.height ?? 0)
        : null;

    return {
      text: '',
      usage: usageFromLedgerHeaders(ledger, requestId),
      raw: {
        adapter: 'clipdrop',
        p5: 12,
        spec: 'README §14.9',
        baseUrl: baseUrl(ctx),
        capability: req.capability,
        requestId,
        request: {
          method: 'POST',
          url: `${baseUrl(ctx)}${endpoint}`,
          headers: { 'x-api-key': '<redacted>', 'Content-Type': 'multipart/form-data' },
          fields: {
            image_file: '<image bytes>',
            ...(req.capability === 'erase'
              ? {
                  mask_file: '<mask bytes>',
                  mode: typeof req.extra?.mode === 'string' ? req.extra.mode : 'quality',
                }
              : {}),
            ...(req.capability === 'upscale' && upscale
              ? { target_width: upscale.targetWidth, target_height: upscale.targetHeight }
              : {}),
            ...(req.capability === 'replaceBackground' ? { prompt: req.prompt ?? '' } : {}),
          },
        },
        // §14.9: cleanup mask is white = remove, matching our canonical convention, so no
        // inversion is applied. An inverted mask would erase the background instead of the
        // masked object.
        //
        // Polarity is reported as NOT verified: the README both asserts the match and marks it
        // "⚠ VERIFY" in the same sentence, and we have no live run behind it. Same discipline as
        // bfl.ts: the claim is documented, the flag stays false until a contract test proves it.
        maskPolarity:
          req.capability === 'erase' ? 'white-remove (assumed to match ours)' : 'not-applicable',
        maskPolarityVerified: false,
        maskPolarityNote:
          '⚠ VERIFY: §14.9 says the cleanup mask is white = remove, which matches our canonical 8-bit grayscale convention (white 255 = change) in ai/mask-convention.ts, and marks it unverified in the same breath. The mask is sent unmodified on that basis; if a live contract test shows the opposite, flip maskInverted.',
        maskInverted: false,
        maskConversion: req.mask ? 'none (polarities already match)' : 'none',
        upscale,
        upscaleTranslationNote: upscale
          ? upscale.clamped
            ? `scaleFactor ${req.scaleFactor ?? 2} resolved to ${upscale.targetWidth}×${upscale.targetHeight} and was clamped to the ${CLIPDROP_MAX_UPSCALE_DIMENSION}px ceiling.`
            : `scaleFactor ${req.scaleFactor ?? 2} resolved to ${upscale.targetWidth}×${upscale.targetHeight}.`
          : 'not-applicable',
        ledger: {
          header: 'x-remaining-credits',
          readInto: 'AiResult.usage (the §13.6 ledger channel)',
          helper: 'readLedgerHeaders()',
          reading: ledger,
        },
        // Documented §14.9 endpoints that do not map to an AiCapability. Surfaced so the UI can
        // offer them without the adapter inventing a capability the type system does not have.
        additionalOperations: {
          'remove-text': { endpoint: '/remove-text/v1', mapsToCapability: null },
          reimagine: { endpoint: '/reimagine/v1/reimagine', mapsToCapability: null },
        },
        accountEndpointVerified: false,
        accountEndpointNote:
          '⚠ VERIFY: §14.9 flags the account endpoint as unverified, so test() confirms nothing rather than claiming capabilities.',
      },
    };
  },
};

/**
 * The real §14.9 call, kept separate from `run()` so the credit-consuming request is explicit.
 * Reads `x-remaining-credits` from the response for the ledger.
 */
export async function callClipdrop(
  req: AiRequest,
  image: Blob,
  ctx: AdapterContext,
  mask?: Blob,
  fetchImpl?: typeof fetch,
): Promise<{ body: Blob; usage: AiResult['usage']; ledger: LedgerHeaderReading }> {
  const endpoint = ENDPOINTS[req.capability];
  if (!endpoint) {
    throw new Error(`Clipdrop adapter: no endpoint for capability ${req.capability}`);
  }
  const doFetch = fetchImpl ?? ctx.fetch;
  const form = new FormData();
  form.append('image_file', image, 'image.png');
  if (req.capability === 'erase') {
    if (!mask) throw new Error('Clipdrop erase requires a mask');
    // Sent unmodified: Clipdrop's polarity already matches ours (§14.9).
    form.append('mask_file', mask, 'mask.png');
    form.append('mode', typeof req.extra?.mode === 'string' ? req.extra.mode : 'quality');
  }
  if (req.capability === 'upscale') {
    const t = translateUpscale(req.scaleFactor ?? 2, req.image?.width ?? 0, req.image?.height ?? 0);
    form.append('target_width', String(t.targetWidth));
    form.append('target_height', String(t.targetHeight));
  }
  if (req.capability === 'replaceBackground') {
    form.append('prompt', req.prompt ?? '');
  }

  const res = await doFetch(`${baseUrl(ctx)}${endpoint}`, {
    method: 'POST',
    headers: { 'x-api-key': ctx.credentials.apiKey ?? '' },
    body: form,
    signal: ctx.signal || null,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Clipdrop error (${res.status}): ${body}`);
  }
  const ledger = readLedgerHeaders(res.headers);
  return { body: await res.blob(), usage: usageFromLedgerHeaders(ledger), ledger };
}
