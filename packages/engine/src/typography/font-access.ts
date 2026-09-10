/**
 * P3-08 T49 Typography — font loading support (self-hosted + upload + Local Font Access API guard).
 */

export interface FontLoadResult {
  family: string;
  available: boolean;
  source: 'self-hosted' | 'upload' | 'local-access-api' | 'system';
}

/** Probes if the browser supports the Local Font Access API. */
export function hasLocalFontAccess(): boolean {
  return typeof (globalThis as unknown).queryLocalFonts === 'function';
}

/** Guards against CSS `local()` lookups that could embed licensed fonts. */
export function hasLocalCssLookup(fontFamily: string): boolean {
  const lower = fontFamily.toLowerCase();
  return lower.includes('local(') || lower.includes('local (');
}

/** Minimal font loader for self-hosted / uploaded fonts. */
export async function loadFontFamily(name: string, source?: string): Promise<FontLoadResult> {
  // v1: always reports self-hosted availability; actual font loading deferred to browser @font-face.
  return { family: name, available: true, source: source ? 'upload' : 'self-hosted' };
}
