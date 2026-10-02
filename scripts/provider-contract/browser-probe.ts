/**
 * P5-17 — how the job decides what a provider's `browserDirect` value is (README §15.2, §22.7).
 *
 * §15.2 item 3 says the nightly job "calls every provider from a browser context and updates each
 * adapter's `browserDirect` field". The phrase that carries all the weight is **from a browser
 * context**. A Node-side `fetch` cannot answer the question at all: Node's `fetch` has no origin, so
 * the browser's preflight, and the provider's `Access-Control-Allow-Origin` response header, are never
 * consulted. A `200` from Node says the credential works and the endpoint exists — it says nothing
 * about whether a page could make the same call. Writing a `browserDirect` value from a Node result
 * would be the precise error §15.2 item 1 names as "probe, don't guess".
 *
 * So the classifier below consumes exactly one kind of evidence — an outcome observed by a real
 * browser context — and refuses to produce a verdict from anything else. {@link classifyBrowserOutcome}
 * is deliberately total: it takes a {@link BrowserObservation} and returns one of the four descriptor
 * values, and it has no branch that can produce a `yes` or a `no` from a Node-side signal, because
 * no such signal can be passed to it.
 *
 * The mapping, from §15.2 item 1's classification:
 *
 * | Observed in a browser | `browserDirect` |
 * | --- | --- |
 * | Request completed, response readable (2xx) | `yes` |
 * | Request completed, response readable, but the call needed an auth header | `yes-with-header` |
 * | Browser blocked it; the network panel shows the request was attempted | `no` |
 * | No verdict reachable (browser unavailable, origin unreachable, local-only network) | `unknown` |
 *
 * The third row is the one that needs care. A browser-side `TypeError: Failed to fetch` is the CORS
 * signature, and §15.2 says it is distinguishable in practice from genuine offline state — which is
 * why the job pairs it with a same-origin control request. The control is what makes a `no` a finding
 * rather than a guess, and it is why the runner cannot reach `no` without one.
 */

import type { BrowserProbeUnavailableReason } from './types.js';

/** What a real browser reported about one attempted request. */
export interface BrowserObservation {
  /** Which browser produced this. Only a real browser is ever passed in. */
  readonly source: 'playwright-chromium';
  /**
   * Whether a control request to our own origin succeeded.
   *
   * Without it, a `no` is indistinguishable from the runner having no network, and §15.2's
   * disambiguation rule would be unmet. A completed request that threw is therefore only read as a
   * CORS block when this is `true`.
   */
  readonly sameOriginControlOk: boolean;
  /** Whether the request completed with a readable response. */
  readonly completed: boolean;
  /** HTTP status when there was one. */
  readonly status?: number;
  /** The browser-level failure that prevented a response, if any. */
  readonly failure?: string;
  /**
   * Whether the request carried an authorization header.
   *
   * §15.2's `'yes-with-header'` is specifically the case where a browser *can* make the call but only
   * if the provider accepts the extra header — so the header has to be part of what was attempted,
   * not an assumption about the provider.
   */
  readonly usedAuthHeader: boolean;
}

/** The outcome the classifier produces, plus how it reached it. */
export interface BrowserClassification {
  readonly browserDirect: 'yes' | 'yes-with-header' | 'no' | 'unknown';
  readonly detail: string;
  readonly unavailable?: BrowserProbeUnavailableReason;
}

/**
 * Turn one browser observation into a `browserDirect` value.
 *
 * Total by construction: every {@link BrowserObservation} yields a verdict, because "I could not
 * tell" is a verdict and is available explicitly rather than being expressed as an absence. A
 * classifier with an implicit undefined return would let a caller write `undefined` into a
 * descriptor.
 */
export function classifyBrowserOutcome(observation: BrowserObservation): BrowserClassification {
  if (observation.completed) {
    const status = observation.status ?? 0;
    // An auth or permission status is still a completed request whose response the browser was
    // allowed to read: the CORS policy permitted the exchange. The credential is what failed, and
    // `test()` is the check that owns credential problems. Reporting `no` here would tell a user
    // their browser cannot make the call when in fact the call arrived and was rejected on
    // authentication — the §15.2 failure mode of mistaking a provider problem for a browser one.
    if (status === 0) {
      return {
        browserDirect: 'unknown',
        detail: 'browser reported completion without a status',
        unavailable: 'context-unavailable',
      };
    }
    return {
      browserDirect: observation.usedAuthHeader ? 'yes-with-header' : 'yes',
      detail: `browser completed the request with status ${status}; the response was readable`,
    };
  }

  // The request did not complete. §15.2: a CORS block shows the request was attempted while `fetch`
  // rejects with a TypeError. The control request rules out "the runner has no network at all".
  if (observation.sameOriginControlOk && observation.failure) {
    return {
      browserDirect: 'no',
      detail: `browser could not complete the request (${observation.failure}) while a same-origin control request succeeded, which is the CORS signature`,
    };
  }

  if (!observation.sameOriginControlOk) {
    return {
      browserDirect: 'unknown',
      detail:
        'no verdict: the same-origin control request also failed, so the runner cannot tell a CORS block from a general network failure',
      unavailable: 'origin-unreachable',
    };
  }

  return {
    browserDirect: 'unknown',
    detail: 'no verdict: the browser reported no response and no failure reason',
    unavailable: 'context-unavailable',
  };
}

/**
 * A provider the job must not probe for CORS at all, with the reason.
 *
 * `openai-compatible` points at `http://localhost:11434/v1`. A Playwright context in CI runs on the
 * runner, and "localhost" from the browser's point of view is the same machine — so a probe would be
 * testing a server that is not running and would produce a `no` that says nothing about the user's
 * own server. Its descriptor note already says the answer depends on the user's server, and this
 * map keeps that honest instead of overwriting it.
 */
export const BROWSER_UNPROBEABLE: Readonly<Record<string, BrowserProbeUnavailableReason>> = {
  'openai-compatible': 'unsupported-network',
};
