/**
 * Trusted Types — idempotent installation.
 * The CSP allows `ctimg-default`, `svelte-trusted-html`, `default`
 * but does not allow duplicates (`allow-duplicates` is absent).
 * We guard with a global symbol so reload/HMR never tries to recreate.
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
const INSTALLED_KEY = Symbol.for('ctimg-trusted-types-installed');

function getInstalled(): TrustedTypePolicy | undefined {
  return (globalThis as Record<symbol, unknown>)[INSTALLED_KEY] as TrustedTypePolicy | undefined;
}

function markInstalled(p: TrustedTypePolicy | undefined) {
  (globalThis as Record<symbol, unknown>)[INSTALLED_KEY] = p;
}

function installPolicy(): TrustedTypePolicy | undefined {
  const existing = getInstalled();
  if (existing !== undefined) return existing;
  if (!factory) {
    markInstalled(undefined);
    return undefined;
  }
  const rules = {
    createScriptURL: (url: string) => url,
    createScript: (code: string) => code,
  };
  try {
    const p = factory.createPolicy('ctimg-default', rules);
    try {
      factory.createPolicy('default', rules);
    } catch {
      /* already present */
    }
    markInstalled(p);
    return p;
  } catch {
    // Policy already exists from earlier evaluation or Svelte reconciler.
    // Recover with a wrapper; do not throw.
    const p = {
      createScriptURL: (url: string) => url,
      createScript: (code: string) => code,
    } as TrustedTypePolicy;
    markInstalled(p);
    return p;
  }
}

const policy = installPolicy();

export function createScriptURL(url: string | URL): string {
  return policy ? policy.createScriptURL(String(url)) : String(url);
}

export function createScript(code: string): string {
  return policy ? policy.createScript(code) : code;
}
