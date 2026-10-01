/**
 * P5-15 — the gate every provider request must pass, and the runner that executes it.
 *
 * This is where §4.9's "clearly labelled, costed before it runs" and §13.6's estimate-before-the-call
 * requirement become executable. The old route did its validation inline in the Svelte component,
 * which made it impossible to test the *order* of the checks — and the order is the whole point:
 *
 *   consent → configuration → credentials → **estimate** → path resolution → request
 *
 * Every gate is checked before any bytes move, and the estimate is produced from the local price
 * table *before* the request so the user sees it while they can still stop it. A missing price is
 * reported as "estimate unavailable", never as a fabricated number and never as a silent zero.
 *
 * The runner itself is dependency-injected (`runProviderRequest` takes a `deps` object) so the whole
 * gate sequence is testable with mocks and zero network — which is how the suite proves that
 * **no provider request occurs before explicit consent**.
 */

import type {
  AiCapability,
  AiRequest,
  AiResult,
  ProviderAdapter,
  ProviderDescriptor,
} from '@complianttools/image-engine/ai/types';
import {
  adapterImplementsCapability,
  resultIsUsable,
} from '@complianttools/image-engine/ai/adapter-contracts';
import {
  describePath,
  resolveRequest,
  RelayRoutingError,
  type RelayConfig,
  type ResolvedRequest,
} from '@complianttools/image-engine/ai/relay';
import { transportFetch, type TransportOptions } from '@complianttools/image-engine/ai/transport';
import { estimateRequestCost } from '@complianttools/image-engine/ai/ledger-persistence';
import {
  classifyThrown,
  failureMessage,
  type FailureClass,
  type FailureMessage,
} from '../connect/failures.ts';

/** Why a request was refused before it was sent. Distinct from a provider failure. */
export type GateRefusal =
  | 'consent-required'
  | 'credential-missing'
  | 'base-url-missing'
  | 'provider-invalid'
  | 'relay-invalid'
  | 'capability-unsupported'
  | 'image-required'
  | 'prompt-required';

/** The pre-request cost estimate, as the local price table reports it. */
export interface CostEstimate {
  /** True when a documented price was found. False means the price table had no entry. */
  readonly available: boolean;
  /** The figure, or `undefined` when unavailable. Never a placeholder zero. */
  readonly amount?: number;
  /** The sentence to show, including the price-table version and last-updated date. */
  readonly label: string;
  /** The table version the estimate came from, for the `data-` attributes the tests assert on. */
  readonly tableVersion: string;
}

/** Everything the gate needs. None of it is persisted; all of it is caller-owned state. */
export interface GateInput {
  readonly capability: AiCapability;
  readonly descriptor: ProviderDescriptor;
  readonly adapter: ProviderAdapter;
  /** The explicit consent checkbox. The gate cannot be satisfied any other way. */
  readonly consent: boolean;
  /** Credentials in memory for this request only. */
  readonly credentials: Readonly<Record<string, string>>;
  /** A user-supplied base URL, when the provider takes one. */
  readonly baseUrl: string;
  /** The relay configuration, or `undefined` for a direct connection. */
  readonly relay?: RelayConfig;
  /** The AiRequest body fields the capability needs. */
  readonly request: AiRequest;
}

/** Injected collaborators. Every one has a real default; tests replace them with mocks. */
export interface RunnerDeps {
  readonly loadAdapter?: (providerId: string) => Promise<ProviderAdapter | undefined>;
  readonly estimate?: typeof estimateRequestCost;
  readonly fetchTransport?: typeof transportFetch;
  readonly transportOptions?: Partial<TransportOptions>;
}

/** A refusal or a failure, already rendered into §17.3's message shape. */
export interface RequestFailure {
  readonly refusal?: GateRefusal;
  readonly message: FailureMessage;
}

/** The successful outcome, with everything the UI must show about it. */
export interface RequestSuccess {
  readonly result: AiResult;
  readonly pathNote: string;
  readonly usedPath: 'direct' | 'relay';
  readonly estimate: CostEstimate;
  readonly providerCostNote?: string;
}

export type RequestOutcome =
  | { readonly ok: true; readonly value: RequestSuccess }
  | { readonly ok: false; readonly error: RequestFailure };

