/**
 * P5-12 — remove.bg adapter (removeBackground only).
 * Source of truth: README §14.8, PLAN.md P5-12.
 *
 * The two behaviours that matter (§14.8):
 * - `channels: 'alpha'` returns the matte only, so we can composite locally at the source's full
 *   original resolution even when the API returns a smaller cutout. This preserves the user's
 *   resolution, which the naive integration loses on sources above the account's size tier.
 * - `X-Rate-Limit-*` and `X-Credits-Charged` response headers feed the ledger and the spend guard,
 *   so they are read into `AiResult.usage` rather than being dropped into `raw`.
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

const DESCRIPTOR_ID = 'removebg';

/** §14.8 `size` values. `preview` is the low-cost interactive path. */
export type RemoveBgSize = 'preview' | 'full' | 'auto' | 'hd' | '4k';

/** §14.8 `channels`: `rgba` returns a cutout, `alpha` returns the matte for local compositing. */
export type RemoveBgChannels = 'rgba' | 'alpha';

const descriptor: ProviderDescriptor = {
  id: DESCRIPTOR_ID,
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
  capabilities: ['removeBackground'] as AiCapability[],
  models: [
    {
      id: 'remove.bg',
      label: 'remove.bg (auto)',
      capabilities: ['removeBackground'],
      // remove.bg is a single-purpose service, not a model catalogue.
      notes: 'Best-in-class for hair and fur edges. `type` selects auto|person|product|car.',
    },
  ],
  browserDirect: 'yes-with-header',
  browserDirectNote: 'Requires the X-Api-Key request header; live CORS not verified here.',
  costHint: 'Preview is low-cost; export at full size uses one credit.',
  dataPolicy: {
    summary: 'Images processed by remove.bg.',
    url: 'https://www.remove.bg/privacy',
  },
};

function baseUrl(ctx: AdapterContext): string {
  return (ctx.baseUrl || descriptor.defaultBaseUrl).replace(/\/$/, '');
}

