/**
 * P5-14 — the §17.3 failure-class messages.
 *
 * §17.3's central requirement is that failure is "equally specific, one message per failure class".
 * That is a contract, not a style preference: a user who is told "something went wrong" cannot act,
 * and an inscrutable failure is the single most common way a BYOK tool loses a user.
 *
 * So this file is a lookup from the engine's **actual** error taxonomy — the `ai-*` members of
 * `EngineError` in `packages/engine/src/types.ts` — to a specific, actionable message, plus the
 * browser-side CORS class that the transport reports separately. Every class has a distinct
 * headline, because a message that could be swapped with another message without the user noticing
 * is not specific and has failed its job.
 *
 * The classes and what they mean:
 *
 * | class             | engine kind           | what actually happened                       |
 * |-------------------|-----------------------|---------------------------------------------|
 * | `rejected`        | `ai-auth-failed`      | the provider refused the credential (401)    |
 * | `forbidden`       | `ai-auth-failed` 403  | the key is valid but not permitted           |
 * | `not-configured`  | `ai-not-configured`   | no credential/base URL has been supplied     |
 * | `cors-blocked`    | `ai-cors-blocked`     | the browser blocked the request pre-flight   |
 * | `no-credits`      | `ai-provider-error`   | authenticated, but the balance is zero        |
 * | `rate-limited`    | `ai-rate-limited`     | the provider's rate limit, not ours          |
 * | `unreachable`     | transport `unreachable` | DNS/TLS/connection failure, no HTTP response |
 * | `provider-error`  | `ai-provider-error`   | the provider returned an error we can relay  |
 * | `unsupported`     | `unsupported-format`  | capability/format the adapter cannot do      |
 * | `unknown`         | anything else         | the catch-all, and it says so                |
 */

import type { EngineError } from '@complianttools/image-engine/types';
import type { ProviderDescriptor } from '@complianttools/image-engine/ai/types';

export type FailureClass =
  | 'rejected'
  | 'forbidden'
  | 'not-configured'
  | 'cors-blocked'
  | 'no-credits'
  | 'rate-limited'
  | 'unreachable'
  | 'provider-error'
  | 'unsupported'
  | 'cancelled'
  | 'unknown';

export type FailureMessage = {
  readonly class: FailureClass;
  /** Short label in the alert, e.g. "Key rejected". */
  readonly headline: string;
  /** The specific sentence naming the actual cause. */
  readonly detail: string;
  /** What the user can do about it. Always present. */
  readonly remedy: string;
  /** Links offered alongside the remedy. */
  readonly actions: readonly { href: string; label: string }[];
  /** How the message should read: an error to act on, or a warning with a way forward. */
  readonly severity: 'error' | 'warning';
};

/** The exact key prefix a user is most likely to have truncated. */
function keyPrefixHint(descriptor: ProviderDescriptor): string {
  const placeholder = descriptor.credentialFields.find((f) => f.secret && f.required)?.placeholder;
  if (!placeholder) return '';
  const prefix = placeholder.replace(/\.\.\.$/u, '').replace(/^not-needed$/u, '');
  return prefix ? `, including the ${prefix} prefix` : '';
}

/**
 * Classify an engine error. Kept separate from the message text so the tests can assert the
 * classification independently of the prose — the taxonomy is the part that has to be right.
 */
export function classify(error: Pick<EngineError, 'kind'>, status?: number): FailureClass {
  switch (error.kind) {
    case 'ai-auth-failed':
      // The taxonomy does not distinguish 401 from 403, so the status does. A 403 is a real
      // permission problem with a different fix, and telling a user to re-copy their key when
      // the key is fine is the kind of wrong that costs an afternoon.
      return status === 403 ? 'forbidden' : 'rejected';
    case 'ai-not-configured':
      return 'not-configured';
    case 'ai-cors-blocked':
      return 'cors-blocked';
    case 'ai-rate-limited':
      return 'rate-limited';
    case 'cancelled':
      return 'cancelled';
    case 'unsupported-format':
      return 'unsupported';
    case 'ai-provider-error':
      // A zero balance is the single most common provider-side failure and has its own fix, so
      // it is separated from the general provider error rather than folded into it.
      return status === 402 || status === 403 ? 'no-credits' : 'provider-error';
    default:
      return 'unknown';
  }
}

/**
 * Build the message for a failure class.
 *
 * `detail` names the provider and the actual cause. `remedy` is always something the user can do.
 * Neither ever contains the credential.
 */