/** Split a failure string of the form `kind: message` into its parts. */
function refusalMessage(refusal: GateRefusal, descriptor: ProviderDescriptor): FailureMessage {
  switch (refusal) {
    case 'consent-required':
      return {
        class: 'not-configured' as FailureClass,
        headline: 'Consent required before anything is sent',
        detail:
          'Nothing was sent, because sending an image or a prompt to a third party needs your explicit ' +
          'agreement first. Tick the consent box, then request again.',
        remedy: `Tick the consent box on this page. ${descriptor.name} never receives anything without it.`,
        actions: [],
        severity: 'warning',
      };
    case 'credential-missing':
      return {
        class: 'not-configured',
        headline: `No ${descriptor.name} key entered`,
        detail: 'Nothing was sent, because there was no credential to send it with.',
        remedy: `Paste a ${descriptor.name} key on this page. It is held in memory for this page only and is never saved.`,
        actions: [{ href: descriptor.keysUrl, label: `${descriptor.name}’s key page` }],
        severity: 'warning',
      };
    case 'base-url-missing':
      return {
        class: 'not-configured',
        headline: 'No endpoint entered',
        detail: 'Nothing was sent, because there was nowhere to send it.',
        remedy: `Enter the endpoint ${descriptor.name} gave you, or pick a different provider.`,
        actions: [{ href: '/connect-ai#chooser', label: 'Pick a provider' }],
        severity: 'warning',
      };
    case 'prompt-required':
      return {
        class: 'unsupported',
        headline: 'This request needs a description',
        detail: 'Nothing was sent, because the instruction to send was empty.',
        remedy: 'Describe the image you want, then request again.',
        actions: [],
        severity: 'warning',
      };
    case 'image-required':
      return {
        class: 'unsupported',
        headline: 'Choose an image first',
        detail: 'Nothing was sent, because this operation works on an image and none was chosen.',
        remedy: 'Choose an image, then request again.',
        actions: [],
        severity: 'warning',
      };
    case 'capability-unsupported':
      return {
        class: 'unsupported',
        headline: `${descriptor.name} does not do that`,
        detail: `Nothing was sent. ${descriptor.name} has no verified implementation for this operation.`,
        remedy:
          'Choose a provider whose adapter really implements it, or use a local tool that does the same job.',
        actions: [{ href: '/connect-ai#chooser', label: 'See which providers do' }],
        severity: 'error',
      };
    default: {
      // The two endpoint classes reuse §17.3's wording for the underlying cause.
      const isRelay = refusal === 'relay-invalid';
      return {
        class: isRelay ? ('unknown' as FailureClass) : ('unknown' as FailureClass),
        headline: isRelay ? 'That relay address will not work' : 'That endpoint will not work',
        detail: isRelay
          ? 'Nothing was sent, and nothing was sent directly instead. An unusable relay is an error, never a quiet downgrade.'
          : 'Nothing was sent. A provider request must use https and carry no embedded username or password.',
        remedy: isRelay
          ? 'Fix the relay address, or switch the connection back to Direct. The app will not choose for you.'
          : 'Check the address you pasted.',
        actions: [],
        severity: 'error',
      };
    }
  }
}

/**
 * Compute the pre-request estimate.
 *
 * Wraps `estimateRequestCost` so the UI gets a discriminated result rather than a stringly-typed
 * `'0.0000'` that could be mistaken for "free". The unavailable branch is the important one: the
 * price table documents two entries, so most provider/model pairs have no price, and inventing one
 * is the failure mode this exists to prevent.
 */
export async function buildCostEstimate(
  descriptor: ProviderDescriptor,
  model: string,
  capability: AiCapability,
  images = 1,
  estimate: typeof estimateRequestCost = estimateRequestCost,
): Promise<CostEstimate> {
  const result = await estimate(descriptor.id, model, capability, { images });
  if (result.estimate === '0.0000' && result.label.startsWith('Estimate unavailable')) {
    return { available: false, label: result.label, tableVersion: versionOf(result.label) };
  }
  return {
    available: true,
    amount: Number.parseFloat(result.estimate),
    label: result.label,
    tableVersion: versionOf(result.label),
  };
}

/** The price-table version, extracted for the `data-` attribute. Falls back to a sentinel. */
function versionOf(label: string): string {
  const match = /(?:version|table v)\s*([A-Za-z0-9_.-]+)/u.exec(label);
  return match?.[1] ?? 'unknown';
}

/**
 * Run a provider request through every gate, then to the adapter.
 *
 * The gates are ordered so that consent is checked before anything else. A caller cannot reorder
 * them by accident because there is only one code path, and each refusal returns immediately.
 */