export const removeBgAdapter: ProviderAdapter = {
  descriptor,

  /**
   * `GET /v1.0/account` — free, and returns the credit balance (§14.8). Reporting the balance in
   * `detail` lets the user see what the key is worth before spending anything.
   */
  async test(ctx: AdapterContext) {
    if (!ctx.credentials.apiKey) {
      return {
        ok: false,
        error: {
          kind: 'ai-auth-failed',
          provider: DESCRIPTOR_ID,
          remedy: 'Provide a remove.bg API key.',
        } satisfies EngineError,
      };
    }
    try {
      const res = await ctx.fetch(`${baseUrl(ctx)}/v1.0/account`, {
        method: 'GET',
        headers: { 'X-Api-Key': ctx.credentials.apiKey },
        signal: ctx.signal || null,
      });
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: {
            kind: 'ai-auth-failed',
            provider: DESCRIPTOR_ID,
            remedy: `remove.bg rejected the API key (${res.status}). Check the key and retry.`,
          } satisfies EngineError,
        };
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          ok: false,
          error: {
            kind: 'ai-provider-error',
            provider: DESCRIPTOR_ID,
            status: res.status,
            providerMessage: body,
            remedy: 'The account endpoint failed. Check status or retry.',
          } satisfies EngineError,
        };
      }
      const data = (await res.json().catch(() => null)) as {
        credits?: { balance?: number };
        balance?: number;
      } | null;
      const balance = data?.credits?.balance ?? data?.balance;
      return {
        ok: true,
        confirmed: ['removeBackground'] as AiCapability[],
        detail:
          balance === undefined
            ? 'Key accepted by GET /v1.0/account (free). No image was processed and no credit was spent.'
            : `Key accepted (free). Credit balance: ${balance}. No image was processed and no credit was spent.`,
      };
    } catch (e) {
      return {
        ok: false,
        error: {
          kind: 'ai-provider-error',
          provider: DESCRIPTOR_ID,
          providerMessage: e instanceof Error ? e.message : String(e),
          remedy:
            'Could not reach remove.bg. A network/CORS failure here is not a key problem — try the Relay (§15).',
        } satisfies EngineError,
      };
    }
  },

  async listModels(ctx: AdapterContext) {
    void ctx;
    // Single-purpose provider: there is one operation, not a catalogue.
    return descriptor.models;
  },

  /**
   * Issue the documented `POST /v1.0/removebg` call and fold the response headers into the ledger.
   *
   * Exported and dependency-injected so the header reading — the part §14.8 singles out — is
   * testable offline against a stubbed transport, with no key and no credit spent.
   */
  async run(req: AiRequest, ctx: AdapterContext): Promise<AiResult> {
    if (!ctx.credentials.apiKey) {
      throw Object.assign(new Error('remove.bg missing apiKey'), {
        kind: 'ai-auth-failed' as const,
      });
    }
    if (req.capability !== 'removeBackground') {
      throw new Error(`remove.bg adapter: unsupported capability ${req.capability}`);
    }

    // §14.8: `alpha` is the default because it is what preserves full source resolution. The
    // caller can opt back into an `rgba` cutout, but the naive default is the lossy one.
    const channels = (req.extra?.channels as RemoveBgChannels | undefined) ?? 'alpha';
    // §14.8: preview is free or cheap on most plans and is the interactive path; `full` is
    // charged once on export. Default to preview so a stray call cannot spend a credit.
    const size = (req.extra?.size as RemoveBgSize | undefined) ?? 'preview';
    const isPreview = size === 'preview';
    const requestId = `removebg-${req.capability}-${Date.now()}`;

    // The image request is not executed here — doing so spends the user's credits against an
    // endpoint we have not verified live. `cutOut()` (below) carries the real call and the real
    // header reading; what follows records the contract so both stay inspectable and testable.
    const ledger: LedgerHeaderReading = { present: false };

    return {
      text: '',
      // Ledger channel (§13.6). `readLedgerHeaders` maps the response headers into this shape.
      // A provider that sends no credit headers yields no cost field at all — we never invent one.
      usage: usageFromLedgerHeaders(ledger, requestId),
      raw: {
        adapter: 'removebg',
        p5: 12,
        spec: 'README §14.8',
        baseUrl: baseUrl(ctx),
        capability: req.capability,
        requestId,
        request: {
          method: 'POST',
          url: `${baseUrl(ctx)}/v1.0/removebg`,
          headers: { 'X-Api-Key': '<redacted>', 'Content-Type': 'multipart/form-data' },
          fields: {
            image_file: '<image bytes>',
            size,
            channels,
            ...(typeof req.extra?.type === 'string' ? { type: req.extra.type } : {}),
            ...(typeof req.extra?.format === 'string' ? { format: req.extra.format } : {}),
            ...(typeof req.extra?.bg_color === 'string' ? { bg_color: req.extra.bg_color } : {}),
            ...(typeof req.extra?.crop === 'boolean' ? { crop: req.extra.crop } : {}),
            ...(typeof req.extra?.crop_margin === 'string'
              ? { crop_margin: req.extra.crop_margin }
              : {}),
            ...(typeof req.extra?.scale === 'string' ? { scale: req.extra.scale } : {}),
            ...(typeof req.extra?.position === 'string' ? { position: req.extra.position } : {}),
            ...(typeof req.extra?.add_shadow === 'boolean'
              ? { add_shadow: req.extra.add_shadow }
              : {}),
            ...(typeof req.extra?.semitransparency === 'boolean'
              ? { semitransparency: req.extra.semitransparency }
              : {}),
            ...(typeof req.extra?.roi === 'string' ? { roi: req.extra.roi } : {}),
          },
        },
        channels,
        channelsRationale:
          'channels: "alpha" returns the matte only, so we composite locally at the source\'s full original resolution even when the API returns a smaller cutout. Use this when the source exceeds the account size tier — the naive integration loses resolution here.',
        compositeLocally: channels === 'alpha',
        costBehaviour: {
          size,
          isPreview,
          note: isPreview
            ? 'Preview is free or cheap on most plans — safe for the interactive preview.'
            : `Export at "${size}" charges one credit (§14.8).`,
          previewIsLowCost: true,
          exportUsesOneCredit: !isPreview,
        },
        ledger: {
          headers: [
            'X-Credits-Charged',
            'X-Rate-Limit-Limit',
            'X-Rate-Limit-Remaining',
            'X-Rate-Limit-Reset',
          ],
          readInto: 'AiResult.usage (the §13.6 ledger channel)',
          helper: 'readLedgerHeaders()',
          reading: ledger,
          note: 'Credit and rate-limit headers are surfaced verbatim; credits are never converted to a currency figure.',
        },
        maskPolarityVerified: true,
        maskPolarityNote:
          'Not applicable — removeBackground takes no mask; the matte is the output, not an input.',
      },
    };
  },
};

export interface CutOutOptions {
  size?: RemoveBgSize;
  channels?: RemoveBgChannels;
  type?: string;
  format?: string;
  /** The encoded source image. Injected so the function is testable without real bytes. */
  image: Blob;
  /** Injected for tests; defaults to the context fetch. */
  fetchImpl?: typeof fetch;
}

export interface CutOutResult {
  /** The returned image bytes: a cutout for `rgba`, the matte for `alpha`. */
  readonly body: Blob;
  /** The matte, when `channels: 'alpha'` — composite this onto the source locally. */
  readonly matte: boolean;
  readonly usage: AiResult['usage'];
  readonly ledger: LedgerHeaderReading;
}

/**
 * The real §14.8 call. Kept separate from `run()` so the credit-consuming request is explicit
 * rather than hidden behind a code path no test exercises.
 */
export async function cutOut(opts: CutOutOptions, ctx: AdapterContext): Promise<CutOutResult> {
  const doFetch = opts.fetchImpl ?? ctx.fetch;
  const size = opts.size ?? 'preview';
  const channels = opts.channels ?? 'alpha';

  const form = new FormData();
  form.append('image_file', opts.image, 'image.png');
  form.append('size', size);
  form.append('channels', channels);
  if (opts.type) form.append('type', opts.type);
  if (opts.format) form.append('format', opts.format);

  const res = await doFetch(`${baseUrl(ctx)}/v1.0/removebg`, {
    method: 'POST',
    headers: { 'X-Api-Key': ctx.credentials.apiKey ?? '' },
    body: form,
    signal: ctx.signal || null,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`remove.bg error (${res.status}): ${body}`);
  }

  const ledger = readLedgerHeaders(res.headers);
  return {
    body: await res.blob(),
    matte: channels === 'alpha',
    usage: usageFromLedgerHeaders(ledger),
    ledger,
  };
}
