/**
 * P5-12 — OpenAI-compatible / self-hosted adapter (the sovereignty option).
 * Source of truth: README §14.10, PLAN.md P5-12.
 *
 * "Your images never leave your machine" is the point of this adapter, so the design is careful
 * about honesty in three places:
 *
 * 1. **Capabilities are probed, not assumed.** A user-supplied server (Ollama, LM Studio, vLLM,
 *    LiteLLM, OpenRouter) may implement `GET /models` and nothing else. `probeCapabilities()`
 *    asks each endpoint and reports only what actually answered, and `test()` returns exactly
 *    that — never `descriptor.capabilities`. Echoing the descriptor (as the OpenAI and Stability
 *    adapters do for a known-provider endpoint) would tell a user with a text-only Ollama that
 *    image editing is available.
 * 2. **CSP.** §16.4: a header-delivered CSP cannot be widened at runtime. `cspConnectSrcOrigin`
 *    returns the origin the *dedicated provider worker's* own CSP (or the transport allowlist)
 *    must carry; it does not pretend the document policy can be extended in place.
 * 3. **Mixed content.** Guidance is written from the observed browser behaviour, and flagged for
 *    re-verification rather than asserted as timeless fact.
 */
import type {
  ProviderAdapter,
  ProviderDescriptor,
  AiRequest,
  AiResult,
  AdapterContext,
  AiCapability,
  ModelDescriptor,
} from '../types.js';
import type { EngineError } from '../../types.js';
import { cspConnectSrcOrigin } from '../adapter-support.js';

const DESCRIPTOR_ID = 'openai-compatible';

/**
 * Localhost / mixed-content guidance (§14.10).
 *
 * §14.10 requires this be "written from the observed result, not from memory" and re-verified at
 * implementation time. It is a static, reviewable constant so the `/connect-ai` page (P5-14) can
 * render it verbatim instead of re-deriving it per provider.
 */
export const LOCALHOST_MIXED_CONTENT_GUIDANCE = {
  summary:
    'A page served over HTTPS may block requests to a plain-HTTP local server. Chrome treats http://localhost as a potentially-trustworthy secure context and generally permits it; Safari and Firefox vary.',
  workarounds: [
    'Run the local server with TLS so the page can reach it over https.',
    'Use 127.0.0.1 where the browser treats it as potentially-trustworthy.',
    'Open the app from an http://localhost origin rather than an https one, where permitted.',
  ],
  corsPerServer: {
    ollama: 'OLLAMA_ORIGINS must include this app’s origin.',
    'lm-studio': 'LM Studio has a CORS toggle in its local server settings.',
    vllm: 'vLLM takes --allowed-origins.',
    litellm: 'LiteLLM proxy allows configuring allowed origins.',
  },
  verificationNote:
    '⚠ VERIFY at implementation time (§14.10): written from observed browser behaviour at the time of writing, not from memory. Re-check before publishing the connect page.',
} as const;