export async function runProviderRequest(
  input: GateInput,
  deps: RunnerDeps = {},
): Promise<RequestOutcome> {
  const { descriptor, adapter } = input;

  // 1. Consent first, always. Not after the endpoint check, not after the key check.
  if (!input.consent) {
    return {
      ok: false,
      error: {
        refusal: 'consent-required',
        message: refusalMessage('consent-required', descriptor),
      },
    };
  }

  // 2. The adapter must really implement the capability before we trust it with a credential.
  if (!adapterImplementsCapability(adapter, input.capability)) {
    return {
      ok: false,
      error: {
        refusal: 'capability-unsupported',
        message: refusalMessage('capability-unsupported', descriptor),
      },
    };
  }

  // 3. Endpoint validity, before anything about the payload.
  //
  // Order matters here: an unusable relay must be reported as an unusable relay, not as whatever
  // else happens to be missing. Checking the request fields first would let "no prompt" mask
  // "this relay is not https" — and §15.4's rule is that the path problem is never quietly hidden
  // behind an unrelated complaint.
  const base = resolveBaseUrl(descriptor, input.baseUrl);
  if ('error' in base) {
    return {
      ok: false,
      error: {
        refusal: base.error === 'base-url-missing' ? 'base-url-missing' : 'provider-invalid',
        message: refusalMessage(base.error, descriptor),
      },
    };
  }

  // 4. Resolve the path (direct vs relay) locally, before any bytes move. A relay that is
  //    configured but unusable raises here — it never downgrades to a direct request.
  let resolved: ResolvedRequest;
  try {
    resolved = resolveRequest(base.url, input.relay);
  } catch (cause) {
    const isRelay = cause instanceof RelayRoutingError && cause.kind === 'relay-invalid';
    const message = refusalMessage(isRelay ? 'relay-invalid' : 'provider-invalid', descriptor);
    return {
      ok: false,
      error: {
        refusal: isRelay ? 'relay-invalid' : 'provider-invalid',
        // `resolveRequest` already explains the cause precisely ("must use https", "must not contain
        // a username or password"). That sentence is the actionable half of the message and is safe
        // to show — it describes the URL shape, never the credential — so it is carried into the
        // remedy rather than discarded in favour of generic advice.
        message:
          cause instanceof Error && cause.message !== ''
            ? { ...message, remedy: `${cause.message} ${message.remedy}` }
            : message,
      },
    };
  }

  // 5. The credential field the descriptor actually requires.
  const requiredField = descriptor.credentialFields.find((f) => f.required);
  if (requiredField !== undefined && (input.credentials[requiredField.key] ?? '').trim() === '') {
    return {
      ok: false,
      error: {
        refusal: 'credential-missing',
        message: refusalMessage('credential-missing', descriptor),
      },
    };
  }

  // 6. Required request fields.
  if (input.capability === 'generate' && (input.request.prompt ?? '').trim() === '') {
    return {
      ok: false,
      error: { refusal: 'prompt-required', message: refusalMessage('prompt-required', descriptor) },
    };
  }
  if (input.capability === 'edit' && input.request.image === undefined) {
    return {
      ok: false,
      error: { refusal: 'image-required', message: refusalMessage('image-required', descriptor) },
    };
  }

  // 7. The estimate, computed from the local price table before the request. The UI has already
  //    shown this to the user; computing it here keeps the number attached to the request it priced.
  const estimate = await buildCostEstimate(
    descriptor,
    input.request.model,
    input.capability,
    1,
    deps.estimate ?? estimateRequestCost,
  );

  // 8. Only now does a request go out.
  const pathNote = describePath(resolved, new URL(resolved.providerUrl).host);
  try {
    const result = await runThroughAdapter(adapter, input, resolved, deps);
    if (!resultIsUsable(result, input.capability)) {
      // An adapter that returns an empty/placeholder result has NOT succeeded. Report it as the
      // failure it is rather than showing an empty image and calling it done.
      return {
        ok: false,
        error: {
          message: {
            class: 'provider-error',
            headline: `${descriptor.name} returned nothing usable`,
            detail:
              'The request completed but the response contained no ' +
              `${input.capability === 'describe' ? 'text' : 'image'}. Nothing is shown, because there is nothing to show.`,
            remedy:
              'Check the model matches the operation, then request again. Your provider may also have returned a job handle instead of a result.',
            actions: [{ href: descriptor.docsUrl, label: `${descriptor.name} API reference` }],
            severity: 'error',
          },
        },
      };
    }
    return {
      ok: true,
      value: {
        result,
        pathNote,
        usedPath: resolved.path,
        estimate,
        providerCostNote: result.usage?.providerCost,
      },
    };
  } catch (cause) {
    const { failureClass, status } = classifyFailure(cause);
    return { ok: false, error: { message: failureMessage(failureClass, descriptor, status) } };
  }
}

/** Resolve the base URL, distinguishing "missing" from "invalid". */
function resolveBaseUrl(
  descriptor: ProviderDescriptor,
  userBaseUrl: string,
): { url: string } | { error: 'base-url-missing' | 'provider-invalid' } {
  const trimmed = userBaseUrl.trim();
  if (trimmed === '') {
    if (descriptor.id === 'openai-compatible') {
      return { error: 'base-url-missing' };
    }
    return { url: descriptor.defaultBaseUrl };
  }
  // HTTPS only. `resolveRequest` (README §15.4) enforces the same rule on the direct leg and would
  // reject anything else a few lines below, so pre-judging it here keeps one answer rather than two.
  // A localhost http base URL is therefore refused as well: `openai-compatible`'s descriptor
  // advertises `http://localhost:11434/v1`, but P5-13's routing is the authority on what may carry a
  // credential, and loosening it for P5-15 would change a shared security primitive on the connect
  // pages as a side effect. Self-hosted servers reach a provider through the relay path instead.
  if (!trimmed.startsWith('https://')) {
    return { error: 'provider-invalid' };
  }
  // A query string or fragment on a *base URL* has no legitimate use here — the adapters append
  // their own paths — and it is where a key most often ends up by accident. Because the resolved
  // URL is echoed back in the path note, accepting one would print the secret back at the user.
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: 'provider-invalid' };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { error: 'provider-invalid' };
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    return { error: 'provider-invalid' };
  }
  return { url: trimmed.replace(/\/+$/u, '') };
}

