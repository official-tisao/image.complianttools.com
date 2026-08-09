const REDACTED = '[redacted]';

export interface DiagnosticInput {
  readonly appVersion: string;
  readonly engineVersion: string;
  readonly operation?: string;
  readonly errorKind?: string;
  readonly capabilities?: Readonly<Record<string, boolean>>;
}

export function redactText(value: string, credentials: readonly string[]): string {
  return credentials
    .filter((credential) => credential.length > 0)
    .reduce((safe, credential) => safe.split(credential).join(REDACTED), value);
}

export function createSafeLogger(
  sink: (message: string) => void,
  credentials: readonly string[],
): (message: unknown) => void {
  return (message) => {
    const serialized = typeof message === 'string' ? message : JSON.stringify(message);
    sink(redactText(serialized, credentials));
  };
}

export function safeErrorMessage(message: string, credentials: readonly string[]): string {
  return redactText(message, credentials);
}

export function createDiagnosticBundle(input: DiagnosticInput): string {
  // Deliberately reconstruct from an explicit field allowlist. Callers cannot
  // smuggle arbitrary state, headers, URLs, or credential stores into a bundle.
  return JSON.stringify(
    {
      appVersion: input.appVersion,
      engineVersion: input.engineVersion,
      ...(input.operation === undefined ? {} : { operation: input.operation }),
      ...(input.errorKind === undefined ? {} : { errorKind: input.errorKind }),
      ...(input.capabilities === undefined ? {} : { capabilities: input.capabilities }),
    },
    null,
    2,
  );
}