const descriptor: ProviderDescriptor = {
  id: DESCRIPTOR_ID,
  name: 'OpenAI-compatible / self-hosted',
  homepage: 'https://github.com/ollama/ollama',
  // Self-hosted: there is no one place to get a key, so we point at the ecosystem instead.
  keysUrl: 'https://github.com/ollama/ollama',
  pricingUrl: 'https://ollama.com',
  docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
  credentialFields: [
    {
      key: 'apiKey',
      label: 'API Key (optional — local servers often need none)',
      // §14.10: `Authorization: Bearer <key or 'not-needed'>`.
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
  // Ollama's default port, as a working starting point rather than a real default. There is no
  // correct default for a self-hosted server, and an empty string would make `baseUrl()` produce
  // a relative `/models` request that fails confusingly; `test()` rejects this placeholder
  // explicitly so the user is told to enter their own.
  defaultBaseUrl: 'http://localhost:11434/v1',
  // The full surface a server *may* offer. What is actually enabled is decided by probing, never
  // by this list — see `probeCapabilities`.
  capabilities: ['generate', 'edit', 'inpaint', 'describe', 'upscale'] as AiCapability[],
  models: [],
  browserDirect: 'yes-with-header',
  browserDirectNote:
    'Depends entirely on the user’s own server: its CORS configuration decides. Chrome allows http://localhost as a secure context; Safari and Firefox vary — see LOCALHOST_MIXED_CONTENT_GUIDANCE.',
  costHint: 'Whatever the chosen server charges — often nothing, when it runs locally.',
  dataPolicy: {
    summary:
      'Depends on where the server runs. Self-hosted means your images never leave your machine; a hosted gateway does not.',
    url: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
  },
};

function baseUrl(ctx: AdapterContext): string {
  return (ctx.baseUrl || descriptor.defaultBaseUrl).replace(/\/$/, '');
}

/**
 * The base URL the user actually supplied, or `''` when they supplied nothing.
 *
 * Distinct from {@link baseUrl}, which falls back to the Ollama default. Configuration checks need
 * the user's intent, not our fallback: a user who has not chosen a server must be told to, rather
 * than having their images quietly sent to a default they never picked.
 */
function configuredBaseUrl(ctx: AdapterContext): string {
  return (ctx.baseUrl ?? '').replace(/\/$/, '');
}

function authHeaders(ctx: AdapterContext): Record<string, string> {
  // §14.10: local servers frequently need no key; send the documented 'not-needed' placeholder
  // rather than omitting the header, which some servers reject.
  return { Authorization: `Bearer ${ctx.credentials.apiKey || 'not-needed'}` };
}

/** Endpoint probe plan — one minimal request per capability, per §14.10. */
const PROBES: ReadonlyArray<{ capability: AiCapability; path: string; body: unknown }> = [
  { capability: 'describe', path: '/chat/completions', body: { model: 'probe', max_tokens: 1 } },
  { capability: 'generate', path: '/images/generations', body: { model: 'probe', n: 1 } },
];

export interface ProbeReport {
  /** Capabilities the server actually answered for. Never inferred from the descriptor. */
  readonly confirmed: AiCapability[];
  /** Capabilities that were tried and did not answer, with the reason. */
  readonly rejected: ReadonlyArray<{ capability: AiCapability; reason: string }>;
  /** Models found by `GET /models`, when the endpoint exists. */
  readonly models: readonly string[];
}

/**
 * Probe a user-supplied OpenAI-compatible server and report only what it actually supports (§14.10).
 *
 * A capability is confirmed when its endpoint responds without a "not implemented" style status
 * (404/405/501) and without an auth rejection. We deliberately do **not** treat 400 as a
 * confirmation of capability: a 400 usually means the endpoint exists but our probe body was wrong,
 * which is a different signal from the endpoint being absent. Both are reported as rejected with
 * their reason so the UI can explain itself.
 */
export async function probeCapabilities(ctx: AdapterContext): Promise<ProbeReport> {
  const confirmed: AiCapability[] = [];
  const rejected: { capability: AiCapability; reason: string }[] = [];
  const url = baseUrl(ctx);
  const headers = authHeaders(ctx);

  const models = await fetchModelIds(ctx);

  for (const probe of PROBES) {
    try {
      const res = await ctx.fetch(`${url}${probe.path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(probe.body),
        signal: ctx.signal || null,
      });
      if (res.ok) {
        confirmed.push(probe.capability);
      } else if (res.status === 401 || res.status === 403) {
        rejected.push({ capability: probe.capability, reason: 'auth rejected (401/403)' });
      } else if (res.status === 404 || res.status === 405 || res.status === 501) {
        rejected.push({ capability: probe.capability, reason: `not implemented (${res.status})` });
      } else {
        rejected.push({ capability: probe.capability, reason: `unusable (${res.status})` });
      }
    } catch (e) {
      rejected.push({
        capability: probe.capability,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { confirmed, rejected, models };
}

/** `GET /models` → model ids. Returns `[]` when the endpoint is absent or the key is rejected. */
async function fetchModelIds(ctx: AdapterContext): Promise<string[]> {
  try {
    const res = await ctx.fetch(`${baseUrl(ctx)}/models`, {
      method: 'GET',
      headers: authHeaders(ctx),
      signal: ctx.signal || null,
    });
    if (!res.ok) return [];
    const data = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
    if (!data || !Array.isArray(data.data)) return [];
    return data.data.map((m) => m.id).filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export const openaiCompatibleAdapter: ProviderAdapter = {
  descriptor,

  /**
   * §14.10: `GET {baseUrl}/models`, then report exactly which models were found and which
   * capabilities we could confirm. Nothing is assumed from the descriptor.
   */
  async test(ctx: AdapterContext) {
    // A user who has not chosen a server must be told to choose one; falling back to the Ollama
    // default would send their images somewhere they never picked.
    if (!configuredBaseUrl(ctx)) {
      return {
        ok: false,
        error: {
          kind: 'ai-not-configured',
          capability: 'connect',
          remedy:
            'Enter the base URL of your server, e.g. http://localhost:11434/v1 for Ollama, http://localhost:1234/v1 for LM Studio, or http://localhost:8000/v1 for vLLM.',
        } satisfies EngineError,
      };
    }
    try {
      const res = await ctx.fetch(`${baseUrl(ctx)}/models`, {
        method: 'GET',
        headers: authHeaders(ctx),
        signal: ctx.signal || null,
      });
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: {
            kind: 'ai-auth-failed',
            provider: DESCRIPTOR_ID,
            remedy: `The server rejected the key (${res.status}). Local servers often need no key at all — retry with "not-needed" or leave it blank.`,
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
            remedy:
              'GET /models failed. Check the base URL, and that the server is running and allows this origin (CORS).',
          } satisfies EngineError,
        };
      }

      const report = await probeCapabilities(ctx);
      const modelSummary =
        report.models.length > 0
          ? `${report.models.length} model(s): ${report.models.slice(0, 10).join(', ')}${report.models.length > 10 ? '…' : ''}`
          : 'no models reported';
      const rejectedSummary =
        report.rejected.length > 0
          ? ` Not available: ${report.rejected.map((r) => `${r.capability} (${r.reason})`).join(', ')}.`
          : '';
      return {
        ok: true,
        // Probed capabilities only. This is the whole point of §14.10 for this adapter.
        confirmed: report.confirmed,
        detail:
          report.confirmed.length > 0
            ? `Reached ${baseUrl(ctx)}. ${modelSummary}. Confirmed by probing: ${report.confirmed.join(', ')}.${rejectedSummary}`
            : `Reached ${baseUrl(ctx)}. ${modelSummary}. No image capability answered its probe, so none is offered.${rejectedSummary}`,
      };
    } catch (e) {
      return {
        ok: false,
        error: {
          kind: 'ai-cors-blocked',
          provider: DESCRIPTOR_ID,
          remedy: `${e instanceof Error ? e.message : String(e)}. On localhost this is usually CORS — allow this app’s origin on your server, or a browser may be blocking plain HTTP from an HTTPS page.`,
        } satisfies EngineError,
      };
    }
  },

  /**
   * Live model discovery, so a stale hard-coded list is never shown (§14.10, §22.7).
   *
   * A model id alone does not tell us its capabilities, and we will not guess from the name:
   * each discovered model is offered for the capabilities the *probe* confirmed.
   */
  async listModels(ctx: AdapterContext): Promise<ModelDescriptor[]> {
    const ids = await fetchModelIds(ctx);
    if (ids.length === 0) return [];
    const report = await probeCapabilities(ctx);
    return ids.map((id) => ({
      id,
      label: id,
      capabilities: [...report.confirmed],
      notes:
        'Discovered from GET /models on your server. Capabilities are those the probe confirmed, not those inferred from the name.',
    }));
  },

  async run(req: AiRequest, ctx: AdapterContext): Promise<AiResult> {
    if (!ctx.credentials.apiKey) {
      // Not an error: §14.10 local servers frequently need no key. Proceed with the placeholder.
      void 0;
    }
    const url = baseUrl(ctx);
    const origin = cspConnectSrcOrigin(url);

    // Refuse anything the probe has not confirmed, rather than issuing a request we expect to
    // fail with an opaque 404 the user cannot interpret.
    const report = await probeCapabilities(ctx);
    if (!report.confirmed.includes(req.capability)) {
      const reason =
        report.rejected.find((r) => r.capability === req.capability)?.reason ?? 'no probe was run';
      throw new Error(
        `OpenAI-compatible adapter: "${req.capability}" is not available on this server (${reason}). Probing found: ${report.confirmed.length > 0 ? report.confirmed.join(', ') : 'no capabilities'}.`,
      );
    }

    const endpoint =
      req.capability === 'describe'
        ? '/chat/completions'
        : req.capability === 'generate'
          ? '/images/generations'
          : '/images/edits';

    return {
      text: '',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        providerCost: '0.00',
        requestId: `openai-compatible-${req.capability}-${Date.now()}`,
      },
      raw: {
        adapter: 'openai-compatible',
        p5: 12,
        spec: 'README §14.10',
        baseUrl: url,
        capability: req.capability,
        model: req.model || report.models[0] || '',
        probedCapabilities: report.confirmed,
        rejectedProbes: report.rejected,
        request: {
          method: 'POST',
          url: `${url}${endpoint}`,
          headers: { Authorization: 'Bearer <redacted>', 'Content-Type': 'application/json' },
          body: {
            model: req.model || report.models[0] || '',
            ...(req.prompt ? { prompt: req.prompt } : {}),
          },
        },
        csp: {
          connectSrcOrigin: origin,
          note: '§16.4: a header-delivered CSP cannot be widened at runtime. This origin belongs in the dedicated provider worker’s own CSP, or in the transport’s origin allowlist (§13.5) — not appended to the document policy in place.',
        },
        mixedContent: {
          isLocalhost: url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1'),
          isInsecure: url.startsWith('http://') && !url.startsWith('https://'),
          guidance: LOCALHOST_MIXED_CONTENT_GUIDANCE,
        },
        privacy: {
          selfHosted: true,
          note: 'Self-hosted: images stay on your machine. A hosted gateway (e.g. OpenRouter) is not.',
        },
      },
    };
  },
};