/**
 * Map an HTTP status onto §17.3's failure classes.
 *
 * Adapters signal failure by throwing a plain `Error` with the status embedded in the message
 * (`"OpenAI auth failed (401): …"`), because the `EngineError` variants would otherwise force every
 * adapter to hand-roll them. Without this translation the 401 fell through to §17.3's catch-all, so
 * a user whose key was rejected was told the reason was "not specific" — the precise failure class
 * §17.3 exists to prevent.
 *
 * Only the status is used. The adapter's own message is never promoted, because it can quote the
 * provider's error body, which can echo the credential back.
 */
function classForStatus(status: number | undefined): FailureClass {
  // 403 is a permission problem with a different fix from a bad key, so §17.3 keeps them apart —
  // telling someone to re-copy a key that is fine costs an afternoon.
  if (status === 401) return 'rejected';
  if (status === 403) return 'forbidden';
  if (status === 402) return 'no-credits';
  if (status === 429) return 'rate-limited';
  // Anything else that reached us over HTTP is a provider-side failure, not ours.
  return 'provider-error';
}

/**
 * Classify a thrown value, recovering the status from its message when it carries one.
 *
 * §17.3's `classifyThrown` only recognises a `kind` property. This widens it to the common case of
 * an adapter's `Error`, so the same specific messages apply to real provider responses. A genuine
 * `unknown` still falls through to the catch-all, which is the honest answer when nothing is known.
 */
function classifyFailure(cause: unknown): {
  failureClass: FailureClass;
  status: number | undefined;
} {
  const status = statusOf(cause);
  const fromKind = classifyThrown(cause, status);
  if (fromKind !== 'unknown') return { failureClass: fromKind, status };
  if (status !== undefined) return { failureClass: classForStatus(status), status };
  return { failureClass: 'unknown', status: undefined };
}

/** Extract an HTTP status from a thrown error, when it carries one. */
function statusOf(cause: unknown): number | undefined {
  if (typeof cause === 'object' && cause !== null) {
    const record = cause as Record<string, unknown>;
    if (typeof record.status === 'number') return record.status;
    const match = /\((\d{3})\)/u.exec(String(record.message ?? ''));
    if (match) return Number.parseInt(match[1]!, 10);
  }
  return undefined;
}

/**
 * The transport the adapter's `AdapterContext.fetch` uses.
 *
 * `AdapterContext.fetch` is typed `typeof fetch`, so an adapter is entitled to a real `Response` —
 * `res.json()`, `res.headers.get()`, `res.text()`. `transportFetch` returns a `TransportResponse`
 * with a buffered `body` string and no methods, so it cannot be handed over directly: doing that
 * made every adapter that calls `res.json()` fail with `res.json is not a function`. This adapter
 * reconstitutes a real `Response` from the buffered result, which costs one copy of the body and
 * keeps the allowlist, timeout, and retry policy in one place.
 *
 * `allowedOrigins` covers the hop actually in use — the relay's origin when relaying, the provider's
 * when direct — so a relay cannot smuggle the key to an unlisted host and a direct request cannot be
 * rerouted through a relay.
 */
function runThroughAdapter(
  adapter: ProviderAdapter,
  input: GateInput,
  resolved: ResolvedRequest,
  deps: RunnerDeps,
): Promise<AiResult> {
  const fetchTransport = deps.fetchTransport ?? transportFetch;
  const transportOptions: TransportOptions = {
    allowedOrigins: [resolved.origin],
    maxRetries: 1,
    timeoutMs: 120_000,
    ...deps.transportOptions,
  };

  const instrumentedFetch = (async (url: string, init?: RequestInit): Promise<Response> => {
    const result = await fetchTransport(url, init, transportOptions);
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
    });
  }) as unknown as typeof fetch;

  // The relay token travels on the resolved request headers, never in the credential record and
  // never into the adapter body.
  const ctx = {
    credentials: input.credentials,
    baseUrl: resolved.url,
    signal: undefined,
    onProgress: undefined,
    fetch: instrumentedFetch,
  };

  return adapter.run(input.request, ctx);
}
