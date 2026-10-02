/**
 * P5-17 — credential redaction for every artifact the contract job produces (README §13.5 item 6).
 *
 * The rule this module exists to enforce is blunt: **a credential value must not reach a log line, an
 * artifact, an issue body, a pull-request body, or a generated document.** The nightly job is the
 * worst possible place to relax that, because it runs unattended, handles a secret for every
 * provider, and writes its findings to places people read and search later.
 *
 * Two properties matter more than the substitution itself:
 *
 * 1. **Redaction is total, not best-effort.** Every string that leaves the runner goes through
 *    {@link redactText}. Callers do not get an unredacted path, so a new call site cannot forget.
 * 2. **A provider's error text is untrusted.** A 401 body can echo the submitted key back. The
 *    redaction list is therefore the actual live secret values, not a pattern that guesses what a
 *    key looks like — the engine's `test-api-key-123` placeholder approach cannot help here, because
 *    these are real credentials read from repository secrets.
 *
 * A note on why this does not reuse `packages/engine/src/security/redaction.ts` directly: that
 * module's `redactText` takes an explicit credential list and is used inside the engine, which never
 * sees the job's secrets. Duplicating the three-line substitution rather than adding a dependency
 * from a root script into a built package keeps the runner runnable before `dist/` exists, which is
 * the state it must work in when the workflow first builds it. The behaviour is pinned by
 * `test-provider-contract-gate.ts` so the two cannot diverge.
 */

/** The placeholder that replaces a credential. Matches the engine's, so output reads the same. */
export const REDACTED = '[redacted]';

/**
 * Credential values to strip, held in one place so a caller cannot pass a list that omits a secret
 * that is actually in play.
 */
export interface SecretSet {
  /** Every non-empty credential value across every provider in this run. */
  readonly values: readonly string[];
}

/**
 * Build a {@link SecretSet} from provider credential maps.
 *
 * Accepts the raw `Record<string, string>` shape an adapter's `AdapterContext` carries so the
 * caller does not have to know which key holds the secret. Non-string and empty values are dropped
 * rather than redacted — replacing the empty string would corrupt every string in the output.
 */
export function secretSetFrom(
  credentialsByProvider: Readonly<Record<string, Readonly<Record<string, string>>>>,
): SecretSet {
  const values = new Set<string>();
  for (const credentials of Object.values(credentialsByProvider)) {
    for (const value of Object.values(credentials)) {
      if (typeof value === 'string' && value.length > 0) values.add(value);
    }
  }
  return { values: [...values] };
}

/**
 * Replace every credential value in `value` with {@link REDACTED}.
 *
 * Also redacts the `baseUrl` values this job is given, because a self-hosted provider can be
 * pointed at a gateway whose URL embeds a token (`https://host/v1?key=sk-...`), and a URL is a
 * string that ends up in reports by construction.
 */
export function redactText(value: string, secrets: SecretSet): string {
  let safe = value;
  for (const secret of secrets.values) {
    // `split`/`join` rather than a RegExp: a credential can contain regex metacharacters, and a
    // pattern built by interpolation would either throw or match something other than the secret.
    safe = safe.split(secret).join(REDACTED);
  }
  return safe;
}

/**
 * A logger that redacts everything it is given.
 *
 * The sink is the only exit. Returning this rather than exposing a bare function means every
 * `console.log` in the runner goes through one object, and a test can assert on captured output
 * without reaching into globals.
 */
export function createRedactingLogger(
  sink: (line: string) => void,
  secrets: SecretSet,
): { log: (message: unknown) => void } {
  return {
    log(message: unknown): void {
      const serialized = typeof message === 'string' ? message : safeStringify(message);
      sink(redactText(serialized, secrets));
    },
  };
}

/**
 * `JSON.stringify` that cannot throw on a cycle or a BigInt.
 *
 * A redaction step that throws while handling an error is a redaction step that gets removed, so
 * this degrades to a marker instead of propagating.
 */
function safeStringify(message: unknown): string {
  try {
    return JSON.stringify(message) ?? String(message);
  } catch {
    return String(message);
  }
}

/**
 * Redact a URL for display, keeping origin and path but stripping userinfo and query values.
 *
 * Providers and self-hosted gateways put keys in query strings far more often than anyone would
 * like, and the job prints full request URLs. A credential in a query is redacted by value here as
 * well as by {@link redactText}, so this is belt and braces rather than the only defence.
 */
export function redactUrl(rawUrl: string, secrets: SecretSet): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return redactText(rawUrl, secrets);
  }
  parsed.username = '';
  parsed.password = '';
  // Keep the shape of the query so a reader can still see a key was passed, without its value.
  const redactedParams = [...parsed.searchParams.keys()].map((key) => `${key}=${REDACTED}`);
  parsed.search = redactedParams.length > 0 ? `?${redactedParams.join('&')}` : '';
  return redactText(parsed.toString(), secrets);
}
