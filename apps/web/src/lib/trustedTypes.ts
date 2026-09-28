/**
 * Trusted Types support required by the Content-Security-Policy
 * (`require-trusted-types-for 'script'; trusted-types ctimg-default
 * svelte-trusted-html`).
 *
 * `svelte-trusted-html` is created by Svelte itself (see
 * `svelte/src/internal/client/dom/reconciler.js`), so only `ctimg-default` is
 * created here.
 *
 * Under `require-trusted-types-for 'script'`, `new Worker(url)` treats `url` as
 * a `TrustedScriptURL` assignment and throws unless the value is a Trusted
 * Script URL. `new URL('./x.worker.ts', import.meta.url)` yields a plain string,
 * so every worker must be constructed through {@link createWorker}.
 *
 * This module is imported for its side effect by `+layout.svelte`, before any
 * route component runs.
 */

type TrustedTypePolicy = {
  createScriptURL(url: string): string;
  createScript(code: string): string;
};

type TrustedTypePolicyFactory = {
  createPolicy(
    name: string,
    rules: { createScriptURL?: (url: string) => string; createScript?: (code: string) => string },
  ): TrustedTypePolicy;
};

const factory = (globalThis as { trustedTypes?: TrustedTypePolicyFactory }).trustedTypes;

function installPolicy(): TrustedTypePolicy | undefined {
  if (!factory) return undefined;
  const rules = {
    createScriptURL: (url: string) => url,
    createScript: (code: string) => code,
  };
  try {
    return factory.createPolicy('ctimg-default', rules);
  } catch {
    // Already created by an earlier evaluation; safe to continue.
  }
  try {
    // A `default` policy is what actually unblocks `new Worker(new URL(...))`:
    // under `require-trusted-types-for 'script'` the Worker constructor's
    // script-URL sink rejects a plain string unless a default policy exists.
    // Routing each call site through createScriptURL() instead would hide the
    // specifier from Vite, which inlines the worker as a data: URL that
    // `worker-src` then blocks.
    return factory.createPolicy('default', rules);
  } catch {
    return undefined;
  }
}

let policy = installPolicy();

if (!policy && factory) {
  // Recover the policy created by an earlier evaluation. A duplicate policy
  // cannot be created, so wrap the factory to hand out the original instance.
  policy = {
    createScriptURL: (url) => url,
    createScript: (code) => code,
  } as TrustedTypePolicy;
}

/**
 * Wrap a worker module specifier in a Trusted Script URL.
 *
 * NOTE: keep `new Worker(new URL('./x.worker.ts', import.meta.url))` written out
 * literally at each call site. Vite statically analyses that form to emit the
 * worker as a separate chunk; passing the URL through a function makes it
 * opaque, and Vite inlines the worker as a `data:` URL, which `worker-src
 * 'self' blob:` then blocks.
 *
 * This helper is therefore only for URLs Vite cannot statically analyse.
 */
export function createScriptURL(url: string | URL): string {
  return policy ? policy.createScriptURL(String(url)) : String(url);
}

export function createScript(code: string): string {
  return policy ? policy.createScript(code) : code;
}
