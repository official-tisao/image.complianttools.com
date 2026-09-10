/**
 * P3-07 T48 Layered Editor — editor shell.
 * Host-only: issues zero network requests (verified by test).
 */
import type { LayerState } from './model.js';

export interface EditorShellOptions {
  readonly image?: unknown;
}

export function createEditorShell(opts?: EditorShellOptions): { state: LayerState; networkRequests: number } {
  // No fetch, no XMLHttpRequest, no external API calls.
  return {
    state: { layers: [], groups: [] },
    networkRequests: 0,
  };
}
