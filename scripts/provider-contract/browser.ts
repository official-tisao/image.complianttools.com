/**
 * P5-17 — the Playwright browser context that observes CORS for real.
 *
 * §22.7 is explicit that the live job runs "from a real browser context via Playwright so CORS
 * behaviour is genuinely observed", and §15.2 item 3 says the same. That is the whole reason this
 * file exists rather than a `fetch` call in Node:
 *
 * **A Node `fetch` cannot observe CORS, ever.** It has no `Origin` header, so the provider never sees
 * a preflight, never returns `Access-Control-Allow-Origin`, and the browser's response-blocking step
 * — the only thing that produces the failure a user would actually hit — is never involved. A Node
 * `200` means the key works. It says nothing about whether a page could make the same call. Writing a
 * `browserDirect` value from one would be §15.2 item 1's "guess" in its purest form.
 *
 * So each observation is a page that really runs `fetch`, and what comes back is whatever the browser
 * decided. The three possible endings are all meaningful and are reported as such:
 *
 * - A readable response (any status, including 401): the browser reached the provider. This is what
 *   proves the CORS policy permits the exchange.
 * - A thrown `TypeError`: the signature of a CORS block. Only read as a block when the same-origin
 *   control request succeeded, which is §15.2's disambiguation step.
 * - A control request that also failed: no verdict. The runner has no network, and nothing about this
 *   provider can be concluded.
 *
 * The control request is what makes a `no` a finding rather than a guess, and it is why the harness
 * cannot report a CORS block without having first proved the browser itself was working.
 */

import type { BrowserObservation } from './browser-probe.js';

/**
 * A same-origin page for the browser to run `fetch` from.
 *
 * `about:blank` has an opaque origin and no document for the request to be associated with, which
 * produces failures indistinguishable from a CORS block. A real same-origin HTTP document does not,
 * which is exactly why the control request is meaningful.
 */
export const CONTROL_ORIGIN =
  process.env['PROVIDER_CONTRACT_ORIGIN'] ?? 'https://image.complianttools.com';

/** A request the browser should attempt, with every credential already a placeholder. */
export interface BrowserProbeRequest {
  readonly providerId: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: string;
}

/**
 * What {@link observeInBrowser} needs. Declared structurally so a test can supply a fake browser and
 * a live run supplies Playwright's, with no branching on which is which.
 */
export interface BrowserLike {
  /** Evaluate `source` in a fresh page. Returns whatever the expression evaluates to, as JSON. */
  evaluate<T>(source: string): Promise<T>;
  close(): Promise<void>;
}

/**
 * The two Playwright surfaces this file uses, narrowed to what it calls.
 *
 * Declared locally rather than imported so the root `tsc` needs no Playwright types, and narrowed to
 * the four methods actually used so a change in Playwright's own API cannot silently widen what this
 * harness can do.
 */
interface PageLike {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  evaluate<T>(source: string): Promise<T>;
  close(): Promise<void>;
}

interface BrowserContextLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

/** The JSON shape the injected page script returns. */
interface RawObservation {
  readonly controlOk: boolean;
  readonly controlDetail: string;
  readonly completed: boolean;
  readonly status?: number;
  readonly failure?: string;
}

/**
 * The script the page evaluates.
 *
 * Kept as one string rather than a template literal built from parts so that what runs is exactly
 * what is reviewed here. It is passed the request as its argument, never interpolated into source, so
 * a URL containing a quote cannot become code.
 *
 * It performs the two requests a §15.2 classification needs and reports both outcomes. Note what it
 * does *not* do: it never reports a verdict of its own. Classification happens in
 * `./browser-probe.ts` from the raw facts, which keeps the decision logic testable without a browser.
 */
const PAGE_SCRIPT = `async (request) => {
  const control = async () => {
    try {
      const response = await fetch(request.controlUrl, { method: 'GET', mode: 'cors' });
      return { ok: true, detail: 'HTTP ' + response.status };
    } catch (error) {
      return { ok: false, detail: String(error && error.message ? error.message : error) };
    }
  };

  const controlResult = await control();

  try {
    const headers = {};
    for (const [name, value] of Object.entries(request.headers || {})) {
      if (typeof value === 'string' && value.length > 0) headers[name] = value;
    }
    const response = await fetch(request.url, {
      method: request.method,
      headers: headers,
      mode: 'cors',
    });
    return {
      controlOk: controlResult.ok,
      controlDetail: controlResult.detail,
      completed: true,
      status: response.status,
    };
  } catch (error) {
    return {
      controlOk: controlResult.ok,
      controlDetail: controlResult.detail,
      completed: false,
      failure: String(error && error.message ? error.message : error),
    };
  }
}`;

/**
 * Issue one request from a real browser context and report what the browser decided.
 *
 * Throws only when the browser itself cannot be used, which the caller records as a failure rather
 * than letting it escape.
 */
export async function observeInBrowser(
  browser: BrowserLike,
  request: BrowserProbeRequest,
): Promise<BrowserObservation> {
  const raw = await browser.evaluate<RawObservation>(
    `(${PAGE_SCRIPT})(${JSON.stringify({
      ...request,
      controlUrl: `${CONTROL_ORIGIN}/favicon.ico`,
    })})`,
  );

  const usedAuthHeader = Object.values(request.headers).some(
    (value) => typeof value === 'string' && value.length > 0,
  );

  return {
    source: 'playwright-chromium',
    sameOriginControlOk: raw.controlOk,
    completed: raw.completed,
    ...(raw.status === undefined ? {} : { status: raw.status }),
    ...(raw.failure === undefined ? {} : { failure: raw.failure }),
    usedAuthHeader,
  };
}

/**
 * Launch a Playwright Chromium and wrap it as a {@link BrowserLike}.
 *
 * The import is dynamic and its failure is reported rather than thrown, so a runner on a machine with
 * no browser installed produces a complete report full of `skipped` browser checks rather than a
 * crash. That matters because the job's contract is that a night with no browser still tells a reader
 * that the CORS posture was not checked — which is different from a night that says it was verified.
 */
export async function launchBrowser(): Promise<BrowserLike | undefined> {
  let chromium: { launch(options: { args: readonly string[] }): Promise<BrowserContextLike> };
  try {
    // Resolved through a computed specifier so the root `tsc` does not need a declaration for it:
    // `playwright-core` lives in the pnpm store as `@playwright/test`'s transitive dependency and is
    // not hoisted to the root `node_modules`, so a literal `import 'playwright-core'` would fail both
    // the typecheck and, depending on the layout, the resolution. The same pattern the gate scripts
    // use for the engine's built `dist/`.
    const specifier = 'playwright-core';
    const core = (await import(specifier)) as unknown as {
      chromium: { launch(options: { args: readonly string[] }): Promise<BrowserContextLike> };
    };
    chromium = core.chromium;
  } catch {
    return undefined;
  }
  let context: BrowserContextLike;
  try {
    context = await chromium.launch({ args: ['--no-sandbox'] });
  } catch {
    return undefined;
  }
  return {
    async evaluate<T>(source: string): Promise<T> {
      const page = await context.newPage();
      try {
        // A blank page still has a real, navigable origin once it is loaded, and `fetch` from it is
        // subject to the same-origin and CORS rules as any other page.
        await page.goto(`${CONTROL_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        return (await page.evaluate(source)) as T;
      } finally {
        await page.close();
      }
    },
    async close(): Promise<void> {
      await context.close();
    },
  };
}
