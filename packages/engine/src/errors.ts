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

export function engineErrorMessage(error: unknown): string {
  if (!isEngineError(error)) return error instanceof Error ? error.message : String(error);
  if (error.kind === 'decode-failed' || error.kind === 'internal') return error.detail;
  if (error.kind === 'codec-unavailable') return error.reason;
  return error.remedy;
}