export function failureMessage(
  failureClass: FailureClass,
  descriptor: ProviderDescriptor,
  status?: number,
): FailureMessage {
  const name = descriptor.name;
  const prefix = keyPrefixHint(descriptor);
  const relay: { href: string; label: string } = {
    href: '/connect-ai/relay',
    label: 'Deploy a relay',
  };
  const other: { href: string; label: string } = {
    href: '/connect-ai#chooser',
    label: 'Pick a different provider',
  };

  switch (failureClass) {
    case 'rejected':
      return {
        class: failureClass,
        headline: 'That key was rejected',
        detail: `${name} returned HTTP ${status ?? 401} — it did not accept the credential.`,
        remedy: `Copy the whole key again${prefix}, with no spaces before or after. A key created seconds ago can take a moment to become active; if it has been a while, create a new one and try that.`,
        actions: [{ href: descriptor.keysUrl, label: `Open ${name}’s key page` }],
        severity: 'error',
      };
    case 'forbidden':
      return {
        class: failureClass,
        headline: 'That key is valid but not permitted',
        detail: `${name} returned HTTP ${status ?? 403}. The credential was accepted; this account is not allowed to use the API.`,
        remedy: `Check that the API is enabled for this account and that the key belongs to the project or organisation you think it does. The key is fine — the permission behind it is not.`,
        actions: [{ href: descriptor.keysUrl, label: `Check ${name}’s account` }],
        severity: 'error',
      };
    case 'not-configured':
      return {
        class: failureClass,
        headline: 'No provider is connected yet',
        detail: 'Nothing was sent, because there was nothing to send it with.',
        remedy: `Paste a ${name} key above, or point at a server you run yourself. Nothing on this page sends a request until you do.`,
        actions: [],
        severity: 'warning',
      };
    case 'cors-blocked':
      return {
        class: failureClass,
        headline: 'Your browser cannot reach this provider directly',
        detail: `${name} does not allow calls from a web page, so the browser stopped the request before it left. This is a restriction on their side, and your key is not the problem.`,
        remedy: `Deploying your own relay forwards the call for you and takes about two minutes. Alternatively, pick a provider that answers browsers directly.`,
        actions: [relay, other],
        severity: 'warning',
      };
    case 'no-credits':
      return {
        class: failureClass,
        headline: 'Connected, but this account has no credit',
        detail: `${name} accepted the key and refused the work — the account has nothing left to spend.`,
        remedy: `Add credit or a payment method with ${name}, then test again. The key did its job; the account is empty.`,
        actions: [{ href: descriptor.pricingUrl, label: `${name} billing` }],
        severity: 'warning',
      };
    case 'rate-limited':
      return {
        class: failureClass,
        headline: 'This is your provider’s rate limit, not ours',
        detail: `${name} is refusing requests for now. There is no queue here and no limit of ours being hit — the request is being stopped at the provider.`,
        remedy:
          'Wait for the limit to reset, or reduce how many images you send at once. Every other client of this provider is subject to the same limit.',
        actions: [{ href: descriptor.docsUrl, label: `${name} rate limits` }],
        severity: 'warning',
      };
    case 'unreachable':
      return {
        class: failureClass,
        headline: 'The request never reached a server',
        detail:
          'There was no HTTP response at all, so the host did not resolve, the connection was refused, or the TLS handshake failed. Nothing was billed.',
        remedy:
          'Check the base URL and that the server is running, then test it directly with curl before trying again here.',
        actions: [],
        severity: 'error',
      };
    case 'provider-error':
      return {
        class: failureClass,
        headline: `${name} returned an error`,
        detail: `${name} replied with HTTP ${status ?? 'an error'}. The request reached them and was refused on their side.`,
        remedy:
          'The most common causes are an unsupported image size or format, or a model your account cannot use. Try a smaller image, or pick a different model from the list.',
        actions: [{ href: descriptor.docsUrl, label: `${name} API reference` }],
        severity: 'error',
      };
    case 'unsupported':
      return {
        class: failureClass,
        headline: 'This provider does not do that',
        detail: `${name} does not implement the operation this tool needs.`,
        remedy:
          'Choose a provider whose capabilities include this one — the chooser table lists what each adapter actually declares.',
        actions: [other],
        severity: 'error',
      };
    case 'cancelled':
      return {
        class: failureClass,
        headline: 'Cancelled before it was sent',
        detail: 'The request was stopped before it completed, so nothing was billed.',
        remedy: 'Run it again when you are ready.',
        actions: [],
        severity: 'warning',
      };
    default:
      return {
        class: 'unknown',
        headline: 'That did not work, and the reason is not specific',
        detail: `The request to ${name} failed in a way that does not match a known failure class, so this message is the general one.`,
        remedy:
          'Try again. If it keeps failing, the provider’s API reference is the right place to check what this endpoint expects.',
        actions: [{ href: descriptor.docsUrl, label: `${name} API reference` }],
        severity: 'error',
      };
  }
}

/** Map a thrown value to a class without assuming it is an `EngineError`. */
export function classifyThrown(cause: unknown, status?: number): FailureClass {
  if (typeof cause === 'object' && cause !== null && 'kind' in cause) {
    return classify(cause as Pick<EngineError, 'kind'>, status);
  }
  return 'unknown';
}

/**
 * The success message from §17.3, built from what the adapter actually confirmed.
 *
 * §17.3 shows "Found 34 models. Confirmed: Generate, Edit, Inpaint, Describe." The model count
 * comes from a real `listModels()` result and the capability list from what `test()` returned —
 * never from the descriptor. The OpenAI-compatible adapter in particular probes rather than
 * assumes, so a server that answers `/models` and nothing else must be described as such.
 */
export function successMessage(
  descriptor: ProviderDescriptor,
  confirmed: readonly string[],
  modelCount: number | undefined,
  free: boolean,
): { headline: string; detail: string; confirmed: readonly string[] } {
  const confirmedText =
    confirmed.length > 0
      ? `Confirmed: ${confirmed.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(', ')}.`
      : 'The key works. This provider did not confirm which operations your account can run, so capabilities will be discovered per operation.';
  const modelText =
    modelCount === undefined
      ? ''
      : modelCount === 0
        ? 'The server returned no models.'
        : `Found ${modelCount} model${modelCount === 1 ? '' : 's'}.`;
  return {
    headline: `Connected to ${descriptor.name}.`,
    detail: `${modelText}${modelText ? ' ' : ''}${confirmedText}${free ? ' This test was free — no image was generated.' : ''}`,
    confirmed,
  };
}
