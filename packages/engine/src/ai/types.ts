/**
 * P5-01 — AI provider abstraction layer.
 * Types only: no real adapter implementations, no keystore, no transport policy.
 * See README §13.3 (adapter interface) and §14 (provider specs).
 */

import type { RasterImage, EngineError } from '../types.js';

/** Capability declarations — the registry is keyed by these, not provider names. */
export type AiCapability =
  | 'generate' // text → image
  | 'edit' // image + instruction → image (no mask)
  | 'inpaint' // image + mask + prompt → image
  | 'outpaint' // image + target canvas → image (generative expand)
  | 'erase' // image + mask → image, object removed (no prompt needed)
  | 'upscale' // image + factor → larger image
  | 'removeBackground' // image → image with alpha
  | 'replaceBackground' // image + prompt → image, subject preserved
  | 'describe' // image (+question) → text
  | 'segment'; // image (+point/prompt) → mask

/** Metadata for a credential input the user pastes into a provider. */
export interface CredentialField {
  key: string; // 'apiKey' | 'projectId' | 'region' | ...
  label: string;
  placeholder: string;
  secret: boolean; // masked input + never logged
  required: boolean;
  pattern?: string; // client-side sanity check only, never a hard gate
  help?: string;
}

/** A model offered by a provider, with its capability set and constraints. */
export interface ModelDescriptor {
  id: string;
  label: string;
  capabilities: AiCapability[];
  maxInputPixels?: number;
  maxInputBytes?: number;
  supportedInputMime?: string[];
  supportedSizes?: string[]; // e.g. ['1024x1024','1536x1024','1024x1536']
  supportsMask?: boolean;
  supportsSeed?: boolean;
  supportsNegativePrompt?: boolean;
  notes?: string;
}

/** Descriptor for a provider — metadata, capabilities, model list, CORS posture. */
export interface ProviderDescriptor {
  id: string; // 'anthropic' | 'openai' | 'gemini' | ...
  name: string; // 'Anthropic (Claude)'
  homepage: string;
  keysUrl: string; // deep link to where the user creates a key
  pricingUrl: string;
  docsUrl: string;
  /** What the user pastes. Multiple fields for providers needing project/region/etc. */
  credentialFields: CredentialField[];
  /** Optional user-supplied base URL (self-hosted / proxy / gateway). */
  allowsCustomBaseUrl: boolean;
  defaultBaseUrl: string;
  capabilities: AiCapability[];
  models: ModelDescriptor[];
  /** Honest CORS posture, verified by the nightly contract test (§22.7). */
  browserDirect: 'yes' | 'yes-with-header' | 'no' | 'unknown';
  browserDirectNote?: string;
  /** Rough cost hint shown in the UI. Never presented as authoritative. */
  costHint?: string;
  /** Provider's stated data-retention/training policy, with a link. Displayed verbatim. */
  dataPolicy: { summary: string; url: string };
}

/** An AI escalation request — capability-driven, provider-agnostic at the call site. */
export interface AiRequest {
  capability: AiCapability;
  model: string;
  prompt?: string;
  negativePrompt?: string;
  image?: RasterImage;
  mask?: RasterImage; // white = edit region, per our convention (adapters convert)
  targetCanvas?: { width: number; height: number; anchorX: number; anchorY: number };
  size?: string;
  aspectRatio?: string;
  count?: number;
  seed?: number;
  scaleFactor?: number; // upscale
  question?: string; // describe
  describeMode?: 'alt-text' | 'caption' | 'tags' | 'detailed' | 'ocr';
  outputFormat?: 'png' | 'jpeg' | 'webp';
  extra?: Record<string, unknown>; // provider-specific escape hatch, surfaced in Advanced
}

/** Result from an AI adapter run — always a normal image/text in the pipeline. */
export interface AiResult {
  images?: RasterImage[];
  text?: string;
  /** Everything needed for the cost ledger (§13.6) and for user trust. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    images?: number;
    providerCost?: string;
    requestId?: string;
  };
  raw?: unknown; // retained only in dev builds
}

/** Context supplied to an adapter at call time — no raw storage here. */
export interface AdapterContext {
  credentials: Record<string, string>; // resolved from the keystore, in memory only
  baseUrl: string;
  fetch: typeof fetch; // the instrumented transport (§13.5)
  signal?: AbortSignal;
  onProgress?: (p: { phase: string; fraction?: number; message?: string }) => void;
}

/** A registered adapter bound to its descriptor, capable of test / list / run. */
export interface ProviderAdapter {
  descriptor: ProviderDescriptor;
  /** Cheap, low-cost call proving credentials work. Must not generate a billable image
   *  where a free/metadata endpoint exists. Returns which capabilities were confirmed. */
  test(
    ctx: AdapterContext,
  ): Promise<
    { ok: true; confirmed: AiCapability[]; detail: string } | { ok: false; error: EngineError }
  >;
  /** Optional: fetch the live model list so we never show a stale hard-coded model. */
  listModels?(ctx: AdapterContext): Promise<ModelDescriptor[]>;
  run(req: AiRequest, ctx: AdapterContext): Promise<AiResult>;
}
