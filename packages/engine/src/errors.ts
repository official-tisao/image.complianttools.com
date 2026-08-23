import type { EngineError, FormatId } from './types.js';

export function isEngineError(value: unknown): value is EngineError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === 'string' &&
    typeof (value as { remedy?: unknown }).remedy === 'string'
  );
}

export function decodeFailed(format: FormatId, cause: unknown): EngineError {
  if (isEngineError(cause)) return cause;
  return {
    kind: 'decode-failed',
    format,
    detail: cause instanceof Error ? cause.message : String(cause),
    remedy: `Choose a valid, non-corrupted ${format.toUpperCase()} file or convert it with the application that created it.`,
  };
}

export async function decodeWithTypedErrors<T>(
  format: FormatId,
  decode: () => T | Promise<T>,
): Promise<T> {
  try {
    return await decode();
  } catch (cause) {
    throw decodeFailed(format, cause);
  }
}

/**
 * Gives synchronous, user-triggered engine operations the same remediable error
 * contract as codec decoders. Keep the original detail for diagnostics while
 * supplying a concrete recovery action to every caller.
 */
export function withTypedEngineErrors<T>(operation: string, remedy: string, run: () => T): T {
  try {
    return run();
  } catch (cause) {
    if (isEngineError(cause)) throw cause;
    throw {
      kind: 'internal',
      detail: `${operation}: ${cause instanceof Error ? cause.message : String(cause)}`,
      remedy,
    } satisfies EngineError;
  }
}

export function engineErrorMessage(error: unknown): string {
  if (!isEngineError(error)) return error instanceof Error ? error.message : String(error);
  if (error.kind === 'decode-failed' || error.kind === 'internal') return error.detail;
  if (error.kind === 'codec-unavailable') return error.reason;
  return error.remedy;
}
